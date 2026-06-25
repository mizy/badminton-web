/**
 * 2D HUD overlay — pure DOM, no 3D scene objects.
 *
 * All elements use position:fixed so they stay screen-anchored
 * regardless of camera movement. The recorder composites them
 * onto the video frame via updateHud() → composite().
 */

export interface GameHUD {
  resetScore(): void
  resetStatusText(): void
  setStatusText(text: string): void
  /** No-op kept for call-site compatibility (was camera sync). */
  sync(): void
  updateScore(home: number, away: number, setText: string, rally: number, isDeuce: boolean): void
}

export function createGameHUD(defaultStatusText: string): GameHUD {
  /* ── scoreboard pill (top center) ── */
  const scoreOverlay = createOverlay('score-overlay', [
    'position:fixed',
    'top:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#fff',
    'font:bold 28px/1.2 monospace',
    'text-shadow:0 2px 8px rgba(0,0,0,0.9)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
    'background:rgba(0,0,0,0.55)',
    'padding:8px 28px',
    'border-radius:14px',
    'backdrop-filter:blur(6px)',
    'letter-spacing:2px',
  ], '0 : 0')

  /* ── set info (below scoreboard) ── */
  const setOverlay = createOverlay('set-overlay', [
    'position:fixed',
    'top:62px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#aaa',
    'font:13px monospace',
    'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], '')

  /* ── rally counter (below set) ── */
  const rallyOverlay = createOverlay('rally-overlay', [
    'position:fixed',
    'top:84px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#ffcc00',
    'font:15px monospace',
    'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], '')

  /* ── controls hint (bottom center) ── */
  createOverlay('controls-hud', [
    'position:fixed',
    'bottom:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#ccc',
    'font:13px/1.5 monospace',
    'text-shadow:0 1px 6px rgba(0,0,0,0.9)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
    'background:rgba(0,0,0,0.45)',
    'padding:6px 20px',
    'border-radius:10px',
    'backdrop-filter:blur(4px)',
    'white-space:nowrap',
  ], 'SPACE:发球  J:击球  WASD:移动  R:录像  C:视角')

  /* ── status text (above controls) ── */
  const statusOverlay = createOverlay('status', [
    'position:fixed',
    'bottom:52px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#00ff88',
    'font:bold 14px monospace',
    'text-shadow:0 1px 6px rgba(0,0,0,0.9)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], defaultStatusText)

  return {
    resetScore() {
      scoreOverlay.textContent = '0 : 0'
      setOverlay.textContent = ''
      rallyOverlay.textContent = ''
    },
    resetStatusText() {
      statusOverlay.textContent = defaultStatusText
    },
    setStatusText(text: string) {
      statusOverlay.textContent = text
    },
    sync() {
      // No-op: 2D overlays don't need camera sync
    },
    updateScore(home: number, away: number, setText: string, rally: number, isDeuce: boolean) {
      scoreOverlay.textContent = isDeuce ? `${home} : ${away}  DEUCE` : `${home} : ${away}`
      setOverlay.textContent = setText
      rallyOverlay.textContent = rally > 0 ? `🏸 ${rally}` : ''
    },
  }
}

/* ── helpers ── */

function createOverlay(id: string, styles: string[], text: string): HTMLDivElement {
  const element = document.createElement('div')
  element.id = id
  element.style.cssText = styles.join(';')
  element.textContent = text
  document.body.appendChild(element)
  return element
}
