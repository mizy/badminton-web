/** 角色系统 — 统一入口 */

export type {
  PlayerState,
  MovementState,
  Gait,
  TimingWindow,
} from './types'

export { updateMovement } from './movement'
export type { MovementConfig } from './movement'

export {
  getAvailableShots,
  synthesizeShot,
} from './shotSynthesis'
export type {
  ShotType,
  ShotIntent,
  ShotResult,
  AvailableShot,
} from './shotSynthesis'

export { computeTimingWindow } from './timing'
export type { TimingConfig } from './timing'
