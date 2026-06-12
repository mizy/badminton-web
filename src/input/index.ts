/** 输入抽象层 — 统一入口 */

export type {
  InputAction,
  MoveDirection,
  InputEvent,
  InputSource,
  InputListener,
  InputAdapter,
} from './types'

export { createKeyboardAdapter } from './keyboard'
export type { KeyMapping } from './keyboard'

export { createGamepadAdapter } from './gamepad'
export type { GamepadMapping } from './gamepad'

export { createTouchAdapter, detectTap } from './touch'
export type { TouchZone } from './touch'
