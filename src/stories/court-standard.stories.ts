/**
 * 标准羽毛球场地 · BWF 竞赛规则尺寸
 * 
 * 全场 13.40m × 6.10m（双打），单打宽 5.18m
 * 所有线条、区域、网柱均按规则绘制，附带尺寸标注。
 * 
 * @entry Storybook — 仅用于场地展示验收
 */

import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { mountScene } from './threeHelper'

// ── BWF 标准尺寸（单位：m）──────────────────────────────
const FULL_LENGTH = 13.40
const HALF_LENGTH = FULL_LENGTH / 2               // 6.70
const DOUBLE_WIDTH = 6.10
const SINGLE_WIDTH = 5.18
const HALF_DOUBLE = DOUBLE_WIDTH / 2               // 3.05
const HALF_SINGLE = SINGLE_WIDTH / 2               // 2.59
const NET_HEIGHT = 1.55
const NET_THICKNESS = 0.08
const LINE_W = 0.04                                // 线宽 40mm（BWF 规则 ≤40mm）
const SERVE_LINE_DIST = 1.98                       // 前发球线距网
const BACK_SERVE_OFFSET = 0.76                     // 双打后发球线距底线
const BACK_SERVE_X = HALF_LENGTH - BACK_SERVE_OFFSET // 5.94

// ── 颜色 ──────────────────────────────────────────────
const LINE_COLOR = 0xffffff
const SINGLE_LINE_COLOR = 0xffffaa
const NET_COLOR = 0xcccccc
const NET_GRID_COLOR = 0xaa4444
const POST_COLOR = 0x999999
const LABEL_BG = 'rgba(0,0,0,0.75)'
const LABEL_TEXT = '#ffffff'

/** 创建文字 Sprite（CanvasTexture 方式，兼容 SwiftShader） */
function makeLabel(text: string, color = LABEL_TEXT, bg = LABEL_BG): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, 512, 128, 16)
  ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 40px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 64)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(4, 1, 1)
  return sprite
}

/** 创建尺寸标注（小号文字） */
function makeDimLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 80
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  roundRect(ctx, 0, 0, 512, 80, 12)
  ctx.fill()
  ctx.fillStyle = '#aaddff'
  ctx.font = 'bold 32px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 42)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3, 0.47, 1)
  return sprite
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

/** 画一条线（BoxGeometry 长条） */
function addLine(
  scene: THREE.Scene,
  w: number, h: number, d: number,
  color: number,
  x: number, y: number, z: number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mat = new THREE.MeshBasicMaterial({ color })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  scene.add(mesh)
  return mesh
}

