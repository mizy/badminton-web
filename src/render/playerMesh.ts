/** Procedural adult athlete. Model forward is +Z; anatomical right is -X. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import {
  ARM_LENGTH,
  PLAYER_HEIGHT,
  RACKET_STRING_CENTER_DISTANCE,
  SHOULDER_HEIGHT,
  SHOULDER_HALF_WIDTH,
  createReachableRacketPose,
  getPlayerRightShoulder,
  type RacketContactPose,
  type Vec3,
} from '../character/racketKinematics'
import { idealContactPoint, getTechniqueRacketFaceDeg } from '../character/contact'
import { RACKETS } from '../character/stroke'

export interface PlayerMeshColors {
  body: number
  head: number
  racket: number
  marker: number
}

export interface PlayerMeshOptions {
  glowScale?: number
  labelScale?: number
}

const DEFAULT_COLORS: PlayerMeshColors = { body: 0x3366cc, head: 0xffcc99, racket: 0xcccccc, marker: 0x44aaff }
const UP = new THREE.Vector3(0, 1, 0)
const RIGHT_SHOULDER = new THREE.Vector3(-SHOULDER_HALF_WIDTH, SHOULDER_HEIGHT, 0.04)
const UPPER_ARM = 0.34
const FOREARM = ARM_LENGTH - UPPER_ARM
const THIGH = 0.43
const SHIN = 0.43
const ANKLE_HEIGHT = 0.09
const SWING_DURATION = 0.16

interface Chain {
  root: THREE.Group
  joint: THREE.Group
  end: THREE.Group
  upper: THREE.Mesh
  lower: THREE.Mesh
  sleeve?: THREE.Mesh
  lengths: [number, number]
}

interface ArmPose {
  grip: THREE.Vector3
  rotation: THREE.Quaternion
}

interface PlayerRig {
  body: THREE.Group
  rightArm: Chain
  leftArm: Chain
  rightLeg: Chain
  leftLeg: Chain
  racket: THREE.Group
  contact: { source: RacketContactPose; pose: ArmPose; elapsed: number } | null
}

const rigs = new WeakMap<THREE.Group, PlayerRig>()
const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function namedGroup(parent: THREE.Object3D, name: string, position?: THREE.Vector3): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  if (position) group.position.copy(position)
  parent.add(group)
  return group
}

function material(color: number, roughness = 0.88): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true })
}

/** 霓虹饰件：饰边、鞋侧、拍框自带 emissive，在暗色球场上自己发亮，不额外加光源。 */
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

