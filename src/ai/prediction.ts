/** 对手习惯预测 — 基于历史数据预估对手回球 */

import type { ShotType } from '../character/shotSynthesis'
import type { PlayerState } from '../character/types'

export interface OpponentProfile {
  preferredShots: Record<ShotType, number>
  weakSide: 'left' | 'right' | 'none'
  avgReactionTime: number
}

export function estimateReturnZone(
  opponent: PlayerState,
  _profile: OpponentProfile,
): [number, number, number] {
  const roll = Math.random()
  if (roll < 0.3) {
    return [opponent.pos[0] > 0 ? 6 : -6, 0, 0]
  }
  return [0, 0, (Math.random() - 0.5) * 4]
}
