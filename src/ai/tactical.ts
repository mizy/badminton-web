/** AI 战术选择 — 评估场上局势，选择球路 */

import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import type { AIConfig, TacticalDecision } from './types'

export function decideTactical(
  aiPlayer: PlayerState,
  opponent: PlayerState,
  shuttle: ShuttlecockState,
  config: AIConfig,
): TacticalDecision {
  const [sx, sy, sz] = shuttle.pos
  const [ox, , oz] = opponent.pos

  const distToShuttle = Math.sqrt(
    (sx - aiPlayer.pos[0]) ** 2 + (sz - aiPlayer.pos[2]) ** 2,
  )
  const canReach = distToShuttle < 4 && sy > 0.3 && sy < 4

  // 计算目标移动位置，并限制在球员自己的半场内（防止穿网）
  const side = aiPlayer.side

  let moveX: number
  let moveZ: number

  if (!canReach) {
    // 无法够到球 → 往自己半场防守位置移动
    moveX = clampToHalf(sx, side)
    moveZ = clamp(sz, -3.05, 3.05)
    return {
      moveTarget: [moveX, 0, moveZ],
      shotType: null,
      power: 0,
      target: [0, 0, 0],
      risk: 0,
    }
  }

  const shotType = selectShotType(sy, distToShuttle, config)
  const target = selectTarget(shotType, [ox, 0, oz], config)
  const power = selectPower(shotType, config)

  // 将 moveTarget 限制在球员自己的半场内
  moveX = clampToHalf(sx, side)
  moveZ = clamp(sz, -3.05, 3.05)

  return {
    moveTarget: [moveX, 0, moveZ],
    shotType,
    power,
    target,
    risk: config.aggressiveness,
  }
}

/** 将 x 坐标限制在球员自己的半场内 */
function clampToHalf(x: number, side: 0 | 1): number {
  if (side === 0) {
    // 左侧球员：x ≤ -0.1
    return Math.min(Math.max(x, -6.7), -0.1)
  } else {
    // 右侧球员：x ≥ 0.1
    return Math.max(Math.min(x, 6.7), 0.1)
  }
}

/** 数值限制在区间内 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function selectShotType(
  height: number,
  _dist: number,
  config: AIConfig,
): ShotType {
  const roll = Math.random()

  if (height > 1.8 && roll < 0.4 * config.aggressiveness) return 'SMASH'
  if (height < 0.8 && roll < 0.3) return 'NET_DROP'
  if (roll < 0.5) return 'CLEAR'
  if (roll < 0.75) return 'DROP'
  return 'DRIVE'
}

function selectTarget(
  shotType: ShotType,
  opponentPos: [number, number, number],
  config: AIConfig,
): [number, number, number] {
  const deviation = (1 - config.accuracy) * 4

  switch (shotType) {
    case 'SMASH':
    case 'DROP':
      return [
        opponentPos[0] + (Math.random() - 0.5) * deviation,
        0,
        opponentPos[2] + (Math.random() - 0.5) * deviation,
      ]
    case 'CLEAR':
      return [opponentPos[0] > 0 ? 6 : -6, 0, (Math.random() - 0.5) * deviation]
    case 'NET_DROP':
      return [0, 0.3, opponentPos[2] * 0.3]
    default:
      return [0, 0, (Math.random() - 0.5) * 2]
  }
}

function selectPower(
  shotType: ShotType,
  config: AIConfig,
): number {
  const base = shotType === 'SMASH' ? 0.9 : shotType === 'CLEAR' ? 0.8 : 0.5
  const noise = (Math.random() - 0.5) * (1 - config.accuracy) * 0.5
  return Math.max(0.1, Math.min(1, base + noise))
}