/** Bevelled cross sections, broad chest and tapered waist; no box torso. */
function torsoGeometry(): THREE.BufferGeometry {
  const rings = [
    [1.015, 0.145, 0.095], [1.40, 0.195, 0.115],
    [1.46, 0.20, 0.105], [1.525, 0.065, 0.065],
  ]
  const outline = [[-0.7, -1], [0.7, -1], [1, -0.65], [1, 0.65], [0.7, 1], [-0.7, 1], [-1, 0.65], [-1, -0.65]]
  const positions: number[] = []
  const indices: number[] = []
  for (const [y, width, depth] of rings) {
    for (const [x, z] of outline) positions.push(x * width, y, z * depth)
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = ring * 8 + i
      const b = ring * 8 + (i + 1) % 8
      indices.push(a, a + 8, b, b, a + 8, b + 8)
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i, i + 1, 24, 24 + i + 1, 24 + i)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addClothingAndHead(body: THREE.Group, colors: PlayerMeshColors, skin: THREE.Material, shorts: THREE.Material): void {
  const jersey = material(colors.body)
  const accent = glow(colors.marker)
  const hair = material(0x252a30)
  mesh(body, 'player-jersey', torsoGeometry(), jersey)
  const collar = mesh(body, 'jersey-collar', new THREE.TorusGeometry(0.056, 0.009, 6, 16), accent)
  collar.position.y = 1.53
  collar.rotation.x = Math.PI / 2
  const chest = mesh(body, 'jersey-trim', new THREE.CylinderGeometry(0.193, 0.19, 0.026, 8), accent)
  chest.position.y = 1.394
  chest.scale.z = 0.59
  const waist = mesh(body, 'shorts-waist', new THREE.CylinderGeometry(0.145, 0.165, 0.18, 12), shorts)
  waist.position.y = 0.962
  waist.scale.z = 0.7
  // 队服细节：两侧竖条 + 发光腰带 + 额带 + 脑后马尾（体积都留在既有包围盒内，见 playerMesh.test.ts）。
  for (const side of [-1, 1] as const) {
    const stripe = mesh(body, `jersey-side-stripe-${side}`, new THREE.BoxGeometry(0.016, 0.12, 0.03), material(colors.body, 0.55))
    stripe.position.set(side * 0.196, 1.44, 0)
  }
  const waistband = mesh(body, 'shorts-waistband', new THREE.TorusGeometry(0.163, 0.012, 6, 20), accent)
  waistband.position.y = 1.052
  waistband.rotation.x = Math.PI / 2
  waistband.scale.z = 0.7
  const neck = mesh(body, 'player-neck', new THREE.CylinderGeometry(0.041, 0.049, 0.085, 12), skin)
  neck.position.y = 1.555
  ellipsoid(body, 'player-head', skin, [0.11, 0.121, 0.104], [0, PLAYER_HEIGHT - 0.126, 0.007])
  const cap = mesh(body, 'player-hair', new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.43), hair)
  cap.scale.set(0.112, 0.122, 0.107)
  cap.position.set(0, PLAYER_HEIGHT - 0.122, 0.004)
  const headband = mesh(body, 'player-headband', new THREE.TorusGeometry(0.104, 0.012, 6, 20), accent)
  headband.position.set(0, PLAYER_HEIGHT - 0.086, 0.004)
  headband.rotation.x = Math.PI / 2.06
  ellipsoid(body, 'player-hair-tail', hair, [0.033, 0.05, 0.033], [0, PLAYER_HEIGHT - 0.155, -0.104])
  for (const side of [-1, 1]) {
    ellipsoid(body, `ear-${side}`, skin, [0.015, 0.025, 0.017], [side * 0.106, 1.646, 0.002])
    ellipsoid(body, `eye-${side}`, hair, [0.007, 0.006, 0.004], [side * 0.035, 1.677, 0.104])
  }
  ellipsoid(body, 'player-nose', skin, [0.015, 0.020, 0.020], [0, 1.65, 0.105])
}

function createChain(body: THREE.Group, side: 'right' | 'left', arm: boolean, skin: THREE.Material, shorts: THREE.Material, accent: THREE.Material): Chain {
  const sign = side === 'right' ? -1 : 1
  const root = namedGroup(body, `${side}-${arm ? 'shoulder' : 'hip'}`,
    new THREE.Vector3(sign * (arm ? SHOULDER_HALF_WIDTH : 0.105), arm ? SHOULDER_HEIGHT : 0.94, arm ? 0.04 : 0))
  const joint = namedGroup(root, `${side}-${arm ? 'elbow' : 'knee'}`)
  const end = namedGroup(joint, `${side}-${arm ? 'wrist' : 'ankle'}`)
  const upper = mesh(root, `${side}-${arm ? 'upper-arm' : 'thigh'}`,
    new THREE.CylinderGeometry(arm ? 0.038 : 0.053, arm ? 0.059 : 0.078, 1, 10), skin)
  const lower = mesh(joint, `${side}-${arm ? 'forearm' : 'shin'}`,
    new THREE.CylinderGeometry(arm ? 0.025 : 0.030, arm ? 0.041 : 0.052, 1, 10), skin)
  const radius = arm ? 0.039 : 0.051
  ellipsoid(joint, `${side}-joint-skin`, skin, [radius, radius, radius], [0, 0, 0])
  ellipsoid(end, `${side}-end-skin`, skin, arm ? [0.03, 0.041, 0.032] : [0.032, 0.034, 0.033], [0, 0, 0])
  const chain: Chain = { root, joint, end, upper, lower, lengths: arm ? [UPPER_ARM, FOREARM] : [THIGH, SHIN] }
  if (arm) {
    ellipsoid(root, `${side}-deltoid`, skin, [0.061, 0.063, 0.061], [0, 0, 0])
    // 短袖袖口（发光肩甲）+ 手腕护腕：都在关节组上，不参与骨骼段的缩放。
    ellipsoid(root, `${side}-sleeve`, accent, [0.068, 0.072, 0.068], [0, 0.014, 0])
    const band = mesh(end, `${side}-wristband`, new THREE.TorusGeometry(0.032, 0.008, 6, 14), accent)
    band.rotation.x = Math.PI / 2
  } else {
    chain.sleeve = mesh(root, `${side}-shorts-leg`, new THREE.CylinderGeometry(0.09, 0.096, 1, 10), shorts)
    const sock = mesh(end, `${side}-sock`, new THREE.CylinderGeometry(0.036, 0.034, 0.075, 10), material(0xf1f1e9))
    sock.position.y = 0.034
    addShoe(end, side, accent)
  }
  return chain
}

