import type { ShuttlecockState } from '../physics/shuttlecock'
import type { ShotType } from './shotSynthesis'
import {
  MAX_CONTACT_ERROR,
  distance3,
  getShuttleCorkCenter,
  type RacketContactPose,
  type Vec3,
} from './racketKinematics'
import { solveTargetedShot } from './shotTargeting'

export type ContactTiming = 'early' | 'perfect' | 'good' | 'late' | 'miss'
export type ContactOutcome = 'hit' | 'miss'
export type ContactTechnique = ShotType | 'AUTO'

export interface ContactInput {
  intent: ContactTechnique
  playerPos: Vec3
  playerSide: 0 | 1
  power: number
  racket: RacketContactPose
  racketFaceDeg: number
  shuttle: ShuttlecockState
  swingOffsetMs: number
  target?: Vec3
  targetZ: number
  slice?: boolean
  /** The caller may wait for better contact without calculating an outgoing flight. */
  minQuality?: number
}

export interface ContactResult {
  contactError: number
  contactPoint: Vec3
  idealPoint: Vec3
  landingPoint: Vec3
  launchPoint: Vec3
  netClearance: number | null
  outcome: ContactOutcome
  outgoingSpin: Vec3
  outgoingVel: Vec3
  quality: number
  reachable: boolean
  reason: string
  shuttleCorkCenter: Vec3
  sweetSpot: number
  target: Vec3
  targetError: number
  technique: ShotType | null
  techniqueFit: number
  timing: ContactTiming
  timingScore: number
}

interface TechniqueProfile {
  baseSpeed: number
  elevationDeg: number
  faceDeg: number
  height: number
  heightTolerance: number
  reach: number
  reachTolerance: number
  targetX: number
}

const COURT = {
  halfLength: 6.7,
  halfWidth: 3.05,
  netGap: 0.1,
} as const

const TIMING = {
  perfectMs: 38,
  goodMs: 105,
  lateMs: 190,
  missMs: 360,
} as const

/** Keep the 5cm sweet spot; an 18cm assist catches near misses with reduced quality. */
export const MAX_PLAYABLE_CONTACT_ERROR = 0.18

const TECHNIQUES: Record<ShotType, TechniqueProfile> = {
  SMASH: {
    baseSpeed: 42, elevationDeg: -8, faceDeg: -18,
    height: 2.25, heightTolerance: 0.55, reach: 0.55, reachTolerance: 0.55, targetX: 4.55,
  },
  CLEAR: {
    baseSpeed: 28, elevationDeg: 42, faceDeg: 18,
    height: 1.82, heightTolerance: 0.44, reach: 0.68, reachTolerance: 0.46, targetX: 5.95,
  },
  DRIVE: {
    baseSpeed: 24, elevationDeg: 18, faceDeg: 0,
    height: 1.25, heightTolerance: 0.34, reach: 0.76, reachTolerance: 0.42, targetX: 4.35,
  },
  DROP: {
    baseSpeed: 13, elevationDeg: 26, faceDeg: 12,
    height: 1.72, heightTolerance: 0.42, reach: 0.7, reachTolerance: 0.44, targetX: 1.15,
  },
  NET_DROP: {
    baseSpeed: 7.5, elevationDeg: 68, faceDeg: 8,
    height: 0.88, heightTolerance: 0.28, reach: 0.45, reachTolerance: 0.34, targetX: 0.65,
  },
  LIFT: {
    baseSpeed: 20, elevationDeg: 55, faceDeg: 24,
    height: 0.92, heightTolerance: 0.36, reach: 0.56, reachTolerance: 0.4, targetX: 5.7,
  },
}

const ORDERED_TECHNIQUES: ShotType[] = ['SMASH', 'CLEAR', 'DRIVE', 'DROP', 'NET_DROP', 'LIFT']

