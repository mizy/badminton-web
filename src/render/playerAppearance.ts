/** Athlete silhouette, sports clothing and attached racket geometry. */
import * as THREE from 'three'
import { PLAYER_HEIGHT, RACKET_STRING_CENTER_DISTANCE, type Vec3 } from '../character/racketKinematics'

import { type Limb, type PlayerSkeleton } from './playerSkeleton'

export interface PlayerMeshColors {
  body: number
  head: number
  racket: number
  marker: number
}

export interface PlayerAppearanceOptions {
  glowScale?: number
  labelScale?: number
}

const DEFAULT_COLORS: PlayerMeshColors = { body: 0x3366cc, head: 0xffcc99, racket: 0xcccccc, marker: 0x44aaff }
function namedGroup(parent: THREE.Object3D, name: string, position?: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  if (position) group.position.copy(position)
  parent.add(group)
  return group
}

function material(color: number, roughness = 0.88): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
}

/** 拍框保留少量补光，皮肤和服装使用普通材质。 */
function glow(color: number, intensity = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.45, metalness: 0, flatShading: true })
}

function mesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const object = new THREE.Mesh(geometry, mat)
  object.name = name
  object.castShadow = true
  object.receiveShadow = true
  parent.add(object)
  return object
}

function ellipsoid(parent: THREE.Object3D, name: string, mat: THREE.Material, size: Vec3, position: Vec3): THREE.Mesh {
  const object = mesh(parent, name, new THREE.SphereGeometry(1, 16, 12), mat)
  object.scale.set(...size)
  object.position.set(...position)
  return object
}

/** Smooth cross sections with a broad chest and tapered waist. */
function torsoGeometry(): THREE.BufferGeometry {
  const rings = [
    [0.97, 0.158, 0.117], [1.15, 0.157, 0.105], [1.32, 0.185, 0.116],
    [1.43, 0.205, 0.112], [1.47, 0.198, 0.098], [1.525, 0.065, 0.065],
  ]
  const sides = 24
  const positions: number[] = []
  const indices: number[] = []
  for (const [y, width, depth] of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2
      positions.push(Math.cos(angle) * width, y, Math.sin(angle) * depth)
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < sides; i++) {
      const a = ring * sides + i
      const b = ring * sides + (i + 1) % sides
      indices.push(a, a + sides, b, b, a + sides, b + sides)
    }
  }
  const top = (rings.length - 1) * sides
  for (let i = 1; i < sides - 1; i++) indices.push(0, i, i + 1, top, top + i + 1, top + i)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addClothingAndHead(hips: THREE.Object3D, chest: THREE.Object3D, colors: PlayerMeshColors, skin: THREE.Material, shorts: THREE.Material): void {
  const jersey = material(colors.body)
  const accent = material(0xe8eee9, 0.92)
  const hair = material(0x252a30)
  mesh(chest, 'player-jersey', torsoGeometry(), jersey)
  const collar = mesh(chest, 'jersey-collar', new THREE.TorusGeometry(0.056, 0.009, 6, 16), accent)
  collar.position.y = 1.53
  collar.rotation.x = Math.PI / 2
  const trim = mesh(chest, 'jersey-trim', new THREE.CylinderGeometry(0.159, 0.159, 0.012, 24), jersey)
  trim.position.y = 0.982
  trim.scale.z = 0.74
  // 短裤和腰带归髋，转身时跟着髋走；球衣以上归上身，可再叠加肩髋分离。
  const waist = mesh(hips, 'shorts-waist', new THREE.CylinderGeometry(0.145, 0.165, 0.18, 12), shorts)
  waist.position.y = 0.022
  waist.scale.z = 0.7
  for (const side of [-1, 1] as const) {
    const stripe = mesh(chest, `jersey-side-stripe-${side}`, new THREE.BoxGeometry(0.018, 0.22, 0.014), accent)
    stripe.position.set(side * 0.173, 1.29, 0.065)
    stripe.rotation.z = -side * 0.10
  }
  const waistband = mesh(hips, 'shorts-waistband', new THREE.CylinderGeometry(0.146, 0.148, 0.02, 20), shorts)
  waistband.position.y = 0.10
  waistband.scale.z = 0.7
  const neck = mesh(chest, 'player-neck', new THREE.CylinderGeometry(0.041, 0.049, 0.085, 12), skin)
  neck.position.y = 1.555
  ellipsoid(chest, 'player-head', skin, [0.11, 0.121, 0.104], [0, PLAYER_HEIGHT - 0.126, 0.007])
  const cap = mesh(chest, 'player-hair', new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.43), hair)
  cap.scale.set(0.112, 0.122, 0.107)
  cap.position.set(0, PLAYER_HEIGHT - 0.122, 0.004)
  const headband = mesh(chest, 'player-headband', new THREE.TorusGeometry(0.104, 0.012, 6, 20), accent)
  headband.position.set(0, PLAYER_HEIGHT - 0.086, 0.004)
  headband.rotation.x = Math.PI / 2.06
  for (const side of [-1, 1]) {
    ellipsoid(chest, `ear-${side}`, skin, [0.015, 0.025, 0.017], [side * 0.106, 1.646, 0.002])
    ellipsoid(chest, `eye-${side}`, hair, [0.007, 0.006, 0.004], [side * 0.035, 1.677, 0.104])
  }
  ellipsoid(chest, 'player-nose', skin, [0.015, 0.020, 0.020], [0, 1.65, 0.105])
}

