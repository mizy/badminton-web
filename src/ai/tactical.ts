/** 确定性的单打战术：只输出计划，移动、反应延迟与挥拍均由主循环执行。 */

import { DEFAULT_SHUTTLECOCK, stepShuttlecock, type ShuttlecockState } from '../physics/shuttlecock'
import { updateMovement } from '../character/movement'
import {
  createReachableRacketPose,
  getShuttleCorkCenter,
  hasShuttleCorkLanded,
  type Vec3,
} from '../character/racketKinematics'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import { canPlayShot, SHOT_ORDER } from '../character/stroke'
import type { AIConfig, AIStyle, InterceptionPrediction, TacticalDecision } from './types'

const COURT = { halfLength: 6.7, halfWidth: 2.59, netGap: 0.1, netHeight: 1.524 } as const
const PREDICTION_STEP = 1 / 30
const PREDICTION_STEPS = 90
const CONTACT_FORWARD = 0.65
const STOP_DISTANCE = 0.2

const STYLE_SCORES: Record<AIStyle, Record<ShotType, number>> = {
  attacker: { SMASH: 8, CLEAR: 2, DROP: 3, DRIVE: 6, NET_DROP: 4, LIFT: 2 },
  rally: { SMASH: 1, CLEAR: 8, DROP: 2, DRIVE: 4, NET_DROP: 3, LIFT: 8 },
  placement: { SMASH: 3, CLEAR: 4, DROP: 5, DRIVE: 3, NET_DROP: 5, LIFT: 3 },
}
const SHOT_DEPTH: Record<ShotType, number> = {
  SMASH: 3.8, CLEAR: 5.9, DROP: 1.15, DRIVE: 4.2, NET_DROP: 0.7, LIFT: 5.7,
}
const SHOT_POWER: Record<ShotType, number> = {
  SMASH: 0.94, CLEAR: 0.82, DROP: 0.46, DRIVE: 0.68, NET_DROP: 0.3, LIFT: 0.76,
}

/** 当前身体与高度允许的候选；不预测移动，也不替代主循环的挥拍/接触判定。 */
/** 杀球需绝对触球高度：低于此高度时几何上无法在深落点过网，只会下网。 */
export const SMASH_MIN_CONTACT_HEIGHT = 2.15

export function getLegalShots(player: PlayerState, shuttle: ShuttlecockState): ShotType[] {
  const contact = getShuttleCorkCenter(shuttle.pos, shuttle.vel)
  const forward = forwardFor(player.side)
  if (hasShuttleCorkLanded(shuttle.pos, shuttle.vel)
    || contact[0] * forward >= 0
    || (contact[0] - player.pos[0]) * forward < 0) return []

  const pose = createReachableRacketPose({
    desiredContact: contact,
    playerPos: player.pos,
    playerSide: player.side,
    racketFaceDeg: 0,
  })
  if (!pose.reachable) return []

  return SHOT_ORDER.filter(shot => shot !== 'SMASH' || contact[1] >= SMASH_MIN_CONTACT_HEIGHT)
    .filter(shot => canPlayShot(shot, contact, player.pos[1]))
}

/** 最多采样 3 秒真实气动轨迹，优先 1.6–2.1m 接触；落地/撞网即停止。 */
export function predictInterception(player: PlayerState, shuttle: ShuttlecockState): InterceptionPrediction {
  const fallback: InterceptionPrediction = {
    moveTarget: recoveryPosition(player.side), contactTime: null, contactHeight: null, reachable: false,
  }
  if (isOutgoing(player, shuttle) || hasShuttleCorkLanded(shuttle.pos, shuttle.vel)) return fallback

  let sample = shuttle
  let best: InterceptionPrediction | null = null
  let bestScore = Infinity
  let fallbackScore = Infinity
  for (let step = 0; step <= PREDICTION_STEPS; step++) {
    if (hasShuttleCorkLanded(sample.pos, sample.vel)) break
    const contact = getShuttleCorkCenter(sample.pos, sample.vel)
    const target = stanceForContact(contact, player.side)
    // 先检查该站位是否能提供合法接触，再验证球员是否来得及移动过去。
    if (getLegalShots({ ...player, pos: target }, sample).length > 0) {
      const time = step * PREDICTION_STEP
      const heightPenalty = Math.max(1.6 - contact[1], contact[1] - 2.1, 0)
      const score = heightPenalty * 10 + Math.abs(contact[1] - 1.85) * 0.25 + time * 0.15
      const distance = Math.hypot(target[0] - player.pos[0], target[2] - player.pos[2])
      if (score + distance < fallbackScore) {
        fallbackScore = score + distance
        fallback.moveTarget = target
      }
      if (score < bestScore && canMoveToContact(player, sample, target, step)) {
        bestScore = score
        best = { moveTarget: target, contactTime: time, contactHeight: contact[1], reachable: true }
      }
    }
    if (step === PREDICTION_STEPS) break
    const next = stepShuttlecock(sample, PREDICTION_STEP, DEFAULT_SHUTTLECOCK, 4)
    if (hitsNet(sample, next)) break
    sample = next
  }
  return best ?? fallback
}

