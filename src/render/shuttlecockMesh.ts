/** 羽毛球3D网格 — 球头 + 羽毛裙 + 强发光（放大为视频可见） */

import * as THREE from 'three'

const HEAD_RADIUS = 1.00   // 放大为演示可见
const SKIRT_RADIUS = 1.20  // 放大为演示可见
const SKIRT_LENGTH = 1.30  // 放大为演示可见

/** 创建羽毛球 Group (包含球头、裙部和多层发光光晕) */
export function createShuttlecockMesh(): THREE.Group {
  const group = new THREE.Group()

  // Ball head (MeshBasicMaterial for guaranteed visibility)
  const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 14, 10)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 })
  const head = new THREE.Mesh(headGeo, headMat)
  head.position.y = HEAD_RADIUS
  group.add(head)

  // Skirt (cone)
  const skirtMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  })
  const skirtGeo = new THREE.ConeGeometry(SKIRT_RADIUS, SKIRT_LENGTH, 10)
  const skirt = new THREE.Mesh(skirtGeo, skirtMat)
  skirt.position.y = -SKIRT_LENGTH * 0.35
  group.add(skirt)

  // Bright inner glow sprite
  const innerCanvas = document.createElement('canvas')
  innerCanvas.width = 128
  innerCanvas.height = 128
  const ictx = innerCanvas.getContext('2d')!
  const igrad = ictx.createRadialGradient(64, 64, 0, 64, 64, 64)
  igrad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  igrad.addColorStop(0.1, 'rgba(200, 255, 255, 0.95)')
  igrad.addColorStop(0.3, 'rgba(100, 220, 255, 0.6)')
  igrad.addColorStop(0.6, 'rgba(50, 200, 255, 0.3)')
  igrad.addColorStop(1, 'rgba(30, 150, 255, 0)')
  ictx.fillStyle = igrad
  ictx.fillRect(0, 0, 128, 128)

  const innerTexture = new THREE.CanvasTexture(innerCanvas)
  const innerMat = new THREE.SpriteMaterial({
    map: innerTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const innerGlow = new THREE.Sprite(innerMat)
  innerGlow.scale.set(14.0, 14.0, 1)
  innerGlow.position.y = 0.02
  group.add(innerGlow)

  // Outer glow (larger, dimmer) for long-distance visibility
  const outerCanvas = document.createElement('canvas')
  outerCanvas.width = 128
  outerCanvas.height = 128
  const octx = outerCanvas.getContext('2d')!
  const ograd = octx.createRadialGradient(64, 64, 0, 64, 64, 64)
  ograd.addColorStop(0, 'rgba(255, 200, 100, 0.6)')
  ograd.addColorStop(0.3, 'rgba(255, 150, 50, 0.3)')
  ograd.addColorStop(1, 'rgba(255, 100, 0, 0)')
  octx.fillStyle = ograd
  octx.fillRect(0, 0, 128, 128)

  const outerTexture = new THREE.CanvasTexture(outerCanvas)
  const outerMat = new THREE.SpriteMaterial({
    map: outerTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const outerGlow = new THREE.Sprite(outerMat)
  outerGlow.scale.set(30.0, 30.0, 1)
  outerGlow.position.y = 0.02
  group.add(outerGlow)

  return group
}

/** 羽球缩放比例 — 供外部参考调整尺寸 */
export const SHUTTLE_VISUAL_SCALE = {
  headRadius: HEAD_RADIUS,
  skirtRadius: SKIRT_RADIUS,
  skirtLength: SKIRT_LENGTH,
}