function limbGeometry(arm: boolean, upper: boolean): THREE.LatheGeometry {
  const root = arm ? upper ? 0.052 : 0.039 : upper ? 0.078 : 0.050
  const tip = arm ? upper ? 0.037 : 0.025 : upper ? 0.051 : 0.030
  return new THREE.LatheGeometry([
    new THREE.Vector2(root * 0.88, -0.5), new THREE.Vector2(root, -0.32),
    new THREE.Vector2(root * 0.94, -0.05), new THREE.Vector2(tip * 1.15, 0.30),
    new THREE.Vector2(tip, 0.5),
  ], 16)
}

function dressLimb(chain: Limb, side: 'right' | 'left', arm: boolean, skin: THREE.Material, clothing: THREE.Material, accent: THREE.Material): void {
  const { root, joint, end, lengths } = chain
  const upper = mesh(root, `${side}-${arm ? 'upper-arm' : 'thigh'}`, limbGeometry(arm, true), skin)
  const lower = mesh(joint, `${side}-${arm ? 'forearm' : 'shin'}`, limbGeometry(arm, false), skin)
  for (const [segment, length] of [[upper, lengths[0]], [lower, lengths[1]]] as const) {
    segment.position.y = -length / 2
    segment.scale.y = length
    segment.rotation.z = Math.PI
  }
  const radius = arm ? 0.039 : 0.051
  ellipsoid(joint, `${side}-joint-skin`, skin, [radius, radius, radius], [0, 0, 0])
  ellipsoid(end, `${side}-end-skin`, skin, arm ? [0.03, 0.041, 0.032] : [0.032, 0.034, 0.033], [0, 0, 0])
  const sleeve = mesh(root, `${side}-${arm ? 'sleeve' : 'shorts-leg'}`,
    new THREE.CylinderGeometry(arm ? 0.057 : 0.09, arm ? 0.066 : 0.096, 1, 16), clothing)
  const coverage = lengths[0] * (arm ? 0.38 : 0.46)
  sleeve.scale.y = coverage
  sleeve.position.y = -coverage / 2
  sleeve.rotation.z = Math.PI
  if (arm) {
    ellipsoid(root, `${side}-deltoid`, clothing, [0.064, 0.063, 0.064], [0, 0, 0])
    const band = mesh(end, `${side}-wristband`, new THREE.TorusGeometry(0.032, 0.008, 6, 14), accent)
    band.rotation.x = Math.PI / 2
  } else {
    const sock = mesh(end, `${side}-sock`, new THREE.CylinderGeometry(0.036, 0.034, 0.075, 10), material(0xf1f1e9))
    sock.position.y = 0.034
    addShoe(end, side, accent)
  }
}

function addShoe(ankle: THREE.Object3D, side: string, accent: THREE.Material): void {
  const shoe = namedGroup(ankle, `${side}-shoe`)
  const sole = mesh(shoe, `${side}-sole`, new THREE.CylinderGeometry(1, 1, 0.024, 12), material(0x1b2730))
  sole.scale.set(0.058, 1, 0.142)
  sole.position.set(0, -0.078, 0.042)
  ellipsoid(shoe, `${side}-shoe-upper`, material(0xf1f2e9), [0.054, 0.052, 0.131], [0, -0.036, 0.04])
  // 鞋底高度由踝关节决定，装饰保持在鞋子的轮廓内。
  ellipsoid(shoe, `${side}-shoe-stripe`, accent, [0.0565, 0.007, 0.135], [0, -0.0555, 0.041])
  ellipsoid(shoe, `${side}-shoe-laces`, accent, [0.027, 0.007, 0.043], [0, 0.012, 0.044])
}

class RacketOval extends THREE.Curve<THREE.Vector3> {
  constructor() { super() }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2
    return target.set(Math.sin(angle) * 0.096, Math.cos(angle) * 0.131, 0)
  }
}

