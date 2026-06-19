/** 羽毛球3D网格 — 球头 + 羽毛裙 + 柔和识别光晕 */

import * as THREE from 'three'

const HEAD_RADIUS = 0.045
const SKIRT_RADIUS = 0.12
const SKIRT_LENGTH = 0.22
const LOCAL_HEAD_DIRECTION = new THREE.Vector3(0, 1, 0)
const tangentDirection = new THREE.Vector3()

/** 创建羽毛球 Group (包含球头、裙部和柔和光晕) */
export function createShuttlecockMesh(): THREE.Group {
  const group = new THREE.Group()

  // Ball head (MeshBasicMaterial for guaranteed visibility)
  const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 14, 10)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf2c84b })
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

  // Soft glow sprite for readability without washing out the court.
  const innerCanvas = document.createElement('canvas')
  innerCanvas.width = 128
  innerCanvas.height = 128
  const ictx = innerCanvas.getContext('2d')!
  const igrad = ictx.createRadialGradient(64, 64, 0, 64, 64, 64)
  igrad.addColorStop(0, 'rgba(255, 255, 220, 0.45)')
  igrad.addColorStop(0.2, 'rgba(190, 245, 220, 0.28)')
  igrad.addColorStop(0.45, 'rgba(110, 220, 210, 0.12)')
  igrad.addColorStop(1, 'rgba(30, 150, 255, 0)')
  ictx.fillStyle = igrad
  ictx.fillRect(0, 0, 128, 128)

  const innerTexture = new THREE.CanvasTexture(innerCanvas)
  const innerMat = new THREE.SpriteMaterial({
    map: innerTexture,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  const innerGlow = new THREE.Sprite(innerMat)
  innerGlow.scale.set(0.42, 0.42, 1)
  innerGlow.position.y = 0.02
  group.add(innerGlow)

  // Outer glow (larger, dimmer) for long-distance visibility
  const outerCanvas = document.createElement('canvas')
  outerCanvas.width = 128
  outerCanvas.height = 128
  const octx = outerCanvas.getContext('2d')!
  const ograd = octx.createRadialGradient(64, 64, 0, 64, 64, 64)
  ograd.addColorStop(0, 'rgba(255, 210, 120, 0.16)')
  ograd.addColorStop(0.35, 'rgba(255, 180, 80, 0.08)')
  ograd.addColorStop(1, 'rgba(255, 100, 0, 0)')
  octx.fillStyle = ograd
  octx.fillRect(0, 0, 128, 128)

  const outerTexture = new THREE.CanvasTexture(outerCanvas)
  const outerMat = new THREE.SpriteMaterial({
    map: outerTexture,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const outerGlow = new THREE.Sprite(outerMat)
  outerGlow.scale.set(0.78, 0.78, 1)
  outerGlow.position.y = 0.02
  group.add(outerGlow)

  return group
}

export function syncShuttlecockMesh(
  group: THREE.Group,
  pos: [number, number, number],
  velocity: [number, number, number],
): void {
  group.position.set(pos[0], pos[1], pos[2])

  const speed2 = velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
  if (speed2 < 0.000001) return

  tangentDirection.set(velocity[0], velocity[1], velocity[2]).normalize()
  group.quaternion.setFromUnitVectors(LOCAL_HEAD_DIRECTION, tangentDirection)
}

export function getShuttlecockHeadCenter(
  pos: [number, number, number],
  velocity: [number, number, number],
): [number, number, number] {
  const speed = Math.hypot(velocity[0], velocity[1], velocity[2])
  if (speed < 0.000001) {
    return [pos[0], pos[1] + HEAD_RADIUS, pos[2]]
  }

  return [
    pos[0] + velocity[0] / speed * HEAD_RADIUS,
    pos[1] + velocity[1] / speed * HEAD_RADIUS,
    pos[2] + velocity[2] / speed * HEAD_RADIUS,
  ]
}

export function getShuttlecockHeadGroundClearance(
  pos: [number, number, number],
  velocity: [number, number, number],
  groundY = 0,
): number {
  const headCenter = getShuttlecockHeadCenter(pos, velocity)
  return headCenter[1] - HEAD_RADIUS - groundY
}

export function hasShuttlecockHeadLanded(
  pos: [number, number, number],
  velocity: [number, number, number],
  groundY = 0,
): boolean {
  return getShuttlecockHeadGroundClearance(pos, velocity, groundY) <= 0
}

export function placeShuttlecockHeadOnGround(
  pos: [number, number, number],
  velocity: [number, number, number],
  groundY = 0,
): [number, number, number] {
  const clearance = getShuttlecockHeadGroundClearance(pos, velocity, groundY)
  return [pos[0], pos[1] - clearance, pos[2]]
}

/** 羽球缩放比例 — 供外部参考调整尺寸 */
export const SHUTTLE_VISUAL_SCALE = {
  headRadius: HEAD_RADIUS,
  skirtRadius: SKIRT_RADIUS,
  skirtLength: SKIRT_LENGTH,
}