/** @entry 以实际拍弦中心、球塞中心和同一落点解算器判定一次击球。 */
export function evaluateContact(input: ContactInput): ContactResult {
  const shuttleCorkCenter = getShuttleCorkCenter(input.shuttle.pos, input.shuttle.vel)
  const contactError = distance3(shuttleCorkCenter, input.racket.stringCenter)
  const timing = classifyTiming(input.swingOffsetMs)
  const timingScore = timingToScore(timing, input.swingOffsetMs)
  const technique = resolveTechnique(input, shuttleCorkCenter)
  const profile = TECHNIQUES[technique]
  const idealPoint = idealContactPoint(input.playerPos, input.playerSide, technique)
  const sweetSpot = contactError <= MAX_CONTACT_ERROR ? clamp01(1 - contactError / MAX_CONTACT_ERROR * 0.35)
    : 0.65 * clamp01(1 - (contactError - MAX_CONTACT_ERROR) / (MAX_PLAYABLE_CONTACT_ERROR - MAX_CONTACT_ERROR))
  const techniqueFit = computeTechniqueFit(input, technique, shuttleCorkCenter)
  const faceScore = computeFaceScore(input.racketFaceDeg, profile.faceDeg)
  const quality = clamp01(timingScore * sweetSpot * techniqueFit * faceScore)
  const target = resolveTarget(input, technique)

  if (!input.racket.reachable && !isPlayableRacketContact(input.racket, shuttleCorkCenter)) {
    return missResult(input, { contactError, idealPoint, shuttleCorkCenter, sweetSpot, target, technique, techniqueFit, timing, timingScore }, 'unreachable')
  }
  if (timing === 'miss') {
    return missResult(input, { contactError, idealPoint, shuttleCorkCenter, sweetSpot, target, technique, techniqueFit, timing, timingScore }, 'timing')
  }
  if (contactError > MAX_PLAYABLE_CONTACT_ERROR) {
    return missResult(input, { contactError, idealPoint, shuttleCorkCenter, sweetSpot, target, technique, techniqueFit, timing, timingScore }, 'racket contact')
  }
  if (techniqueFit < 0.18) {
    return missResult(input, { contactError, idealPoint, shuttleCorkCenter, sweetSpot, target, technique, techniqueFit, timing, timingScore }, 'technique reach')
  }
  if (quality < (input.minQuality ?? 0)) {
    return missResult(input, { contactError, idealPoint, shuttleCorkCenter, sweetSpot, target, technique, techniqueFit, timing, timingScore }, 'quality')
  }

  const outgoingSpin: Vec3 = [0, input.slice ? 105 : 22 + quality * 24, input.playerSide === 0 ? -3 : 3]
  const maxSpeed = profile.baseSpeed
    * (0.52 + clamp01(input.power) * 0.48)
    * (0.58 + quality * 0.42) * (input.slice ? 0.86 : 1)
  const elevationDeg = profile.elevationDeg + (input.racketFaceDeg - profile.faceDeg) * 0.65
    + (input.slice && technique === 'CLEAR' ? 7 : input.slice && technique === 'DROP' ? 4 : 0)
  const solution = solveTargetedShot({
    corkCenter: input.racket.stringCenter,
    elevationDeg,
    maxSpeed,
    spin: outgoingSpin,
    target,
  })

  return {
    contactError,
    contactPoint: [...input.racket.stringCenter],
    idealPoint,
    landingPoint: solution.landingPoint,
    launchPoint: solution.launchPoint,
    netClearance: solution.netClearance,
    outcome: 'hit',
    outgoingSpin,
    outgoingVel: solution.outgoingVel,
    quality,
    reachable: true,
    reason: describeQuality(timing, sweetSpot, techniqueFit, solution.netClearance),
    shuttleCorkCenter,
    sweetSpot,
    target,
    targetError: solution.targetError,
    technique,
    techniqueFit,
    timing,
    timingScore,
  }
}

export function idealContactPoint(playerPos: Vec3, playerSide: 0 | 1, technique: ShotType): Vec3 {
  const forward = playerSide === 0 ? 1 : -1
  const profile = TECHNIQUES[technique]
  return [playerPos[0] + forward * profile.reach, playerPos[1] + profile.height, playerPos[2]]
}

export function getTechniqueRacketFaceDeg(technique: ShotType): number {
  return TECHNIQUES[technique].faceDeg
}

export function isPlayableRacketContact(racket: RacketContactPose, shuttleCorkCenter: Vec3): boolean {
  return distance3(racket.stringCenter, shuttleCorkCenter) <= MAX_PLAYABLE_CONTACT_ERROR
}

export function resolveContactGrip(playerPos: Vec3, playerSide: 0 | 1, contactPoint: Vec3): 'forehand' | 'backhand' {
  const forward = playerSide === 0 ? 1 : -1
  return (contactPoint[2] - playerPos[2]) * forward < -0.25 ? 'backhand' : 'forehand'
}

