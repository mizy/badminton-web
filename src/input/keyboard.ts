/** 键盘输入适配 — KeyboardEvent → InputEvent */

import type { InputAdapter, InputEvent, InputListener } from './types'

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

export function createKeyboardAdapter(
  playerIndex: 0 | 1 = 0,
  keymap: KeyMapping = DEFAULT_KEYMAP,
): InputAdapter {
  let listener: InputListener | null = null
  let connected = false
  const pressed = new Set<string>()
  const movementKeys = new Set([
    keymap.moveUp,
    keymap.moveDown,
    keymap.moveLeft,
    keymap.moveRight,
  ])

  function handleKeyDown(e: KeyboardEvent) {
    if (!listener) return
    pressed.add(e.code)
    if (movementKeys.has(e.code)) {
      e.preventDefault()
      emitMovement()
      return
    }

    const evt: InputEvent = {
      action: { type: 'SERVE' },
      source: 'keyboard',
      timestamp: performance.now(),
      playerIndex,
    }

    if (e.code === keymap.serve) {
      e.preventDefault()
      evt.action = { type: 'SERVE' }
    } else if (e.code === keymap.swing) {
      e.preventDefault()
      evt.action = { type: 'SWING_START' }
    } else if (e.code === keymap.pause) {
      e.preventDefault()
      evt.action = { type: 'PAUSE' }
    } else {
      return
    }

    listener(evt)
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (!listener) return
    pressed.delete(e.code)
    if (movementKeys.has(e.code)) {
      e.preventDefault()
      emitMovement()
      return
    }
    if (e.code === keymap.swing) {
      e.preventDefault()
      listener({ action: { type: 'SWING_RELEASE' }, source: 'keyboard', timestamp: performance.now(), playerIndex })
    }
  }

  function computeMoveDirection(): { x: number; z: number } | null {
    let x = 0, z = 0
    if (pressed.has(keymap.moveRight)) x += 1
    if (pressed.has(keymap.moveLeft)) x -= 1
    if (pressed.has(keymap.moveUp)) z -= 1
    if (pressed.has(keymap.moveDown)) z += 1
    if (x === 0 && z === 0) return null
    const len = Math.sqrt(x * x + z * z)
    return { x: x / len, z: z / len }
  }

  function emitMovement() {
    if (!listener) return
    const dir = computeMoveDirection()
    if (dir) {
      listener({ action: { type: 'MOVE', dir }, source: 'keyboard', timestamp: performance.now(), playerIndex })
      return
    }
    listener({ action: { type: 'STOP_MOVE' }, source: 'keyboard', timestamp: performance.now(), playerIndex })
  }

  let moveInterval: ReturnType<typeof setInterval> | null = null

  function startMoveLoop() {
    stopMoveLoop()
    moveInterval = setInterval(() => {
      emitMovement()
    }, 1000 / 60)
  }

  function stopMoveLoop() {
    if (moveInterval !== null) {
      clearInterval(moveInterval)
      moveInterval = null
    }
  }

  return {
    connect(l: InputListener) {
      if (connected) return
      connected = true
      listener = l
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      startMoveLoop()
    },
    disconnect() {
      if (!connected) return
      connected = false
      listener = null
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      stopMoveLoop()
      pressed.clear()
    },
  }
}
