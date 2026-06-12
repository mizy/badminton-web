/** 击球合成 — 输入组合 → 球路判定 → 碰撞参数输出 */

import type { ShuttlecockState } from '../physics/shuttlecock'
import type { CollisionResult } from '../physics/racket'
import type { PlayerState, TimingWindow } from './types'

export type ShotType = 'SMASH' | 'DROP' | 'CLEAR' | 'DRIVE' | 'NET_DROP' | 'LIFT'

export interface ShotIntent {
  type: ShotType
  power: number
  target: [number, number, number]
  spin?: [number, number, number]
}

export interface ShotResult {
  type: ShotType
  collision: CollisionResult
  timing: TimingWindow
  staminaCost: number
}

export type AvailableShot = {
  type: ShotType
  minPower: number
  maxPower: number
  description: string
}

export function getAvailableShots(
  player: PlayerState,
  shuttle: ShuttlecockState,
): AvailableShot[] {
  const [px, , pz] = player.pos
  const [bx, by, bz] = shuttle.pos
  const dx = bx - px
  const dz = bz - pz
  const dist = Math.sqrt(dx * dx + dz * dz)
  const height = by

  const shots: AvailableShot[] = []

  if (height > 1.5 && dist < 3) {
    shots.push({ type: 'SMASH', minPower: 0.7, maxPower: 1.0, description: '高点扣杀' })
    shots.push({ type: 'DROP', minPower: 0.2, maxPower: 0.5, description: '高点吊球' })
  }
  if (dist > 1) {
    shots.push({ type: 'CLEAR', minPower: 0.6, maxPower: 1.0, description: '高远球' })
    shots.push({ type: 'DRIVE', minPower: 0.4, maxPower: 0.9, description: '平抽' })
  }
  if (dist < 2 && height < 1.2) {
    shots.push({ type: 'NET_DROP', minPower: 0.1, maxPower: 0.4, description: '网前小球' })
    shots.push({ type: 'LIFT', minPower: 0.4, maxPower: 0.8, description: '挑球' })
  }

  return shots
}

export function synthesizeShot(
  intent: ShotIntent,
  player: PlayerState,
  _shuttle: ShuttlecockState,
  timing: TimingWindow,
): ShotResult {
  const { power, type } = intent
  const quality = timing.quality

  const qualityMultiplier = quality === 'perfect' ? 1.0 : quality === 'good' ? 0.85 : quality === 'late' ? 0.6 : 0.3

  const effectivePower = power * qualityMultiplier * player.movement.readiness

  const baseSpeed: Record<ShotType, number> = {
    SMASH: 80,
    DROP: 15,
    CLEAR: 28,
    DRIVE: 35,
    NET_DROP: 5,
    LIFT: 20,
  }

  const speed = baseSpeed[type] * (0.5 + 0.5 * effectivePower)
  const staminaCost = effectivePower * (type === 'SMASH' ? 8 : type === 'CLEAR' ? 5 : 3)

  const collision: CollisionResult = {
    outgoingVel: [0, speed, 0],
    outgoingSpin: intent.spin ?? [0, 50, 0],
    impactSpeed: speed,
  }

  return { type, collision, timing, staminaCost }
}
