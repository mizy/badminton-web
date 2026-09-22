/** 步法惯性系统 — 有限加减速、急停恢复与实际到位度，AI/人类共用。 */

import { getSpeedMultiplier } from '../game/stamina'
import type { Footwork, PlayerState } from './types'

export interface MovementConfig {
  maxSpeed: number
  acceleration: number
  deceleration: number
  turnPenalty: number
  sprintThreshold: number
}

export const DEFAULT_MOVEMENT: MovementConfig = {
  maxSpeed: 6,
  acceleration: 22,
  deceleration: 28,
  turnPenalty: 0.65,
  sprintThreshold: 0.8,
}

const MAX_STEP = 1 / 120
const EPSILON = 1e-8

export function updateMovement(
  player: PlayerState,
  dt: number,
  cfg: MovementConfig = DEFAULT_MOVEMENT,
): PlayerState {
  if (!Number.isFinite(dt) || dt <= 0) return player
  if (player.body.phase === 'airborne') {
    const limit = cfg.maxSpeed
    const vx = Math.max(-limit, Math.min(limit, player.movement.currentVel.x + player.movement.targetDir.x * 2 * dt))
    const vz = Math.max(-limit, Math.min(limit, player.movement.currentVel.z + player.movement.targetDir.z * 2 * dt))
    const x = Math.max(player.side === 0 ? -7.5 : 0.1, Math.min(player.side === 0 ? -0.1 : 7.5, player.pos[0] + vx * dt))
    const z = Math.max(-3.6, Math.min(3.6, player.pos[2] + vz * dt))
    return { ...player, pos: [x, player.pos[1], z], movement: { ...player.movement,
      currentVel: { x: vx, z: vz }, readiness: Math.min(player.movement.readiness, 0.85), footwork: 'cross' } }
  }
  const movement = player.movement
  const targetLength = Math.hypot(movement.targetDir.x, movement.targetDir.z)
  const hasInput = targetLength > 0.01
  const nx = hasInput ? movement.targetDir.x / targetLength : 0
  const nz = hasInput ? movement.targetDir.z / targetLength : 0
  const forward = nx * (player.side === 0 ? 1 : -1)
  const backwardMultiplier = 1 - 0.28 * Math.max(0, -forward)
  const phase = player.swing.phase
  const swingMultiplier = phase === 'swinging' ? 0.5 : phase === 'recovery' ? 0.65 : phase === 'preparing' ? 0.9 : 1
  const bodyMultiplier = player.body.phase === 'landing' ? 0.45 : player.body.phase === 'loading' ? 0.65 : 1
  const maxSpeed = Math.max(0, cfg.maxSpeed) * backwardMultiplier * swingMultiplier * bodyMultiplier *
    getSpeedMultiplier(player.stamina, undefined, player.maxStamina)
  const desiredSpeed = hasInput ? maxSpeed * Math.min(1, targetLength / Math.max(0.01, cfg.sprintThreshold)) : 0
  const desiredX = nx * desiredSpeed
  const desiredZ = nz * desiredSpeed
  const minX = player.side === 0 ? -7.5 : 0.1
  const maxX = player.side === 0 ? -0.1 : 7.5

  let x = player.pos[0]
  let z = player.pos[2]
  let vx = movement.currentVel.x
  let vz = movement.currentVel.z
  let readiness = movement.readiness
  let footwork: Footwork = movement.footwork

  // 小步仅用于稳定转向、边界与恢复判定；不截断长帧的模拟时间。
  for (let remaining = dt; remaining > EPSILON;) {
    const step = Math.min(MAX_STEP, remaining)
    remaining -= step
    const oldSpeed = Math.hypot(vx, vz)
    const alignment = hasInput && oldSpeed > 0.1 ? (vx * nx + vz * nz) / oldSpeed : 1
    const turning = hasInput && alignment < Math.SQRT1_2
    const braking = !hasInput || oldSpeed > desiredSpeed + 0.1
    const rate = Math.max(0.01, turning
      ? cfg.deceleration * Math.max(0.1, cfg.turnPenalty)
      : braking ? cfg.deceleration : cfg.acceleration)
    const dx = desiredX - vx
    const dz = desiredZ - vz
    const difference = Math.hypot(dx, dz)
    const acceleratingTime = Math.min(step, difference / rate)
    const amount = difference > EPSILON ? Math.min(1, rate * step / difference) : 1
    const nextVX = vx + dx * amount
    const nextVZ = vz + dz * amount

    // 接近目标速度时分开积分加速段/匀速段，不随 30/60/144Hz 改变路程。
    const nextX = x + (vx + nextVX) * 0.5 * acceleratingTime + nextVX * (step - acceleratingTime)
    const nextZ = z + (vz + nextVZ) * 0.5 * acceleratingTime + nextVZ * (step - acceleratingTime)
    x = Math.max(minX, Math.min(maxX, nextX))
    z = Math.max(-3.6, Math.min(3.6, nextZ))
    const blockedX = (x <= minX && nextVX < 0) || (x >= maxX && nextVX > 0)
    const blockedZ = (z <= -3.6 && nextVZ < 0) || (z >= 3.6 && nextVZ > 0)
    vx = blockedX ? 0 : nextVX
    vz = blockedZ ? 0 : nextVZ

    const speed = Math.hypot(vx, vz)
    const speedRatio = Math.min(1, speed / Math.max(0.01, maxSpeed))
    const recoveringSwing = phase === 'swinging' || phase === 'recovery'
    const settling = (braking && oldSpeed > 0.1) || turning || blockedX || blockedZ
    const desiredReadiness = Math.max(0.1, 1 - 0.4 * speedRatio -
      (settling ? 0.3 : 0) - (recoveringSwing ? 0.35 : phase === 'preparing' ? 0.1 : 0))
    const recoveryRate = desiredReadiness < readiness ? 18 : 4
    readiness += (desiredReadiness - readiness) * (1 - Math.exp(-recoveryRate * step))
    if (desiredReadiness === 1 && readiness > 0.999) readiness = 1

    if (recoveringSwing || settling || (!hasInput && readiness < 0.94)) footwork = 'recover'
    else if (!hasInput && speed < 0.1) footwork = 'ready'
    else if (hasInput && speed < maxSpeed * 0.45 && speed < desiredSpeed - 0.1) footwork = 'start'
    else if (forward < -0.25) footwork = 'retreat'
    else if (forward > 0.5 && Math.abs(x) < 1.5) footwork = 'lunge'
    else if (speedRatio > 0.65) footwork = 'cross'
    else footwork = 'chasse'
  }

  const speed = Math.hypot(vx, vz)
  // 按当前体能下的运动强度判断冲刺，疲劳/后退不会变成无成本慢走。
  const gait = speed < 0.1 ? 'idle' : speed > maxSpeed * 0.6 ? 'sprint' : 'walk'
  return {
    ...player,
    pos: [x, player.pos[1], z],
    movement: {
      ...movement,
      currentVel: { x: vx, z: vz },
      gait,
      readiness: Math.max(0, Math.min(1, readiness)),
      footwork,
    },
  }
}
