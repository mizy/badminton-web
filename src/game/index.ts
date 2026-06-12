/** 游戏核心 — 统一入口 */

export type {
  GameState,
  GamePhase,
  MatchState,
  SetScore,
} from './types'

export { createDefaultMatchState } from './types'

export { gameReducer } from './reducer'
export type { GameAction } from './reducer'

export { checkPoint, handleSetEnd } from './match'

export {
  validateShot,
  isBallInCourt,
  isBallOverNet,
} from './shotLegality'
export type { ShotLegality } from './shotLegality'

export { updateStamina, getSpeedMultiplier } from './stamina'
export type { StaminaConfig } from './stamina'
