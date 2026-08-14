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
  /** 每帧调用：把 sprite 放到相机右上方固定屏幕位置（世界跟随）。 */
  syncPosition: (camera: THREE.Camera) => void
  /** 从场景移除 sprite（dispose 时调用）。 */
  detach: (scene: THREE.Scene) => void
}

const CANVAS_W = 800
const CANVAS_H = 300
/** 世界尺寸按屏幕占比缩小：约屏幕宽 1/3、高 1/6，不再盖住球场。 */
const SPRITE_W = 3.4
const SPRITE_H = 1.3
/** 相机局部坐标偏移（右、上、前），转世界后 sprite 固定在屏幕右上。 */
const SCREEN_OFFSET = new THREE.Vector3(2.7, 1.05, -6)

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
    syncPosition(camera: THREE.Camera) {
      // 世界跟随相机：偏移量经相机四元数转到世界，sprite 始终在屏幕右上角
      camera.updateMatrixWorld(true)
      camera.getWorldQuaternion(WORLD_QUAT)
      camera.getWorldPosition(WORLD_POS)
      SCREEN_OFFSET_TMP.copy(SCREEN_OFFSET).applyQuaternion(WORLD_QUAT)
      mesh.position.copy(WORLD_POS).add(SCREEN_OFFSET_TMP)
    },
    detach(scene: THREE.Scene) {
      scene.remove(mesh)
    },
  }
}

const WORLD_QUAT = new THREE.Quaternion()
const WORLD_POS = new THREE.Vector3()
const SCREEN_OFFSET_TMP = new THREE.Vector3()

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
