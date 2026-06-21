/** 球员 3D 网格 — voxel 风格运动员，远景下优先保证轮廓和持拍方向可读 */

import * as THREE from 'three'

export interface PlayerMeshColors {
  body: number
  head: number
  racket: number
  marker: number   // 头顶标记色
}

export interface PlayerMeshOptions {
  glowScale?: number
  labelScale?: number
}

const RACKET_GROUP_NAME = 'player-racket'

const DEFAULT_COLORS: PlayerMeshColors = {
  body: 0x3366cc,
  head: 0xffcc99,
  racket: 0xcccccc,
  marker: 0x44aaff,
}

/** 创建彩色标签精灵 (如 "A" / "B") */
function createLabelSprite(text: string, bgColor: string, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 192
  const ctx = canvas.getContext('2d')!

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Pixel-style square badge.
  ctx.fillStyle = bgColor
  ctx.fillRect(28, 28, 136, 136)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 10
  ctx.strokeRect(28, 28, 136, 136)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 104px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 96, 102)

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
  sprite.scale.set(scale, scale, 1)
  sprite.position.y = 4.5
  return sprite
}

function createMaterial(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0.04,
    roughness,
  })
}

function addMesh(group: THREE.Group, mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function createCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  return mesh
}

function createBox(
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  return mesh
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
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 32), ringMat)
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
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.35, 32), fillMat)
  fill.rotation.x = -Math.PI / 2
  fill.position.y = 0.01
  group.add(fill)

  return group
}

export function createPlayerMesh(
  colors: PlayerMeshColors = DEFAULT_COLORS,
  label = 'P',
  options: PlayerMeshOptions = {},
): THREE.Group {
  const glowScale = options.glowScale ?? 0.7
  const labelScale = options.labelScale ?? 0.45
  const group = new THREE.Group()

  const uniformMat = createMaterial(colors.body, 0.65)
  const accentMat = createMaterial(colors.marker, 0.55)
  const skinMat = createMaterial(colors.head, 0.9)
  const darkMat = createMaterial(0x1f2633, 0.85)
  const shoeMat = createMaterial(0xf2f4f7, 0.75)
  const racketMat = createMaterial(colors.racket, 0.35)

  addVoxelBody(group, uniformMat, accentMat, skinMat, darkMat, shoeMat)
  addRacket(group, racketMat)
  addMarker(group, colors.marker, glowScale)

  if (labelScale > 0) {
    const bgHex = '#' + colors.body.toString(16).padStart(6, '0')
    const labelSprite = createLabelSprite(label, bgHex, labelScale)
    labelSprite.position.y = 2.95
    group.add(labelSprite)
  }

  return group
}

function addVoxelBody(
  group: THREE.Group,
  uniformMat: THREE.Material,
  accentMat: THREE.Material,
  skinMat: THREE.Material,
  darkMat: THREE.Material,
  shoeMat: THREE.Material,
): void {
  addMesh(group, createBox([0.32, 0.12, 0.48], shoeMat, [-0.17, 0.06, 0.13], [0, 0.2, 0]))
  addMesh(group, createBox([0.32, 0.12, 0.48], shoeMat, [0.17, 0.06, -0.13], [0, -0.2, 0]))

  addMesh(group, createBox([0.2, 0.62, 0.2], darkMat, [-0.16, 0.43, 0.04], [0.08, 0, 0.06]))
  addMesh(group, createBox([0.2, 0.62, 0.2], darkMat, [0.16, 0.43, -0.04], [-0.08, 0, -0.06]))
  addMesh(group, createBox([0.58, 0.28, 0.36], darkMat, [0, 0.9, 0]))

  addMesh(group, createBox([0.64, 0.76, 0.34], uniformMat, [0, 1.38, 0]))
  addMesh(group, createBox([0.66, 0.14, 0.04], accentMat, [0, 1.58, 0.19]))
  addMesh(group, createBox([0.18, 0.12, 0.16], skinMat, [0, 1.84, 0]))

  addMesh(group, createBox([0.42, 0.42, 0.38], skinMat, [0, 2.12, 0]))
  addMesh(group, createBox([0.44, 0.12, 0.4], darkMat, [0, 2.39, -0.01]))
  addMesh(group, createBox([0.46, 0.22, 0.08], darkMat, [0, 2.27, -0.21]))

  addMesh(group, createBox([0.18, 0.42, 0.18], skinMat, [-0.46, 1.54, 0.02], [0.02, 0, 0.35]))
  addMesh(group, createBox([0.16, 0.38, 0.16], skinMat, [-0.58, 1.2, 0.04], [0.04, 0, 0.05]))
  addMesh(group, createBox([0.17, 0.14, 0.17], skinMat, [-0.59, 0.94, 0.05]))

  addMesh(group, createBox([0.18, 0.42, 0.18], skinMat, [0.47, 1.52, -0.02], [0.02, 0, -0.48]))
  addMesh(group, createBox([0.16, 0.4, 0.16], skinMat, [0.73, 1.26, -0.04], [0.02, 0, -0.9]))
  addMesh(group, createBox([0.17, 0.14, 0.17], skinMat, [0.9, 1.04, -0.05], [0, 0, -0.2]))
}

function addRacket(group: THREE.Group, racketMat: THREE.Material): void {
  const racket = new THREE.Group()
  racket.name = RACKET_GROUP_NAME
  group.add(racket)

  addMesh(racket, createCylinder(0.018, 0.018, 0.78, racketMat, [1.02, 1.24, -0.07], [0.25, 0.2, -0.7]))

  const head = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 8, 24), racketMat)
  head.position.set(1.25, 1.52, -0.14)
  head.rotation.set(0.28, 0.25, -0.72)
  addMesh(racket, head)

  const stringMat = new THREE.MeshBasicMaterial({ color: 0xe9eef5, transparent: true, opacity: 0.55 })
  for (const offset of [-0.08, 0, 0.08]) {
    addMesh(racket, createCylinder(0.004, 0.004, 0.32, stringMat, [1.25 + offset, 1.52, -0.14], [0.28, 0.25, Math.PI / 2 - 0.72]))
    addMesh(racket, createCylinder(0.004, 0.004, 0.32, stringMat, [1.25, 1.52 + offset, -0.14], [0.28, 0.25, -0.72]))
  }
}

function addMarker(group: THREE.Group, color: number, glowScale: number): void {
  const markerGeo = new THREE.TorusGeometry(0.28, 0.025, 8, 14)
  const markerMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
  })
  const marker = new THREE.Mesh(markerGeo, markerMat)
  marker.position.y = 2.66
  marker.rotation.x = Math.PI / 2
  group.add(marker)

  if (glowScale <= 0) return

  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 128
  glowCanvas.height = 128
  const ctx = glowCanvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  const colorHex = '#' + color.toString(16).padStart(6, '0')
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
  glow.scale.set(glowScale, glowScale, 1)
  glow.position.y = 2.66
  group.add(glow)
}

export function updatePlayerMesh(
  group: THREE.Group,
  pos: [number, number, number],
  _facing: number,
): void {
  group.position.set(pos[0], 0, pos[2])
  group.rotation.y = _facing
}

export function updatePlayerRacketPose(group: THREE.Group, swing01: number): void {
  const racket = group.getObjectByName(RACKET_GROUP_NAME)
  if (!racket) return

  const swing = THREE.MathUtils.clamp(swing01, 0, 1)
  const arc = Math.sin(swing * Math.PI)
  racket.position.set(0.05 * arc, 0.08 * arc, 0)
  racket.rotation.set(-0.08 * arc, 0.18 * arc, -0.55 * arc)
}
