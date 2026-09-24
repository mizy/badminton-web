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

export { combineInputAdapters } from './combined'

export { createGamepadAdapter } from './gamepad'
export type { GamepadMapping } from './gamepad'

export { createTouchAdapter, detectTap } from './touch'
export type { TouchZone } from './touch'

export {
  AIM_DEADZONE,
  AIM_DRAG_UNIT,
  STICK_DEADZONE,
  TAP_CHARGE,
  TAP_RELEASE_MS,
  aimFromDrag,
  clampStickOffset,
  createTouchControlsAdapter,
  isTouchDevice,
  moveVectorFromStick,
  swingReleaseAction,
  swingSelectAction,
  swingStartAction,
} from './touchControls'
export type { TouchControlsOptions } from './touchControls'
