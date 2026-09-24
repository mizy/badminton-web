/** 键盘输入适配 — KeyboardEvent → InputEvent（以己方底线视角为准） */

import type { ShotAim } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import type { InputAction, InputAdapter, InputListener } from './types'

export interface KeyMapping {
  moveUp: string
  moveDown: string
  moveLeft: string
  moveRight: string
  serve: string
  swing: string
  pause: string
}

const DEFAULT_KEYMAP: KeyMapping = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  serve: 'Space',
  swing: 'KeyJ',
  pause: 'Escape',
}

const SHOT_KEYS: Readonly<Record<string, ShotType>> = {
  KeyJ: 'CLEAR',
  KeyK: 'DROP',
  KeyL: 'SMASH',
  KeyU: 'DRIVE',
  KeyI: 'NET_DROP',
  KeyO: 'LIFT',
  Digit1: 'CLEAR',
  Digit2: 'DROP',
  Digit3: 'SMASH',
  Digit4: 'DRIVE',
  Digit5: 'NET_DROP',
  Digit6: 'LIFT',
}

/** 同时检查聚焦元素和事件路径，覆盖可编辑子节点及 shadow DOM。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable === true ||
    (typeof element.closest === 'function' &&
      element.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])') !== null))
}

export function isEditingInput(event: Event): boolean {
  return isEditableTarget(document.activeElement) || isEditableTarget(event.target) ||
    event.composedPath().some(isEditableTarget)
}

export function createKeyboardAdapter(
  playerIndex: 0 | 1 = 0,
  keymap: KeyMapping = DEFAULT_KEYMAP,
  getSide: () => 0 | 1 = () => playerIndex,
): InputAdapter {
  let listener: InputListener | null = null
  let connected = false
  let aim: ShotAim = { lateral: 0, depth: 0 }
  const pressed = new Set<string>()
  const swinging = new Set<string>()
  const movementKeys = new Set([
    keymap.moveUp, keymap.moveDown, keymap.moveLeft, keymap.moveRight,
  ])
  const shiftKeys = new Set(['ShiftLeft', 'ShiftRight'])
  const aimKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyX'])
  const handledKeys = new Set([
    ...movementKeys, ...aimKeys, ...shiftKeys, ...Object.keys(SHOT_KEYS),
    keymap.serve, keymap.swing, keymap.pause, 'KeyQ',
  ])

  function emit(action: InputAction) {
    listener?.({ action, source: 'keyboard', timestamp: performance.now(), playerIndex })
  }

  function emitMovement() {
    const forward = Number(pressed.has(keymap.moveUp)) - Number(pressed.has(keymap.moveDown))
    const right = Number(pressed.has(keymap.moveRight)) - Number(pressed.has(keymap.moveLeft))
    const length = Math.hypot(forward, right)
    if (length === 0) {
      emit({ type: 'STOP_MOVE' })
      return
    }
    const sign = getSide() === 0 ? 1 : -1
    emit({ type: 'MOVE', dir: { x: (forward * sign / length) || 0, z: (right * sign / length) || 0 } })
  }

  function clearPressed() {
    const swingCount = swinging.size
    pressed.clear()
    swinging.clear()
    // 仅为实际发出过 start 的按键配对 release，避免自定义移动键冲突。
    for (let i = 0; i < swingCount; i++) emit({ type: 'SWING_RELEASE' })
    emit({ type: 'STOP_MOVE' })
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!listener || !handledKeys.has(event.code)) return
    if (isEditingInput(event)) {
      if (pressed.size) clearPressed()
      return
    }
    event.preventDefault()
    if (event.repeat || pressed.has(event.code)) return
    pressed.add(event.code)

    if (movementKeys.has(event.code)) emitMovement()
    else if (shiftKeys.has(event.code)) return
    else if (SHOT_KEYS[event.code] || event.code === keymap.swing) {
      const slice = pressed.has('ShiftLeft') || pressed.has('ShiftRight')
      const shot = SHOT_KEYS[event.code]
      swinging.add(event.code)
      // 落点用同一 WASD：按击球键时采样移动方向作为瞄准，双手无需离开常用键位。
      // 无方向按下时保留现有 aim（含箭头/X 设置），不覆盖。
      const forward = Number(pressed.has(keymap.moveUp)) - Number(pressed.has(keymap.moveDown))
      const lateral = Number(pressed.has(keymap.moveRight)) - Number(pressed.has(keymap.moveLeft))
      const sampled = { lateral: Math.sign(lateral), depth: Math.sign(forward) }
      const swingAim: ShotAim = sampled.lateral || sampled.depth ? sampled : aim
      emit(shot ? { type: 'SWING_START', shot, slice, aim: swingAim } : { type: 'SWING_START', slice, aim: swingAim })
    }
    else if (event.code === keymap.serve) emit({ type: 'SERVE_OR_JUMP' })
    else if (event.code === keymap.pause) emit({ type: 'PAUSE' })
    else if (event.code === 'KeyQ') emit({ type: 'SCISSOR_STEP' })
    else if (aimKeys.has(event.code)) {
      switch (event.code) {
        case 'ArrowLeft': aim = { ...aim, lateral: -1 }; break
        case 'ArrowRight': aim = { ...aim, lateral: 1 }; break
        case 'ArrowUp': aim = { ...aim, depth: 1 }; break
        case 'ArrowDown': aim = { ...aim, depth: -1 }; break
        case 'KeyX': aim = { lateral: 0, depth: 0 }; break
      }
      emit({ type: 'AIM', aim: { ...aim } })
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (!listener) return
    if (isEditingInput(event)) {
      if (pressed.size) clearPressed()
      return
    }
    if (!pressed.delete(event.code)) return
    event.preventDefault()
    if (movementKeys.has(event.code)) emitMovement()
    else if (swinging.delete(event.code)) emit({ type: 'SWING_RELEASE' })
  }

  function handleVisibilityChange() {
    if (document.hidden || document.visibilityState === 'hidden') clearPressed()
  }

  function handleFocusIn(event: FocusEvent) {
    if (pressed.size && isEditingInput(event)) clearPressed()
  }

  return {
    connect(nextListener) {
      if (connected) return
      connected = true
      listener = nextListener
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.addEventListener('blur', clearPressed)
      window.addEventListener('focusin', handleFocusIn)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    },
    disconnect() {
      if (!connected) return
      connected = false
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearPressed)
      window.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearPressed()
      listener = null
    },
  }
}