function resolveTechnique(input: ContactInput, contactPoint: Vec3): ShotType {
  if (input.intent !== 'AUTO') return input.intent

  let best: ShotType = 'DRIVE'
  let bestScore = -Infinity
  for (const technique of ORDERED_TECHNIQUES) {
    const score = computeTechniqueFit(input, technique, contactPoint)
    if (score > bestScore) {
      best = technique
      bestScore = score
    }
  }
  return best
}

function computeTechniqueFit(input: ContactInput, technique: ShotType, contactPoint: Vec3): number {
  const profile = TECHNIQUES[technique]
  const forward = input.playerSide === 0 ? 1 : -1
  const reach = (contactPoint[0] - input.playerPos[0]) * forward
  const localHeight = contactPoint[1] - input.playerPos[1]
  const heightFit = 1 - Math.abs(localHeight - profile.height) / profile.heightTolerance
  const reachFit = 1 - Math.abs(reach - profile.reach) / profile.reachTolerance
  const incomingDown = input.shuttle.vel[1] < -0.5
  const smashBonus = technique === 'SMASH' && incomingDown ? 0.12 : 0
  const lowBonus = (technique === 'LIFT' || technique === 'NET_DROP') && localHeight < 1.15 ? 0.1 : 0
  return clamp01(clamp01(heightFit) * 0.62 + clamp01(reachFit) * 0.38 + smashBonus + lowBonus)
}

function resolveTarget(input: ContactInput, technique: ShotType): Vec3 {
  if (input.target) {
    const opponentForward = input.playerSide === 0 ? 1 : -1
    return [
      opponentForward * clamp(Math.abs(input.target[0]), COURT.netGap, COURT.halfLength - 0.2),
      0,
      clamp(input.target[2], -COURT.halfWidth + 0.15, COURT.halfWidth - 0.15),
    ]
  }
  const forward = input.playerSide === 0 ? 1 : -1
  return [
    forward * clamp(TECHNIQUES[technique].targetX, COURT.netGap, COURT.halfLength - 0.25),
    0,
    clamp(input.targetZ, -COURT.halfWidth + 0.2, COURT.halfWidth - 0.2),
  ]
}

function classifyTiming(offsetMs: number): ContactTiming {
  const abs = Math.abs(offsetMs)
  if (abs <= TIMING.perfectMs) return 'perfect'
  if (abs <= TIMING.goodMs) return 'good'
  if (abs <= TIMING.missMs) return offsetMs < 0 ? 'early' : 'late'
  return 'miss'
}

function timingToScore(timing: ContactTiming, offsetMs: number): number {
  if (timing === 'miss') return 0
  const abs = Math.abs(offsetMs)
  if (timing === 'perfect') return 1
  if (timing === 'good') return 0.88 - (abs - TIMING.perfectMs) / 520
  return 0.58 - Math.min(abs - TIMING.goodMs, TIMING.lateMs) / 520
}

function computeFaceScore(actualDeg: number, idealDeg: number): number {
  return clamp01(1 - Math.abs(actualDeg - idealDeg) / 90)
}

type MissContext = Pick<ContactResult,
  'contactError' | 'idealPoint' | 'shuttleCorkCenter' | 'sweetSpot' | 'target'
  | 'techniqueFit' | 'timing' | 'timingScore'> & { technique: ShotType }

function missResult(input: ContactInput, context: MissContext, reason: string): ContactResult {
  return {
    ...context,
    contactPoint: [...input.racket.stringCenter],
    landingPoint: [...input.shuttle.pos],
    launchPoint: [...input.shuttle.pos],
    netClearance: null,
    outcome: 'miss',
    outgoingSpin: [...input.shuttle.spin],
    outgoingVel: [...input.shuttle.vel],
    quality: 0,
    reachable: input.racket.reachable,
    reason,
    targetError: Number.POSITIVE_INFINITY,
  }
}

function describeQuality(
  timing: ContactTiming,
  sweetSpot: number,
  techniqueFit: number,
  netClearance: number | null,
): string {
  if (netClearance !== null && netClearance < 0) return 'closed face / net risk'
  if (timing === 'perfect' && sweetSpot > 0.92 && techniqueFit > 0.78) return 'clean contact'
  if (sweetSpot < 0.48) return 'off center'
  if (techniqueFit < 0.48) return 'forced technique'
  if (timing === 'early' || timing === 'late') return timing
  return 'controlled'
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
