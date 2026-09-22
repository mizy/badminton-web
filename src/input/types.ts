import type { ShotType } from '../character/shotSynthesis'
import type { ShotAim } from '../character/types'

export type MoveDirection = { x: number; z: number }

export type InputAction =
  | { type: 'SERVE' }
  | { type: 'MOVE'; dir: MoveDirection }
  | { type: 'STOP_MOVE' }
  | { type: 'SWING_START'; shot?: ShotType; slice?: boolean; aim?: ShotAim }
  | { type: 'SWING_RELEASE' }
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
