/** 球员 3D 网格 — 加大几何体 + 高饱和发光 + 头顶标记环 + 角色标签，便于视频可见 */

import * as THREE from 'three'

export interface PlayerMeshColors {
  body: number
  head: number
  racket: number
  marker: number   // 头顶标记色（高饱和发光）
}

const DEFAULT_COLORS: PlayerMeshColors = {
  body: 0x3366cc,
  head: 0xffcc99,
  racket: 0xcccccc,
  marker: 0x44aaff,
}

/** 创建彩色标签精灵 (如 "A" / "B") — 加大尺寸确保视频可见 */
function createLabelSprite(text: string, bgColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Background circle
  ctx.beginPath()
  ctx.arc(128, 128, 110, 0, Math.PI * 2)
  ctx.fillStyle = bgColor
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 8
  ctx.stroke()

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 128px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 136)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(5.0, 5.0, 1)
  sprite.position.y = 4.5
  return sprite
}

/** 创建球员位置地面标记 (跟随球员移动的彩色光环) */
export function createGroundMarker(color: number): THREE.Group {
  const group = new THREE.Group()

  // Outer ring — bright colored torus visible from above
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.8, 32), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  group.add(ring)

  // Inner fill — translucent colored circle
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), fillMat)
  fill.rotation.x = -Math.PI / 2
  fill.position.y = 0.01
  group.add(fill)

  return group
}

export function createPlayerMesh(
  colors: PlayerMeshColors = DEFAULT_COLORS,
  label = 'P',
): THREE.Group {
  const group = new THREE.Group()

  // Body (torso) — wider/taller for video visibility
  const bodyGeo = new THREE.CylinderGeometry(1.6, 1.8, 2.8, 12)
  const bodyMat = new THREE.MeshBasicMaterial({ color: colors.body })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 1.4
  body.castShadow = true
  group.add(body)

  // Head (sphere) — bigger for video visibility
  const headGeo = new THREE.SphereGeometry(0.75, 16, 12)
  const headMat = new THREE.MeshBasicMaterial({ color: colors.head })
  const head = new THREE.Mesh(headGeo, headMat)
  head.position.y = 2.8
  group.add(head)

  // Racket handle
  const racketGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6)
  const racketMat = new THREE.MeshBasicMaterial({ color: colors.racket })
  const racket = new THREE.Mesh(racketGeo, racketMat)
  racket.position.set(0.9, 1.5, 0)
  racket.rotation.z = -Math.PI / 4
  group.add(racket)

  // Racket head (ring)
  const ringGeo = new THREE.TorusGeometry(0.32, 0.06, 8, 14)
  const ringMat = new THREE.MeshBasicMaterial({ color: colors.racket })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.set(1.4, 2.5, 0)
  group.add(ring)

  // 头顶标记环（大尺寸 + 高饱和，用于视频中远距离区分阵营）
  const markerGeo = new THREE.TorusGeometry(1.8, 0.25, 12, 20)
  const markerMat = new THREE.MeshBasicMaterial({
    color: colors.marker,
    transparent: true,
    opacity: 1.0,
  })
  const marker = new THREE.Mesh(markerGeo, markerMat)
  marker.position.y = 3.5
  marker.rotation.x = Math.PI / 2
  group.add(marker)

  // 头顶标记光柱 (sprite glow) — much bigger and brighter
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 128
  glowCanvas.height = 128
  const ctx = glowCanvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  const colorHex = '#' + colors.marker.toString(16).padStart(6, '0')
  gradient.addColorStop(0, colorHex + 'ff')
  gradient.addColorStop(0.2, colorHex + 'aa')
  gradient.addColorStop(0.5, colorHex + '44')
  gradient.addColorStop(1, colorHex + '00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const glowTexture = new THREE.CanvasTexture(glowCanvas)
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(12.0, 12.0, 1)
  glow.position.y = 3.5
  group.add(glow)

  // 标签精灵 (显示 A/B 字母, 确保视频中清晰可见)
  const bgHex = '#' + colors.body.toString(16).padStart(6, '0')
  const labelSprite = createLabelSprite(label, bgHex)
  group.add(labelSprite)

  return group
}

export function updatePlayerMesh(
  group: THREE.Group,
  pos: [number, number, number],
  _facing: number,
): void {
  group.position.set(pos[0], 0, pos[2])
  group.rotation.y = _facing
}