function addShoe(ankle: THREE.Group, side: string, accent: THREE.Material): void {
  const shoe = namedGroup(ankle, `${side}-shoe`)
  const sole = mesh(shoe, `${side}-sole`, new THREE.CylinderGeometry(1, 1, 0.024, 12), material(0x1b2730))
  sole.scale.set(0.058, 1, 0.142)
  sole.position.set(0, -0.078, 0.042)
  ellipsoid(shoe, `${side}-shoe-upper`, material(0xf1f2e9), [0.054, 0.052, 0.131], [0, -0.036, 0.04])
  // 发光中底条与鞋带：整只鞋仍在原包围盒内（鞋底 min.y 由 ankle 高度决定，不能动）。
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
function addRacket(wrist: THREE.Group, color: number, accent: THREE.Material): THREE.Group {
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

function addLabel(group: THREE.Group, text: string, color: number, scale: number): void {
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

/** 脚下能量环：细边线环 + 外发光晕 + 旋转的扫描弧，不是发光圆盘（尺寸见 playerMesh.test.ts）。 */
export function createGroundMarker(color: number): THREE.Group {
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.315, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
  ring.name = 'ground-ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.008
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.315, 0.35, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.name = 'ground-halo'
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.009
  const sweep = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.30, 32, 1, 0, Math.PI * 0.42),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  sweep.name = 'ground-sweep'
  sweep.rotation.x = -Math.PI / 2
  sweep.position.y = 0.01
  group.add(ring, halo, sweep)
  return group
}

/** 能量环动效：扫描弧转圈，光晕随呼吸明暗。每帧由 frame.ts 调用。 */
export function updateGroundMarker(group: THREE.Group, elapsed: number): void {
  const sweep = group.getObjectByName('ground-sweep')
  if (sweep) sweep.rotation.z = -elapsed * 1.5
  const halo = group.getObjectByName('ground-halo') as THREE.Mesh | undefined
  if (halo) (halo.material as THREE.MeshBasicMaterial).opacity = 0.12 + (0.5 + 0.5 * Math.sin(elapsed * 3.4)) * 0.14
}

export function createPlayerMesh(colors: PlayerMeshColors = DEFAULT_COLORS, label = 'P', options: PlayerMeshOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'player'
  const body = namedGroup(group, 'player-body')
  const skin = material(colors.head, 0.95)
  const shorts = material(new THREE.Color(colors.body).multiplyScalar(0.38).getHex())
  const accent = glow(colors.marker)
  addClothingAndHead(body, colors, skin, shorts)
  const rightArm = createChain(body, 'right', true, skin, shorts, accent)
  const leftArm = createChain(body, 'left', true, skin, shorts, accent)
  const rightLeg = createChain(body, 'right', false, skin, shorts, accent)
  const leftLeg = createChain(body, 'left', false, skin, shorts, accent)
  const racket = addRacket(rightArm.end, colors.racket, accent)
  const rig: PlayerRig = { body, rightArm, leftArm, rightLeg, leftLeg, racket, contact: null }
  // 轮廓补光：从身后打一盏冷光，把球员从暗色球场里切出来（灯不进包围盒）。
  const rim = new THREE.PointLight(colors.marker, 2.4, 4.2, 2)
  rim.name = 'player-rim-light'
  rim.position.set(0, 1.25, -0.6)
  group.add(rim)
  rigs.set(group, rig)
  applyArmPose(rig, readyPose())
  poseChain(leftArm, new THREE.Vector3(0.36, 1.13, 0.16), new THREE.Vector3(1, -0.5, -0.25))
  poseChain(rightLeg, new THREE.Vector3(-0.14, ANKLE_HEIGHT, 0), new THREE.Vector3(0, 0, 1))
  poseChain(leftLeg, new THREE.Vector3(0.14, ANKLE_HEIGHT, 0), new THREE.Vector3(0, 0, 1))
  const glowScale = options.glowScale ?? 0
  if (glowScale > 0) {
    const ring = mesh(body, 'player-marker', new THREE.TorusGeometry(0.13, 0.005, 6, 32),
      new THREE.MeshBasicMaterial({ color: colors.marker, transparent: true, opacity: 0.35 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = PLAYER_HEIGHT + 0.06
    ring.scale.setScalar(Math.min(glowScale, 1))
  }
  addLabel(body, label, colors.marker, options.labelScale ?? 0.18)
  return group
}

function placeSegment(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  const direction = to.clone().sub(from)
  object.position.copy(from).add(to).multiplyScalar(0.5)
  object.scale.y = direction.length()
  object.quaternion.setFromUnitVectors(UP, direction.normalize())
}

/** Triangle IK preserves both bone lengths, including for unreachable targets. */
function poseChain(chain: Chain, target: THREE.Vector3, pole: THREE.Vector3): void {
  const [a, b] = chain.lengths
  const direction = target.clone().sub(chain.root.position)
  const requested = direction.length()
  if (requested < 1e-8) direction.set(0, -1, 0)
  else direction.divideScalar(requested)
  const distance = THREE.MathUtils.clamp(requested, Math.abs(a - b) + 1e-6, a + b)
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  const height = Math.sqrt(Math.max(0, a * a - along * along))
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction))
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(direction, -direction.z)
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0)
  bend.normalize()
  chain.joint.position.copy(direction).multiplyScalar(along).addScaledVector(bend, height)
  chain.end.position.copy(direction).multiplyScalar(distance).sub(chain.joint.position)
  placeSegment(chain.upper, new THREE.Vector3(), chain.joint.position)
  placeSegment(chain.lower, new THREE.Vector3(), chain.end.position)
  if (chain.sleeve) placeSegment(chain.sleeve, new THREE.Vector3(), chain.joint.position.clone().multiplyScalar(0.46))
}

function racketRotation(shaft: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const y = shaft.clone().normalize()
  const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize()
  if (z.lengthSq() < 1e-8) z.crossVectors(y, Math.abs(y.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  z.crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function armPose(grip: Vec3, shaft: Vec3): ArmPose {
  return { grip: new THREE.Vector3(...grip), rotation: racketRotation(new THREE.Vector3(...shaft), new THREE.Vector3(0, 0, 1)) }
}

function readyPose(): ArmPose {
  return armPose([-0.29, 1.18, 0.28], [0.08, 0.94, 0.33])
}

function strokePoses(shot: ShotType): { preparation: ArmPose; follow: ArmPose } {
  if (shot === 'LIFT' || shot === 'NET_DROP') {
    return { preparation: armPose([-0.35, 1.01, 0.12], [0.12, -0.82, 0.56]), follow: armPose([-0.28, 1.34, 0.40], [0.05, 0.84, 0.54]) }
  }
  if (shot === 'DRIVE') {
    return { preparation: armPose([-0.43, 1.24, 0.12], [-0.3, 0.8, 0.45]), follow: armPose([-0.04, 1.13, 0.42], [0.35, 0.15, 0.92]) }
  }
  return { preparation: armPose([-0.36, 1.65, -0.12], [-0.32, 0.6, -0.73]), follow: armPose([0.10, 1.06, 0.29], [0.32, -0.82, 0.47]) }
}

function blendPose(from: ArmPose, to: ArmPose, progress: number): ArmPose {
  const t = smooth(progress)
  return { grip: from.grip.clone().lerp(to.grip, t), rotation: from.rotation.clone().slerp(to.rotation, t) }
}

function localContactPose(body: THREE.Group, pose: RacketContactPose): ArmPose {
  const grip = body.worldToLocal(new THREE.Vector3(...pose.gripPoint))
  const center = body.worldToLocal(new THREE.Vector3(...pose.stringCenter))
  const inverse = body.getWorldQuaternion(new THREE.Quaternion()).invert()
  const normal = new THREE.Vector3(...pose.faceNormal).applyQuaternion(inverse)
  return { grip, rotation: racketRotation(center.sub(grip), normal) }
}

function applyArmPose(rig: PlayerRig, pose: ArmPose): void {
  poseChain(rig.rightArm, pose.grip, new THREE.Vector3(-1, -0.6, -0.25))
  // The racket is a wrist child: hand, grip and string bed turn together.
  rig.rightArm.end.quaternion.copy(pose.rotation)
  rig.racket.quaternion.identity()
}

export function updatePlayerMesh(group: THREE.Group, pos: Vec3, facing: number): void {
  group.position.set(...pos)
  group.rotation.y = facing
}

function bodyCrouch(player: PlayerState, speed: number): number {
  if (player.body.phase === 'loading') return 0.12 * smooth(player.body.elapsed / (player.body.action === 'scissor' ? 0.075 : 0.1))
  if (player.body.phase === 'landing') return 0.12 * (1 - smooth(player.body.elapsed / (player.body.action === 'scissor' ? 0.18 : 0.24)))
  if (player.body.phase === 'airborne') return 0
  return Math.min(speed / 5, 1) * 0.065 + (player.movement.footwork === 'start' ? 0.035 : 0)
}

function poseLegs(group: THREE.Group, rig: PlayerRig, player: PlayerState, elapsed: number, speed: number): void {
  const airborne = player.body.phase === 'airborne'
  const starting = player.movement.footwork === 'start'
  const amount = Math.max(Math.min(speed / 5, 1), starting ? 0.3 : 0)
  const direction = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z)
  if (direction.lengthSq() < 0.01) direction.set(player.movement.targetDir.x, 0, player.movement.targetDir.z)
  direction.applyAxisAngle(UP, -group.rotation.y)
  if (direction.lengthSq() < 0.01) direction.set(0, 0, 1)
  direction.normalize()
  const cycle = elapsed * (speed > 3 ? 14 : 9)
  for (const [chain, sign] of [[rig.rightLeg, 1], [rig.leftLeg, -1]] as const) {
    const hip = chain.root.position.clone().applyQuaternion(rig.body.quaternion).add(rig.body.position)
    const ankle = hip.clone()
    let stride = Math.sin(cycle) * amount * 0.24 * sign
    let lift = Math.max(0, Math.cos(cycle) * sign) * amount * 0.10
    if (airborne) {
      const tuck = Math.sin(Math.PI * THREE.MathUtils.clamp(player.body.elapsed / 0.65, 0, 1))
      lift = 0.05 + 0.16 * tuck
      stride = player.body.action === 'scissor'
        ? Math.cos(Math.PI * Math.min(player.body.elapsed / 0.43, 1)) * 0.27 * sign
        : sign * 0.09
      ankle.z += stride
    } else {
      ankle.addScaledVector(direction, stride)
    }
    ankle.x -= sign * 0.035
    ankle.y = ANKLE_HEIGHT + lift
    // A contact can raise the torso while running: shorten the step, not the leg,
    // and never let generic reach clamping lift the planted sole off the court.
    const horizontal = new THREE.Vector2(ankle.x - hip.x, ankle.z - hip.z)
    const horizontalReach = Math.sqrt(Math.max(0, (THIGH + SHIN - 1e-6) ** 2 - (hip.y - ankle.y) ** 2))
    if (horizontal.length() > horizontalReach) horizontal.setLength(horizontalReach)
    ankle.x = hip.x + horizontal.x
    ankle.z = hip.z + horizontal.y
    const localAnkle = ankle.sub(rig.body.position).applyQuaternion(rig.body.quaternion.clone().invert())
    poseChain(chain, localAnkle, new THREE.Vector3(0, 0, 1))
  }
}

/** Finite ready -> preparation -> strike -> follow-through -> ready, never ball chasing. */
export function syncPlayerMotion(group: THREE.Group, player: PlayerState, elapsed: number): void {
  const rig = rigs.get(group)
  if (!rig) return
  updatePlayerMesh(group, player.pos, player.side === 0 ? Math.PI / 2 : -Math.PI / 2)
  const timing = RACKETS[player.loadout]
  const active = player.swing.phase === 'swinging' || player.swing.phase === 'recovery'
  if (!active || !player.contactPose) rig.contact = null
  const newContact = active && player.contactPose !== null && rig.contact?.source !== player.contactPose
    && player.swing.elapsed <= SWING_DURATION
  const contactAge = rig.contact ? Math.max(0, player.swing.elapsed - rig.contact.elapsed) : Infinity
  const speed = Math.hypot(player.movement.currentVel.x, player.movement.currentVel.z)
  const crouch = bodyCrouch(player, speed) * (newContact ? 0 : smooth(contactAge / 0.12))
  let turn = 0
  if (player.body.action === 'scissor') {
    if (player.body.phase === 'loading') turn = -0.5 * smooth(player.body.elapsed / 0.075)
    if (player.body.phase === 'airborne') turn = -0.5 + smooth(player.body.elapsed / 0.43)
    if (player.body.phase === 'landing') turn = 0.5 * (1 - smooth(player.body.elapsed / 0.18))
  }
  rig.body.rotation.y = turn
  // Rotate around the shared right shoulder, rather than moving it to the left side.
  group.updateWorldMatrix(true, false)
  const visualPos: Vec3 = [player.pos[0], player.pos[1] - crouch, player.pos[2]]
  const shoulder = group.worldToLocal(new THREE.Vector3(...getPlayerRightShoulder(visualPos, player.side)))
  rig.body.position.copy(shoulder).sub(RIGHT_SHOULDER.clone().applyQuaternion(rig.body.quaternion))
  rig.body.updateWorldMatrix(true, false)
  poseLegs(group, rig, player, elapsed, speed)
  const balance = player.body.phase === 'airborne' ? new THREE.Vector3(0.45, 1.41, 0.12)
    : new THREE.Vector3(0.36, 1.13, 0.16 + Math.sin(elapsed * 10) * Math.min(speed / 5, 1) * 0.10)
  poseChain(rig.leftArm, balance, new THREE.Vector3(1, -0.5, -0.25))

  const ready = readyPose()
  const shot = player.swing.phase === 'ready' ? player.selectedShot : player.swing.shot
  const { preparation, follow } = strokePoses(shot)
  if (newContact) {
    rig.contact = { source: player.contactPose!, pose: localContactPose(rig.body, player.contactPose!), elapsed: player.swing.elapsed }
  }
  let pose = ready
  if (rig.contact && active) {
    const age = Math.max(0, player.swing.elapsed - rig.contact.elapsed)
    const duration = Math.max(0.12, timing.recovery - rig.contact.elapsed)
    const followDuration = Math.min(0.12, duration * 0.45)
    pose = age < followDuration ? blendPose(rig.contact.pose, follow, age / followDuration)
      : blendPose(follow, ready, (age - followDuration) / (duration - followDuration))
  } else if (player.swing.phase === 'preparing') {
    // 按住蓄力：在引拍位保持，不随按住时长继续位移。
    pose = blendPose(ready, preparation, THREE.MathUtils.clamp(player.swing.elapsed / timing.preparation, 0, 1))
  } else if (player.swing.phase === 'swinging') {
    const shared = createReachableRacketPose({
      desiredContact: idealContactPoint(visualPos, player.side, shot),
      playerPos: visualPos, playerSide: player.side, racketFaceDeg: getTechniqueRacketFaceDeg(shot),
    })
    const strike = localContactPose(rig.body, shared)
    const t = THREE.MathUtils.clamp(player.swing.elapsed / SWING_DURATION, 0, 1)
    pose = t < 0.45 ? blendPose(preparation, strike, t / 0.45) : blendPose(strike, follow, (t - 0.45) / 0.55)
  } else if (player.swing.phase === 'recovery') {
    const start = SWING_DURATION
    pose = blendPose(follow, ready, (player.swing.elapsed - start) / (timing.recovery - start))
  }
  applyArmPose(rig, pose)
}

/** Legacy stories animate the same wrist/arm rig; no detached decorative racket. */
export function updatePlayerRacketPose(group: THREE.Group, swing01: number): void {
  const rig = rigs.get(group)
  if (!rig) return
  const t = THREE.MathUtils.clamp(swing01, 0, 1)
  const ready = readyPose()
  const { preparation, follow } = strokePoses('CLEAR')
  const pose = t < 0.3 ? blendPose(ready, preparation, t / 0.3)
    : t < 0.65 ? blendPose(preparation, follow, (t - 0.3) / 0.35)
      : blendPose(follow, ready, (t - 0.65) / 0.35)
  applyArmPose(rig, pose)
}
