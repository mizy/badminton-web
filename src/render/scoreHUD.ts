/**
 * 计分 HUD — 使用 Sprite + Canvas Texture 渲染到 3D 场景
 * 避免 HTML 覆盖层无法被 canvas.captureStream() 捕获的问题
 *
 * 使用 Sprite 替代 Mesh，确保在 SwiftShader headless 环境下可见
 * (Sprite 始终面向相机，无需每帧 lookAt)
 */

import * as THREE from 'three'

export interface ScoreHUD {
  mesh: THREE.Sprite
  update: (home: number, away: number, setStr: string, rally: number, isDeuce: boolean) => void
  syncPosition: (camera: THREE.Camera) => void
}

const CANVAS_W = 800
const CANVAS_H = 300
const SPRITE_W = 16
const SPRITE_H = 6

/** 纯文本缓存 key，避免每帧重绘 */
function cacheKey(home: number, away: number, setStr: string, rally: number, isDeuce: boolean): string {
  return `${home}:${away}|${setStr}|${rally}|${isDeuce}`
}

export function createScoreHUD(): ScoreHUD {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')!

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Sprite(material)
  mesh.scale.set(SPRITE_W, SPRITE_H, 1)
  mesh.renderOrder = 999 // render on top

  let lastKey = ''

  function draw(home: number, away: number, setStr: string, rally: number, isDeuce: boolean): void {
    const key = cacheKey(home, away, setStr, rally, isDeuce)
    if (key === lastKey) return
    lastKey = key

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Semi-transparent background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    roundRect(ctx, 10, 10, CANVAS_W - 20, CANVAS_H - 20, 28)

    // Draw colored team indicators (left = cyan, right = red)
    ctx.fillStyle = '#00ddff'
    ctx.font = 'bold 80px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', 40, 75)

    ctx.fillStyle = '#ff2255'
    ctx.textAlign = 'right'
    ctx.fillText('B', CANVAS_W - 40, 75)

    // Score line (center)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 80px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const scoreText = isDeuce ? `${home} : ${away}  DEUCE` : `${home} : ${away}`
    ctx.fillText(scoreText, CANVAS_W / 2, 75)

    // Set info
    if (setStr) {
      ctx.fillStyle = '#cccccc'
      ctx.font = '28px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(setStr, CANVAS_W / 2, 155)
    }

    // Rally count
    if (rally > 0) {
      ctx.fillStyle = '#ffcc00'
      ctx.font = '36px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`🏸 ${rally}`, CANVAS_W / 2, 225)
    }

    texture.needsUpdate = true
  }

  return {
    mesh,
    update: draw,
    syncPosition(_camera: THREE.Camera) {
      // Place HUD above net center at a fixed world position
      // This is reliably visible from the broadcast camera angle
      // Sprite automatically faces camera
      mesh.position.set(0, 3.2, 0)
    },
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
  ctx.fill()
}
