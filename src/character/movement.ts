/** 步法惯性系统 — 加速度/减速度、急转惯性、到位度 */

import type { PlayerState } from './types'

export interface MovementConfig {
  maxSpeed: number
  acceleration: number
  deceleration: number
  turnPenalty: number
  sprintThreshold: number
}

export const DEFAULT_MOVEMENT: MovementConfig = {
  maxSpeed: 12,
  acceleration: 30,
  deceleration: 25,
  turnPenalty: 0.5,
  sprintThreshold: 0.8,
}

function vecLen(x: number, z: number): number {
  return Math.sqrt(x * x + z * z)
}

function angleBetween(ax: number, az: number, bx: number, bz: number): number {
  const dot = ax * bx + az * bz
  const len = vecLen(ax, az) * vecLen(bx, bz)
  if (len < 1e-8) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / len)))
}

export function updateMovement(
  player: PlayerState,
  dt: number,
  cfg: MovementConfig = DEFAULT_MOVEMENT,
): PlayerState {
  const m = player.movement
  const tx = m.targetDir.x
  const tz = m.targetDir.z
  const targetLen = vecLen(tx, tz)

  let vx = m.currentVel.x
  let vz = m.currentVel.z

  if (targetLen > 0.01) {
    const nx = tx / targetLen
    const nz = tz / targetLen

    const angle = angleBetween(vx, vz, nx, nz)
    const accel = angle > Math.PI / 4 ? cfg.acceleration * cfg.turnPenalty : cfg.acceleration

    vx += nx * accel * dt
    vz += nz * accel * dt

    const speed = vecLen(vx, vz)
    const maxSpd = cfg.maxSpeed * Math.min(1, targetLen / cfg.sprintThreshold)
    if (speed > maxSpd) {
      vx = (vx / speed) * maxSpd
      vz = (vz / speed) * maxSpd
    }
  } else {
    const speed = vecLen(vx, vz)
    if (speed > 0) {
      const decel = cfg.deceleration * dt
      if (decel >= speed) {
        vx = 0
        vz = 0
      } else {
        vx -= (vx / speed) * decel
        vz -= (vz / speed) * decel
      }
    }
  }

  const currentSpeed = vecLen(vx, vz)
  const gait = currentSpeed < 0.1 ? 'idle' : currentSpeed > cfg.maxSpeed * 0.6 ? 'sprint' : 'walk'
  const readiness = targetLen > 0.01 ? 1 - Math.min(1, angleBetween(vx, vz, tx / targetLen, tz / targetLen) / Math.PI) : 1

  // 球场边界约束：球员不能过网（x=0）且不能超出球场
  // 球场尺寸 ±6.7m (x) ±3.05m (z)
  let newX = player.pos[0] + vx * dt
  let newZ = player.pos[2] + vz * dt

  // 根据球员所在半场限制 x 边界（阻止穿网）
  if (player.side === 0) {
    // 左侧球员 (home)：x ≤ -0.1
    newX = Math.min(newX, -0.1)
  } else {
    // 右侧球员 (away)：x ≥ 0.1
    newX = Math.max(newX, 0.1)
  }
  // 球场范围限制
  newX = Math.max(-6.7, Math.min(6.7, newX))
  newZ = Math.max(-3.05, Math.min(3.05, newZ))

  const newPos: [number, number, number] = [
    newX,
    player.pos[1],
    newZ,
  ]

  return {
    ...player,
    pos: newPos,
    movement: {
      ...m,
      currentVel: { x: vx, z: vz },
      gait,
      readiness,
    },
  }
}
