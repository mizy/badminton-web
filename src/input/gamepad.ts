/** 手柄输入适配 — Gamepad API → InputEvent */

import type { InputAdapter, InputListener } from './types'

export interface GamepadMapping {
  moveAxisX: number
  moveAxisY: number
  serveButton: number
  swingButton: number
  pauseButton: number
}

export const DEFAULT_GAMEPAD_MAP: GamepadMapping = {
  moveAxisX: 0,
  moveAxisY: 1,
  serveButton: 0,
  swingButton: 1,
  pauseButton: 9,
}

export function createGamepadAdapter(
  playerIndex: 0 | 1 = 0,
  mapping: GamepadMapping = DEFAULT_GAMEPAD_MAP,
): InputAdapter {
  let listener: InputListener | null = null
  let pollId: ReturnType<typeof requestAnimationFrame> | null = null

  function poll() {
    if (!listener) return
    const gamepads = navigator.getGamepads?.()
    if (!gamepads) { pollId = requestAnimationFrame(poll); return }

    const gp = gamepads[playerIndex]
    if (!gp) { pollId = requestAnimationFrame(poll); return }

    const x = gp.axes[mapping.moveAxisX] ?? 0
    const z = gp.axes[mapping.moveAxisY] ?? 0
    const deadZone = 0.15

    if (Math.abs(x) > deadZone || Math.abs(z) > deadZone) {
      const len = Math.sqrt(x * x + z * z)
      listener({
        action: { type: 'MOVE', dir: { x: x / len, z: z / len } },
        source: 'gamepad',
        timestamp: performance.now(),
        playerIndex,
      })
    } else if (Math.abs(x) <= deadZone && Math.abs(z) <= deadZone) {
      listener({
        action: { type: 'STOP_MOVE' },
        source: 'gamepad',
        timestamp: performance.now(),
        playerIndex,
      })
    }

    if (gp.buttons[mapping.serveButton]?.pressed) {
      listener({
        action: { type: 'SERVE' },
        source: 'gamepad',
        timestamp: performance.now(),
        playerIndex,
      })
    }

    if (gp.buttons[mapping.swingButton]?.pressed) {
      listener({
        action: { type: 'SWING_START' },
        source: 'gamepad',
        timestamp: performance.now(),
        playerIndex,
      })
    }

    if (gp.buttons[mapping.pauseButton]?.pressed) {
      listener({
        action: { type: 'PAUSE' },
        source: 'gamepad',
        timestamp: performance.now(),
        playerIndex,
      })
    }

    pollId = requestAnimationFrame(poll)
  }

  return {
    connect(l: InputListener) {
      listener = l
      pollId = requestAnimationFrame(poll)
    },
    disconnect() {
      listener = null
      if (pollId !== null) {
        cancelAnimationFrame(pollId)
        pollId = null
      }
    },
  }
}
