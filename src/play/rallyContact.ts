import {
  evaluateContact,
  idealContactPoint,
  type ContactResult,
  type ContactTechnique,
} from '../character/contact'
import {
  createReachableRacketPose,
  hasShuttleCorkLanded,
  placeLandedShuttle,
  placeShuttleForCorkCenter,
  type RacketContactPose,
  type Vec3,
} from '../character/racketKinematics'
import { SPEED_77_SHUTTLECOCK, stepShuttlecock, type ShuttlecockState } from '../physics/shuttlecock'

export type RallyContactPhase = 'incoming' | 'outgoing' | 'landed' | 'missed'
export type RallyContactLanding = 'pending' | 'in' | 'out' | 'net' | 'miss'

export interface RallyContactConfig {
  contactHeightCm: number
  contactReachCm: number
  contactSideCm: number
  incomingSpeed: number
  power: number
  racketFaceDeg: number
  swingOffsetMs: number
  targetZ: number
  technique: ContactTechnique
}

export interface RallyContactState {
  landing: RallyContactLanding
  phase: RallyContactPhase
  phaseTime: number
  result: ContactResult | null
  shuttle: ShuttlecockState
}

export interface RallyContactStep {
  impact: boolean
  reset: boolean
  state: RallyContactState
}

export const RALLY_PLAYER_POS: Vec3 = [-2.65, 0, -0.16]
export const RALLY_CONTACT_TIME = 0.58
export const DEFAULT_RALLY_CONTACT = idealContactPoint(RALLY_PLAYER_POS, 0, 'DRIVE')

/** @entry 创建 Play 层的纯击球验收场景，Storybook 只投影返回状态。 */
export function createRallyContactState(config: RallyContactConfig): RallyContactState {
  return {
    landing: 'pending',
    phase: 'incoming',
    phaseTime: 0,
    result: null,
    shuttle: sampleIncomingShuttle(config, 0),
  }
}

/** @entry 推进来球、拍弦接触、空阻轨迹、球网与落地状态。 */
export function stepRallyContact(
  state: RallyContactState,
  dt: number,
  config: RallyContactConfig,
): RallyContactStep {
  const phaseTime = state.phaseTime + Math.max(0, dt)
  if (state.phase === 'landed' || state.phase === 'missed') {
    if (phaseTime > 1.1) return { impact: false, reset: true, state: createRallyContactState(config) }
    return { impact: false, reset: false, state: { ...state, phaseTime } }
  }

  if (state.phase === 'incoming') {
    const shuttle = sampleIncomingShuttle(config, Math.min(phaseTime, RALLY_CONTACT_TIME))
    if (phaseTime < RALLY_CONTACT_TIME) {
      return { impact: false, reset: false, state: { ...state, phaseTime, shuttle } }
    }
    const result = evaluateContact({
      intent: config.technique,
      playerPos: RALLY_PLAYER_POS,
      playerSide: 0,
      power: config.power,
      racket: createRallyRacketPose(config),
      racketFaceDeg: config.racketFaceDeg,
      shuttle,
      swingOffsetMs: config.swingOffsetMs,
      targetZ: config.targetZ,
    })
    if (result.outcome === 'miss') {
      return {
        impact: false,
        reset: false,
        state: { landing: 'miss', phase: 'missed', phaseTime: 0, result, shuttle },
      }
    }
    return {
      impact: true,
      reset: false,
      state: {
        landing: 'pending',
        phase: 'outgoing',
        phaseTime: 0,
        result,
        shuttle: {
          pos: [...result.launchPoint],
          spin: [...result.outgoingSpin],
          vel: [...result.outgoingVel],
        },
      },
    }
  }

  const previous = state.shuttle
  let shuttle = stepShuttlecock(previous, dt, SPEED_77_SHUTTLECOCK, 8)
  if (crossedNet(previous.pos, shuttle.pos) && interpolateNetHeight(previous.pos, shuttle.pos) < 1.524) {
    return {
      impact: false,
      reset: false,
      state: { ...state, landing: 'net', phase: 'landed', phaseTime: 0, shuttle },
    }
  }
  if (hasShuttleCorkLanded(shuttle.pos, shuttle.vel)) {
    shuttle = { ...shuttle, pos: placeLandedShuttle(shuttle.pos, shuttle.vel) }
    return {
      impact: false,
      reset: false,
      state: {
        ...state,
        landing: classifyLanding(shuttle.pos),
        phase: 'landed',
        phaseTime: 0,
        shuttle,
      },
    }
  }
  return { impact: false, reset: false, state: { ...state, phaseTime, shuttle } }
}

export function createRallyRacketPose(config: RallyContactConfig): RacketContactPose {
  return createReachableRacketPose({
    desiredContact: plannedRallyContact(config),
    playerPos: RALLY_PLAYER_POS,
    playerSide: 0,
    racketFaceDeg: config.racketFaceDeg,
  })
}

export function plannedRallyContact(config: RallyContactConfig): Vec3 {
  return [
    DEFAULT_RALLY_CONTACT[0] + config.contactReachCm / 100,
    DEFAULT_RALLY_CONTACT[1] + config.contactHeightCm / 100,
    DEFAULT_RALLY_CONTACT[2] + config.contactSideCm / 100,
  ]
}

function sampleIncomingShuttle(config: RallyContactConfig, time: number): ShuttlecockState {
  const contact = plannedRallyContact(config)
  const direction: Vec3 = [-0.975, -0.12, -0.18]
  const travel = config.incomingSpeed * RALLY_CONTACT_TIME
  const start: Vec3 = [
    contact[0] - direction[0] * travel,
    contact[1] - direction[1] * travel,
    contact[2] - direction[2] * travel,
  ]
  const t = clamp(time / RALLY_CONTACT_TIME, 0, 1)
  const corkCenter: Vec3 = [
    start[0] + (contact[0] - start[0]) * t,
    start[1] + (contact[1] - start[1]) * t,
    start[2] + (contact[2] - start[2]) * t,
  ]
  const velocity: Vec3 = direction.map((component) => component * config.incomingSpeed) as Vec3
  return {
    pos: placeShuttleForCorkCenter(corkCenter, velocity),
    spin: [0, 45, 0],
    vel: velocity,
  }
}

function classifyLanding(pos: Vec3): RallyContactLanding {
  if (pos[0] <= 0.05) return 'net'
  if (Math.abs(pos[0]) > 6.7 || Math.abs(pos[2]) > 3.05) return 'out'
  return 'in'
}

function crossedNet(previous: Vec3, current: Vec3): boolean {
  return previous[0] < 0 && current[0] >= 0
}

function interpolateNetHeight(previous: Vec3, current: Vec3): number {
  const alpha = -previous[0] / Math.max(current[0] - previous[0], 0.000001)
  return previous[1] + (current[1] - previous[1]) * alpha
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