export function decideTactical(
  aiPlayer: PlayerState,
  opponent: PlayerState,
  shuttle: ShuttlecockState,
  config: AIConfig,
): TacticalDecision {
  const interception = predictInterception(aiPlayer, shuttle)
  const legal = isOutgoing(aiPlayer, shuttle) ? [] : getLegalShots(aiPlayer, shuttle)
  if (legal.length === 0) {
    return { moveTarget: interception.moveTarget, shotType: null, power: 0, target: [0, 0, 0], risk: 0 }
  }

  const style = config.style ?? 'placement'
  const contact = getShuttleCorkCenter(shuttle.pos, shuttle.vel)
  // 触球越低，杀球落点越浅：保证弧线能过网，低点只收短杀。
  const smashDepth = clamp((contact[1] - 1.95) * 6, 1.7, SHOT_DEPTH.SMASH)
  let shotType = legal[0]
  let target: Vec3 = [0, 0, 0]
  let bestScore = -Infinity
  const fatigue = 1 - clamp(aiPlayer.stamina / Math.max(aiPlayer.maxStamina, 1), 0, 1)
  for (const shot of legal) {
    const candidate = selectTarget(shot, aiPlayer.side, opponent, config, smashDepth)
    const receiver = projectedOpponent(opponent, shot === 'CLEAR' || shot === 'LIFT' ? 0.55 : 0.25)
    const space = Math.hypot(candidate[0] - receiver[0], candidate[2] - receiver[2])
    let score = STYLE_SCORES[style][shot] + space * (style === 'placement' ? 1.5 : style === 'attacker' ? 0.35 : 0.15)
    if (shot === 'SMASH') score += config.aggressiveness - fatigue * 6 - (1 - aiPlayer.movement.readiness) * 3
    if (shot === 'CLEAR' || shot === 'LIFT') score += fatigue * 2
    if (config.cooperative) {
      // 合作模式只改变意图：优先增加滞空恢复时间，不扩大身体可达范围。
      score = shot === 'CLEAR' ? 100 : shot === 'LIFT' ? 90 : shot === 'DROP' ? 30 : shot === 'DRIVE' ? 20 : 10
    }
    if (score > bestScore) {
      bestScore = score
      shotType = shot
      target = candidate
    }
  }

  return {
    moveTarget: interception.moveTarget,
    shotType,
    power: SHOT_POWER[shotType],
    target,
    risk: config.cooperative ? 0.05 : clamp((shotType === 'SMASH' ? 0.55 : 0.15) + config.aggressiveness * 0.25, 0, 1),
  }
}

/** 用同一移动积分（含加速、转向惯性）试走到候选接触时刻；不修改真实球员。 */
function canMoveToContact(player: PlayerState, shuttle: ShuttlecockState, target: Vec3, steps: number): boolean {
  let projected = player
  for (let step = 0; step < steps; step++) {
    const dx = target[0] - projected.pos[0]
    const dz = target[2] - projected.pos[2]
    const distance = Math.hypot(dx, dz)
    const targetDir = distance > STOP_DISTANCE ? { x: dx / distance, z: dz / distance } : { x: 0, z: 0 }
    projected = updateMovement({ ...projected, movement: { ...projected.movement, targetDir } }, PREDICTION_STEP)
  }
  return getLegalShots(projected, shuttle).length > 0
}

function selectTarget(shot: ShotType, side: 0 | 1, opponent: PlayerState, config: AIConfig, smashDepth = SHOT_DEPTH.SMASH): Vec3 {
  const forward = forwardFor(side)
  const opponentSide = side === 0 ? 1 : 0
  const margin = 0.25 + (1 - clamp(config.accuracy, 0, 1)) * 0.65
  if (config.cooperative) {
    const receiver = projectedOpponent(opponent, 0.3, 0.6)
    // 落点略在接球者身后，使下降途中在其拍前经过；不强迫对手移动或接球。
    return courtPosition(receiver[0] + forward * CONTACT_FORWARD, receiver[2], opponentSide, margin)
  }
  const receiver = projectedOpponent(opponent, shot === 'CLEAR' || shot === 'LIFT' ? 0.55 : 0.25)
  const width = (config.style ?? 'placement') === 'rally' ? 0.65 : COURT.halfWidth - margin
  const depth = shot === 'SMASH' ? smashDepth : SHOT_DEPTH[shot]
  const lateral = receiver[2] >= 0 ? -width : width
  return courtPosition(forward * depth, lateral, opponentSide, margin)
}

function projectedOpponent(opponent: PlayerState, seconds: number, maxTravel = 1.5): Vec3 {
  const { x, z } = opponent.movement.currentVel
  const scale = Math.min(seconds, maxTravel / Math.max(Math.hypot(x, z), 0.001))
  return courtPosition(opponent.pos[0] + x * scale, opponent.pos[2] + z * scale, opponent.side)
}

function stanceForContact(contact: Vec3, side: 0 | 1): Vec3 {
  return courtPosition(contact[0] - forwardFor(side) * CONTACT_FORWARD, contact[2], side)
}

function recoveryPosition(side: 0 | 1): Vec3 {
  return [-forwardFor(side) * COURT.halfLength / 2, 0, 0]
}

function isOutgoing(player: PlayerState, shuttle: ShuttlecockState): boolean {
  return shuttle.vel[0] * forwardFor(player.side) > 0.05
}

function hitsNet(previous: ShuttlecockState, next: ShuttlecockState): boolean {
  if (previous.pos[0] * next.pos[0] > 0 || previous.pos[0] === next.pos[0]) return false
  const alpha = -previous.pos[0] / (next.pos[0] - previous.pos[0])
  return previous.pos[1] + (next.pos[1] - previous.pos[1]) * alpha < COURT.netHeight
}

function courtPosition(x: number, z: number, side: 0 | 1, margin = 0): Vec3 {
  const sign = -forwardFor(side)
  return [
    sign * clamp(sign * x, COURT.netGap + margin, COURT.halfLength - margin),
    0,
    clamp(z, -COURT.halfWidth + margin, COURT.halfWidth - margin),
  ]
}

function forwardFor(side: 0 | 1): number {
  return side === 0 ? 1 : -1
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
