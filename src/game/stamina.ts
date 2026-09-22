/** 体力系统 — 跑动消耗 + 休息回复 + 疲劳影响 */

import type { PlayerState } from '../character/types'

export interface StaminaConfig {
  maxStamina: number
  sprintDrain: number
  walkDrain: number
  idleRegen: number
  walkRegen: number
  fatigueThreshold: number
  fatigueSpeedMultiplier: number
}

export const DEFAULT_STAMINA: StaminaConfig = {
  maxStamina: 100,
  sprintDrain: 6,
  walkDrain: 1.5,
  idleRegen: 8,
  walkRegen: 2,
  fatigueThreshold: 25,
  fatigueSpeedMultiplier: 0.65,
}

export function updateStamina(
  player: PlayerState,
  dt: number,
  cfg: StaminaConfig = DEFAULT_STAMINA,
): PlayerState {
  if (!Number.isFinite(dt) || dt <= 0) return player
  const { gait, currentVel, footwork } = player.movement
  const resting = player.swing.phase === 'ready' && footwork !== 'recover'
  let rate = 0

  switch (gait) {
    case 'sprint':
      rate = -cfg.sprintDrain
      break
    case 'walk':
      // 慢速调整步可以稍作恢复，快速并步仍有净消耗。
      rate = -cfg.walkDrain + (resting && Math.hypot(currentVel.x, currentVel.z) < 1 ? cfg.walkRegen : 0)
      break
    case 'idle':
      rate = resting ? cfg.idleRegen : 0
      break
  }

  const stamina = Math.max(0, Math.min(player.maxStamina, player.stamina + rate * dt))
  return { ...player, stamina }
}

/** 第三参数为球员容量；前两个参数保持兼容，阈值按配置容量同比缩放。 */
export function getSpeedMultiplier(
  stamina: number,
  cfg: StaminaConfig = DEFAULT_STAMINA,
  maxStamina: number = cfg.maxStamina,
): number {
  const threshold = maxStamina * cfg.fatigueThreshold / Math.max(1, cfg.maxStamina)
  const freshness = threshold > 0 ? Math.max(0, Math.min(1, stamina / threshold)) : 0
  return cfg.fatigueSpeedMultiplier + (1 - cfg.fatigueSpeedMultiplier) * freshness
}
