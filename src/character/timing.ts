/** 击球时机窗口 — 根据来球高度/位置计算最佳击球区间 */

import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState, TimingWindow } from './types'

export interface TimingConfig {
  perfectWindow: number
  goodWindow: number
  lateWindow: number
}

const DEFAULT_TIMING: TimingConfig = {
  perfectWindow: 0.05,
  goodWindow: 0.15,
  lateWindow: 0.3,
}

export function computeTimingWindow(
  player: PlayerState,
  shuttle: ShuttlecockState,
  cfg: TimingConfig = DEFAULT_TIMING,
): TimingWindow | null {
  const [px, , pz] = player.pos
  const [bx, by, bz] = shuttle.pos

  const dx = bx - px
  const dz = bz - pz
  const dist = Math.sqrt(dx * dx + dz * dz)

  if (dist > 4) return null
  if (by < 0.3 || by > 4) return null

  const [vx, vy, vz] = shuttle.vel
  const closingSpeed = -(dx * vx + dz * vz) / dist

  if (closingSpeed <= 0) return null

  const optimalImpactHeight = 1.0
  const timeToImpact = (by - optimalImpactHeight) / Math.abs(vy)

  return {
    open: timeToImpact - cfg.lateWindow,
    close: timeToImpact + cfg.lateWindow,
    quality: classifyTiming(timeToImpact, cfg),
  }
}

function classifyTiming(
  timeToImpact: number,
  cfg: TimingConfig,
): TimingWindow['quality'] {
  const abs = Math.abs(timeToImpact)
  if (abs < cfg.perfectWindow) return 'perfect'
  if (abs < cfg.goodWindow) return 'good'
  if (abs < cfg.lateWindow) return 'late'
  return 'miss'
}