/** 构建标准羽毛球场地 */
function buildCourt(scene: THREE.Scene): void {
  // ── 地板 ──
  const floorGeo = new THREE.PlaneGeometry(FULL_LENGTH + 2, DOUBLE_WIDTH + 2)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.01
  floor.receiveShadow = true
  scene.add(floor)

  // ── 场地内浅色地板（双打区域） ──
  const innerGeo = new THREE.PlaneGeometry(FULL_LENGTH, DOUBLE_WIDTH)
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x338833, roughness: 0.6 })
  const inner = new THREE.Mesh(innerGeo, innerMat)
  inner.rotation.x = -Math.PI / 2
  inner.receiveShadow = true
  scene.add(inner)

  // ── 双打边线（外侧边界） ──
  const lineY = 0.005
  for (const zSign of [-1, 1]) {
    addLine(scene, FULL_LENGTH, 0.01, LINE_W, LINE_COLOR, 0, lineY, zSign * HALF_DOUBLE)
  }
  addLine(scene, LINE_W, 0.01, DOUBLE_WIDTH, LINE_COLOR, -HALF_LENGTH, lineY, 0)
  addLine(scene, LINE_W, 0.01, DOUBLE_WIDTH, LINE_COLOR, HALF_LENGTH, lineY, 0)

  // ── 单打边线（内侧，淡黄色） ──
  for (const zSign of [-1, 1]) {
    addLine(scene, FULL_LENGTH, 0.01, LINE_W, SINGLE_LINE_COLOR, 0, lineY, zSign * HALF_SINGLE)
  }

  // ── 前发球线（距网 1.98m） ──
  for (const xSign of [-1, 1]) {
    addLine(scene, LINE_W, 0.01, DOUBLE_WIDTH, LINE_COLOR, xSign * SERVE_LINE_DIST, lineY, 0)
  }

  // ── 双打后发球线（距底线 0.76m） ──
  for (const xSign of [-1, 1]) {
    addLine(scene, LINE_W, 0.01, SINGLE_WIDTH, LINE_COLOR, xSign * BACK_SERVE_X, lineY, 0)
  }

  // ── 中心线（从网到前发球线 + 从前发球线到底线） ──
  for (const xSign of [-1, 1]) {
    addLine(scene, SERVE_LINE_DIST, 0.01, LINE_W, LINE_COLOR, xSign * SERVE_LINE_DIST / 2, lineY, 0)
    addLine(scene, HALF_LENGTH - SERVE_LINE_DIST, 0.01, LINE_W, LINE_COLOR, xSign * (SERVE_LINE_DIST + (HALF_LENGTH - SERVE_LINE_DIST) / 2), lineY, 0)
  }

  // ── 网 ──
  const netMat = new THREE.MeshBasicMaterial({
    color: NET_COLOR,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  })
  const netGeo = new THREE.BoxGeometry(NET_THICKNESS, NET_HEIGHT, DOUBLE_WIDTH)
  const net = new THREE.Mesh(netGeo, netMat)
  net.position.set(0, NET_HEIGHT / 2, 0)
  scene.add(net)

  // 网格竖线（红色）
  const NUM_V = 11
  for (let i = 0; i < NUM_V; i++) {
    const z = -HALF_DOUBLE + (DOUBLE_WIDTH / (NUM_V - 1)) * i
    addLine(scene, NET_THICKNESS + 0.02, NET_HEIGHT, 0.03, NET_GRID_COLOR, 0, NET_HEIGHT / 2, z)
  }
  // 网格横线
  for (const yFrac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    addLine(scene, NET_THICKNESS + 0.02, 0.04, DOUBLE_WIDTH, NET_GRID_COLOR, 0, NET_HEIGHT * yFrac, 0)
  }

  // 上网带（白色）
  addLine(scene, 0.15, 0.08, DOUBLE_WIDTH + 0.3, 0xffffff, 0, NET_HEIGHT + 0.04, 0)
  // 下网带
  addLine(scene, 0.12, 0.06, DOUBLE_WIDTH + 0.2, 0xeeeeee, 0, 0.03, 0)
  // 中心红色标记
  addLine(scene, 0.10, NET_HEIGHT, 0.04, 0xff0000, 0, NET_HEIGHT / 2, 0)

  // ── 网柱 ──
  const postMat = new THREE.MeshStandardMaterial({ color: POST_COLOR, roughness: 0.3, metalness: 0.4 })
  for (const zSign of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, NET_HEIGHT + 0.3, 8),
      postMat,
    )
    post.position.set(0, (NET_HEIGHT + 0.3) / 2, zSign * HALF_DOUBLE)
    scene.add(post)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 6),
      postMat,
    )
    cap.position.set(0, NET_HEIGHT + 0.3, zSign * HALF_DOUBLE)
    scene.add(cap)
  }

  // ── 发球区标记点 ──
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), dotMat)
      dot.position.set(xSign * SERVE_LINE_DIST, 0.02, zSign * HALF_SINGLE)
      scene.add(dot)
    }
  }

  // ── 尺寸标注 ──
  const labelY = 0.5

  const lenLabel = makeDimLabel('13.40m（全场）')
  lenLabel.position.set(0, labelY, -HALF_DOUBLE - 1.2)
  scene.add(lenLabel)

  const halfLabel = makeDimLabel('6.70m')
  halfLabel.position.set(-HALF_LENGTH / 2, labelY, -HALF_DOUBLE - 1.2)
  scene.add(halfLabel)

  const halfLabel2 = makeDimLabel('6.70m')
  halfLabel2.position.set(HALF_LENGTH / 2, labelY, -HALF_DOUBLE - 1.2)
  scene.add(halfLabel2)

  const dwLabel = makeDimLabel('双打 6.10m')
  dwLabel.position.set(HALF_LENGTH + 0.8, labelY, 0)
  scene.add(dwLabel)

  const swLabel = makeDimLabel('单打 5.18m')
  swLabel.position.set(HALF_LENGTH + 0.8, labelY, -HALF_SINGLE / 2)
  swLabel.scale.set(2.8, 0.44, 1)
  scene.add(swLabel)

  const slLabel = makeDimLabel('前发球线 1.98m')
  slLabel.position.set(SERVE_LINE_DIST, labelY, HALF_DOUBLE + 1.0)
  slLabel.scale.set(3, 0.47, 1)
  scene.add(slLabel)

  const blLabel = makeDimLabel('后发球线 0.76m')
  blLabel.position.set(HALF_LENGTH - BACK_SERVE_OFFSET / 2, labelY, HALF_DOUBLE + 1.0)
  blLabel.scale.set(2.5, 0.4, 1)
  scene.add(blLabel)

  const netHeightLabel = makeDimLabel('网高 1.55m')
  netHeightLabel.position.set(0.8, NET_HEIGHT / 2, HALF_DOUBLE + 0.8)
  netHeightLabel.scale.set(2, 0.35, 1)
  scene.add(netHeightLabel)

  // ── 标题 ──
  const title = makeLabel('🏸 标准羽毛球场 · BWF 竞赛规则', '#00ffaa')
  title.position.set(0, 5.5, -HALF_DOUBLE - 2.5)
  title.scale.set(8, 2, 1)
  scene.add(title)

  // ── 区域标注 ──
  const zoneStyle = '#ffcc44'
  const zones = [
    { text: '右发球区', x: -HALF_LENGTH / 2 + 0.5, z: HALF_SINGLE / 2 },
    { text: '左发球区', x: -HALF_LENGTH / 2 + 0.5, z: -HALF_SINGLE / 2 },
    { text: '右发球区', x: HALF_LENGTH / 2 - 0.5, z: HALF_SINGLE / 2 },
    { text: '左发球区', x: HALF_LENGTH / 2 - 0.5, z: -HALF_SINGLE / 2 },
    { text: '前场', x: -SERVE_LINE_DIST / 2, z: 0, scale: 1.8 },
    { text: '后场', x: -(SERVE_LINE_DIST + HALF_LENGTH) / 2, z: 0, scale: 1.8 },
    { text: '前场', x: SERVE_LINE_DIST / 2, z: 0, scale: 1.8 },
    { text: '后场', x: (SERVE_LINE_DIST + HALF_LENGTH) / 2, z: 0, scale: 1.8 },
  ]
  for (const z of zones) {
    const lbl = makeLabel(z.text, zoneStyle, 'rgba(0,0,0,0.4)')
    lbl.position.set(z.x, 0.3, z.z)
    lbl.scale.set(z.scale || 2.5, 0.6, 1)
    scene.add(lbl)
  }
}

// ── Story ──────────────────────────────────────────────

const meta: Meta = {
  title: 'Scene/标准羽毛球场',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '800px'
    container.style.position = 'relative'
    container.style.background = '#111'

    const ctx = mountScene(container)

    ctx.camera.position.set(0, 12, -9)
    ctx.camera.lookAt(0, 0, 0)

    buildCourt(ctx.scene)

    return container
  },
}

export default meta

export const Default: StoryObj = {}

export const TopDown: StoryObj = {
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '800px'
    container.style.position = 'relative'
    container.style.background = '#111'

    const ctx = mountScene(container)

    ctx.camera.position.set(0, 14, 0.01)
    ctx.camera.lookAt(0, 0, 0)

    buildCourt(ctx.scene)

    return container
  },
}

export const SideView: StoryObj = {
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '800px'
    container.style.position = 'relative'
    container.style.background = '#111'

    const ctx = mountScene(container)

    ctx.camera.position.set(0, 2, -11)
    ctx.camera.lookAt(0, 1.2, 0)

    buildCourt(ctx.scene)

    return container
  },
}
