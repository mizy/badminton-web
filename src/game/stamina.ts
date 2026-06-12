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
  sprintDrain: 25,
  walkDrain: 5,
  idleRegen: 15,
  walkRegen: 5,
  fatigueThreshold: 20,
  fatigueSpeedMultiplier: 0.7,
}

export function updateStamina(
  player: PlayerState,
  dt: number,
  cfg: StaminaConfig = DEFAULT_STAMINA,
): PlayerState {
  const gait = player.movement.gait
  let delta = 0

  switch (gait) {
    case 'sprint':
      delta = -cfg.sprintDrain * dt
      break
    case 'walk':
      delta = -cfg.walkDrain * dt
      break
    case 'idle':
      delta = cfg.idleRegen * dt
      break
  }

  const newStamina = Math.max(0, Math.min(cfg.maxStamina, player.stamina + delta))

  return { ...player, stamina: newStamina }
}

export function getSpeedMultiplier(stamina: number, cfg: StaminaConfig = DEFAULT_STAMINA): number {
  return stamina < cfg.fatigueThreshold ? cfg.fatigueSpeedMultiplier : 1
}
