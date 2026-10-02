import type { ShotDirection, ShotType } from '../character/shotSynthesis'
import type { ShotAim } from '../character/types'

export type MoveDirection = { x: number; z: number }

export type InputAction =
  | { type: 'SERVE' }
  | { type: 'MOVE'; dir: MoveDirection }
  | { type: 'STOP_MOVE' }
  /** holdGrace：蓄力自动出拍的额外宽限（秒），触屏瞄准区用它换取更长的瞄准时间。 */
  | { type: 'SWING_START'; shot?: ShotType; direction?: ShotDirection; slice?: boolean; aim?: ShotAim; holdGrace?: number }
  /** 蓄力中更新击球方向与落点：触屏按钮在按住拖动时解析手势。 */
  | { type: 'SWING_SELECT'; shot?: ShotType; direction?: ShotDirection; aim: ShotAim }
  /** minimumCharge：出拍力量的固定下限（0–1）。触屏球路键短按即出招时用点按力量，长按蓄力则不受影响。 */
  | { type: 'SWING_RELEASE'; minimumCharge?: number }
  | { type: 'SERVE_OR_JUMP' }
  | { type: 'JUMP' }
  | { type: 'SCISSOR_STEP' }
  | { type: 'SELECT_SHOT'; shot: ShotType }
  | { type: 'AIM'; aim: ShotAim }
  | { type: 'PAUSE' }
  | { type: 'RESET' }

export type InputSource = 'keyboard' | 'gamepad' | 'touch' | 'network'

export interface InputEvent {
  action: InputAction
  source: InputSource
  timestamp: number
  playerIndex: 0 | 1
}

export type InputListener = (event: InputEvent) => void

export interface InputAdapter {
  connect(listener: InputListener): void
  disconnect(): void
}