/** Local origin is the grip/wrist, +Y points up the shaft, +Z is face normal. */
function addRacket(wrist: THREE.Object3D, color: number, accent: THREE.Material): THREE.Group {
  const racket = namedGroup(wrist, 'player-racket')
  mesh(racket, 'racket-grip', new THREE.CylinderGeometry(0.014, 0.015, 0.16, 10), material(0x2a3339))
  // 手胶缠两圈发光胶带：半径仍在拍框包围盒内，不改变 playerMesh.test.ts 断言的尺寸。
  for (const y of [-0.045, 0.02]) {
    const wrap = mesh(racket, `racket-grip-wrap-${y}`, new THREE.TorusGeometry(0.0165, 0.0035, 6, 16), accent)
    wrap.rotation.x = Math.PI / 2
    wrap.position.y = y
  }
  const shaftStart = 0.08
  const shaftEnd = RACKET_STRING_CENTER_DISTANCE - 0.128
  const shaft = mesh(racket, 'racket-shaft', new THREE.CylinderGeometry(0.0035, 0.004, shaftEnd - shaftStart, 8), glow(color, 0.35))
  shaft.position.y = (shaftStart + shaftEnd) / 2
  const center = namedGroup(racket, 'racket-string-center', new THREE.Vector3(0, RACKET_STRING_CENTER_DISTANCE, 0))
  mesh(center, 'racket-frame', new THREE.TubeGeometry(new RacketOval(), 64, 0.004, 8, true), glow(color, 0.5))
  const lines: number[] = []
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.014
    const y = 0.127 * Math.sqrt(1 - (x / 0.092) ** 2)
    lines.push(x, -y, 0, x, y, 0)
  }
  for (let i = -8; i <= 8; i++) {
    const y = i * 0.014
    const x = 0.092 * Math.sqrt(1 - (y / 0.127) ** 2)
    lines.push(-x, y, 0, x, y, 0)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  const strings = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xf2eee0, transparent: true, opacity: 0.65 }))
  strings.name = 'racket-strings'
  center.add(strings)
  return racket
}

function addLabel(group: THREE.Object3D, text: string, color: number, scale: number): void {
  if (!text || scale <= 0 || typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.font = '600 40px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 32)
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.name = 'player-label'
  const width = Math.min(scale, 0.24)
  sprite.scale.set(width, width / 2, 1)
  sprite.position.y = PLAYER_HEIGHT + 0.13
  group.add(sprite)
}

/** @entry Attaches the procedural skin to existing joints; creates no motion state. */
export function attachPlayerAppearance(skeleton: PlayerSkeleton, colors: PlayerMeshColors = DEFAULT_COLORS, label = 'P', options: PlayerAppearanceOptions = {}): THREE.Object3D[] {
  const { group, hips, chest, rightArm, leftArm, rightLeg, leftLeg } = skeleton
  const skin = material(colors.head, 0.95)
  const shorts = material(new THREE.Color(colors.body).multiplyScalar(0.38).getHex())
  const accent = material(0xe8eee9, 0.9)
  addClothingAndHead(hips, chest, colors, skin, shorts)
  const jersey = (chest.getObjectByName('player-jersey') as THREE.Mesh).material as THREE.Material
  for (const name of ['player-head', 'player-hair', 'player-headband', 'ear--1', 'ear-1', 'eye--1', 'eye-1', 'player-nose']) {
    skeleton.head.attach(chest.getObjectByName(name)!)
  }
  dressLimb(rightArm, 'right', true, skin, jersey, accent)
  dressLimb(leftArm, 'left', true, skin, jersey, accent)
  dressLimb(rightLeg, 'right', false, skin, shorts, accent)
  dressLimb(leftLeg, 'left', false, skin, shorts, accent)
  const appearance: THREE.Object3D[] = []
  group.traverse(node => { if (node instanceof THREE.Mesh) appearance.push(node) })
  addRacket(skeleton.racket, colors.racket, accent)
  const rim = new THREE.PointLight(0xf3f5ef, 0.5, 4.2, 2)
  rim.name = 'player-rim-light'
  rim.position.set(0, 1.25, -0.6)
  group.add(rim)
  const glowScale = options.glowScale ?? 0
  if (glowScale > 0) {
    const ring = mesh(chest, 'player-marker', new THREE.TorusGeometry(0.13, 0.005, 6, 32),
      new THREE.MeshBasicMaterial({ color: colors.marker, transparent: true, opacity: 0.35 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = PLAYER_HEIGHT + 0.06
    ring.scale.setScalar(Math.min(glowScale, 1))
  }
  addLabel(chest, label, colors.marker, options.labelScale ?? 0.18)
  return appearance
}
