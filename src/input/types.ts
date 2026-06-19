/** 输入抽象 — 所有平台输入归一化为统一事件流 */

export type MoveDirection = { x: number; z: number }

export type InputAction =
  | { type: 'SERVE' }
  | { type: 'MOVE'; dir: MoveDirection }
  | { type: 'STOP_MOVE' }
  | { type: 'SWING_START' }
  | { type: 'SWING_RELEASE' }
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
