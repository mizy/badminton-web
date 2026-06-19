import * as THREE from 'three'
import { createScoreHUD } from './scoreHUD'

export interface GameHUD {
  resetScore(): void
  resetStatusText(): void
  setStatusText(text: string): void
  sync(camera: THREE.Camera): void
  updateScore(home: number, away: number, setText: string, rally: number, isDeuce: boolean): void
}

export function createGameHUD(scene: THREE.Scene, defaultStatusText: string): GameHUD {
  const scoreHUD = createScoreHUD()
  scene.add(scoreHUD.mesh)

  const statusMesh = createStatusMesh()
  scene.add(statusMesh)

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
    'background:rgba(0,0,0,0.5)',
    'padding:8px 24px',
    'border-radius:12px',
    'backdrop-filter:blur(4px)',
    'letter-spacing:2px',
  ], '0 : 0')

  const setOverlay = createOverlay('set-overlay', [
    'position:fixed',
    'top:60px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#aaa',
    'font:14px monospace',
    'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], '')

  const rallyOverlay = createOverlay('rally-overlay', [
    'position:fixed',
    'top:85px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#ffcc00',
    'font:16px monospace',
    'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], '')

  const statusOverlay = createOverlay('status', [
    'position:fixed',
    'bottom:20px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:#aaa',
    'font:14px monospace',
    'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
    'z-index:10',
    'text-align:center',
    'pointer-events:none',
    'user-select:none',
  ], defaultStatusText)

  return {
    resetScore() {
      scoreHUD.update(0, 0, '', 0, false)
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
    sync(camera: THREE.Camera) {
      scoreHUD.syncPosition(camera)
    },
    updateScore(home: number, away: number, setText: string, rally: number, isDeuce: boolean) {
      scoreHUD.update(home, away, setText, rally, isDeuce)
      scoreOverlay.textContent = isDeuce ? `${home} : ${away}  DEUCE` : `${home} : ${away}`
      setOverlay.textContent = setText
      rallyOverlay.textContent = rally > 0 ? `🏸 ${rally}` : ''
    },
  }
}

function createStatusMesh(): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128

  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgba(0,0,0,0.6)'
  roundRectPolyfill(context, 0, 0, 512, 128, 16)
  context.fill()
  context.fillStyle = '#00ff88'
  context.font = 'bold 36px monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('Human vs AI  -  WASD + J + Space', 256, 52)
  context.fillStyle = '#aaaaaa'
  context.font = '20px monospace'
  context.fillText('SPACE:发球  J:击球  WASD:移动  R:录像  C:视角', 256, 96)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), material)
  mesh.position.set(0, 1.2, 3.0)
  mesh.renderOrder = 998
  return mesh
}

function createOverlay(id: string, styles: string[], text: string): HTMLDivElement {
  const element = document.createElement('div')
  element.id = id
  element.style.cssText = styles.join(';')
  element.textContent = text
  document.body.appendChild(element)
  return element
}

function roundRectPolyfill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }

  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
