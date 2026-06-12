/** 触屏输入适配 — TouchEvent → InputEvent */

import type { InputAdapter, InputListener } from './types'

export interface TouchZone {
  x: number
  y: number
  width: number
  height: number
}

export const SWIPE_THRESHOLD = 20

export function createTouchAdapter(
  playerIndex: 0 | 1 = 0,
  _zones?: TouchZone[],
): InputAdapter {
  let listener: InputListener | null = null
  let touchStartX = 0
  let touchStartY = 0
  let touchActive = false

  function handleTouchStart(e: TouchEvent) {
    if (!listener) return
    e.preventDefault()
    const t = e.touches[0]
    if (!t) return
    touchStartX = t.clientX
    touchStartY = t.clientY
    touchActive = true
  }

  function handleTouchMove(e: TouchEvent) {
    if (!listener || !touchActive) return
    e.preventDefault()
    const t = e.touches[0]
    if (!t) return

    const dx = t.clientX - touchStartX
    const dy = t.clientY - touchStartY

    if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
      const nx = Math.max(-1, Math.min(1, dx / 100))
      const nz = Math.max(-1, Math.min(1, dy / 100))
      const len = Math.sqrt(nx * nx + nz * nz)
      listener({
        action: { type: 'MOVE', dir: { x: nx / len, z: nz / len } },
        source: 'touch',
        timestamp: performance.now(),
        playerIndex,
      })
    }
  }

  function handleTouchEnd(_e: TouchEvent) {
    if (!listener) return
    touchActive = false
    listener({
      action: { type: 'STOP_MOVE' },
      source: 'touch',
      timestamp: performance.now(),
      playerIndex,
    })
  }

  return {
    connect(l: InputListener) {
      listener = l
      window.addEventListener('touchstart', handleTouchStart, { passive: false })
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd, { passive: true })
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    },
    disconnect() {
      listener = null
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    },
  }
}

/** Single tap helper */
export function detectTap(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold: number = SWIPE_THRESHOLD,
): boolean {
  return Math.abs(endX - startX) < threshold && Math.abs(endY - startY) < threshold
}
