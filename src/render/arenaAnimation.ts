/** Lightweight instanced crowd and match-official reactions for the playable arena. */
import * as THREE from 'three'
import type { PointReason } from '../game/types'

const STAND_FRONT = 6.15
const STAND_DEPTH = 0.72
const STAND_HEIGHT = 0.33
const STAND_ROWS = 4
const CROWD_COLUMNS = 17
const CROWD_COLORS = [0x23485e, 0xa4463f, 0xd19a47, 0x3f6b56, 0x6b527d, 0xd8d2bf]
const SKIN_COLORS = [0xf0c7a4, 0xd8a178, 0xa86f4d, 0x70462f]

export interface ArenaPointEvent {
  reason: PointReason
  rallyHits: number
  winnerSide: 0 | 1
}

export interface ArenaAnimation {
  reactToPoint: (event: ArenaPointEvent) => void
  update: (elapsed: number, rallyHits: number) => void
}

interface CrowdMember {
  bodyY: number
  energy: number
  facing: number
  headY: number
  phase: number
  scale: number
  x: number
  z: number
}

interface CrowdView {
  arms: THREE.InstancedMesh
  bodies: THREE.InstancedMesh
  dummy: THREE.Object3D
  heads: THREE.InstancedMesh
  members: CrowdMember[]
}

interface OfficialView {
  body: THREE.Mesh
  bodyY: number
  head: THREE.Mesh
  headY: number
  negativeArm: THREE.Group
  positiveArm: THREE.Group
}

interface OfficialsView {
  lineJudges: [OfficialView, OfficialView]
  umpire: OfficialView
}

interface ReactionState extends ArenaPointEvent {
  startedAt: number
}

/** @entry Builds the reusable audience/official objects and returns their frame consumer. */
export function createArenaAnimation(scene: THREE.Scene): ArenaAnimation {
  const crowd = addSpectatorStands(scene)
  const officials = addOfficials(scene)
  let elapsed = 0
  let reaction: ReactionState | null = null

  return {
    reactToPoint(event) {
      reaction = { ...event, startedAt: elapsed }
    },
    update(nextElapsed, rallyHits) {
      elapsed = nextElapsed
      updateCrowd(crowd, elapsed, rallyHits, reaction)
      updateOfficials(officials, elapsed, reaction)
    },
  }
}

function addSpectatorStands(scene: THREE.Scene): CrowdView {
  const group = new THREE.Group()
  group.name = 'spectator-stands'
  const standMaterial = new THREE.MeshStandardMaterial({ color: 0x283c57, roughness: 0.9 })
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x53696b, metalness: 0.35, roughness: 0.48 })
  const stepGeometry = new THREE.BoxGeometry(20.5, 1, STAND_DEPTH)

  for (const end of [false, true]) for (const side of [-1, 1]) {
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const height = 0.25 + row * STAND_HEIGHT
      const step = new THREE.Mesh(stepGeometry, standMaterial)
      step.scale.y = height
      const offset = side * ((end ? 10.1 : STAND_FRONT) + row * STAND_DEPTH)
      step.position.set(end ? offset : 0, height / 2, end ? 0 : offset)
      if (end) { step.rotation.y = Math.PI / 2; step.scale.x = 0.75 }
      step.receiveShadow = true
      group.add(step)
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(20.8, 0.06, 0.06), railMaterial)
    rail.position.set(end ? side * 9.65 : 0, 0.72, end ? 0 : side * (STAND_FRONT - 0.42))
    if (end) { rail.rotation.y = Math.PI / 2; rail.scale.x = 0.75 }
    group.add(rail)
  }

  const crowd = createCrowd(group)
  scene.add(group)
  return crowd
}

function createCrowd(group: THREE.Group): CrowdView {
  const count = STAND_ROWS * CROWD_COLUMNS * 4
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.24, 3, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.88 }), count)
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.92 }), count)
  const arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.23, 2, 5), new THREE.MeshStandardMaterial({ roughness: 0.86 }), count * 2)
  arms.name = 'crowd-arms'
  arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  bodies.name = 'crowd-bodies'
  heads.name = 'crowd-heads'
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const members: CrowdMember[] = []
  let index = 0

  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x4784aa, roughness: 0.78 }), count)
  seats.name = 'crowd-seats'
  const seat = new THREE.Object3D()
  for (const end of [false, true]) for (const side of [-1, 1]) {
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const platformHeight = 0.25 + row * STAND_HEIGHT
      for (let column = 0; column < CROWD_COLUMNS; column += 1) {
        const variation = ((column * 7 + row * 3 + index) % 5) * 0.018
        members.push({
          bodyY: platformHeight + 0.42 + variation,
          energy: ((column * 11 + row * 5 + index) % 9) / 8,
          facing: end ? -side * Math.PI / 2 : side === 1 ? Math.PI : 0,
          headY: platformHeight + 0.82 + variation * 1.5,
          phase: ((column * 13 + row * 17 + index) % 37) / 37 * Math.PI * 2,
          scale: 0.9 + variation,
          x: end ? side * (10.1 + row * STAND_DEPTH - 0.04) : -9 + column * (18 / (CROWD_COLUMNS - 1)),
          z: end ? -7 + column * (14 / (CROWD_COLUMNS - 1)) : side * (STAND_FRONT + row * STAND_DEPTH - 0.04),
        })
        bodies.setColorAt(index, new THREE.Color(CROWD_COLORS[(column + row * 2) % CROWD_COLORS.length]))
        heads.setColorAt(index, new THREE.Color(SKIN_COLORS[(column * 3 + row) % SKIN_COLORS.length]))
        arms.setColorAt(index * 2, new THREE.Color(CROWD_COLORS[(column + row * 2) % CROWD_COLORS.length]))
        arms.setColorAt(index * 2 + 1, new THREE.Color(CROWD_COLORS[(column + row * 2) % CROWD_COLORS.length]))
        const member = members[index]
        seat.position.set(member.x, platformHeight + 0.16, member.z)
        seat.rotation.y = member.facing
        seat.updateMatrix()
        seats.setMatrixAt(index, seat.matrix)
        index += 1
      }
    }
  }

  bodies.receiveShadow = true
  heads.receiveShadow = true
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  group.add(bodies, heads, arms, seats)
  const view = { arms, bodies, dummy: new THREE.Object3D(), heads, members }
  updateCrowd(view, 0, 0, null)
  return view
}

function updateCrowd(view: CrowdView, elapsed: number, rallyHits: number, reaction: ReactionState | null): void {
  const age = reaction ? elapsed - reaction.startedAt : Number.POSITIVE_INFINITY
  const attack = age >= 0 ? Math.min(age / 0.18, 1) : 0
  const release = age >= 0 ? Math.max(0, 1 - Math.max(0, age - 0.18) / 1.45) : 0
  const intensity = reaction ? Math.min(1.18, 0.76 + reaction.rallyHits * 0.018) : 0
  const cheer = Math.sin(attack * Math.PI / 2) * release * intensity
  const anticipation = Math.min(rallyHits / 18, 1)
  const dummy = view.dummy

  for (let index = 0; index < view.members.length; index += 1) {
    const member = view.members[index]
    const breath = Math.sin(elapsed * (1.05 + member.energy * 0.32) + member.phase)
      * (0.008 + anticipation * 0.006)
    const sway = Math.sin(elapsed * 0.55 + member.phase) * (0.018 + anticipation * 0.01)
    const bounce = cheer > 0 ? cheer * Math.max(0, Math.sin(age * (8.5 + member.energy * 2) + member.phase))
      * (0.025 + member.energy * 0.055)
      : 0

    dummy.position.set(member.x, member.bodyY + breath + bounce, member.z)
    dummy.rotation.set(0, member.facing, sway + cheer * Math.sin(member.phase) * 0.08)
    dummy.scale.set(member.scale, member.scale * (1 + cheer * 0.035), 1)
    dummy.updateMatrix()
    view.bodies.setMatrixAt(index, dummy.matrix)

    dummy.position.y = member.headY + breath * 1.3 + bounce
    dummy.rotation.set(0, member.facing + Math.sin(elapsed * 0.34 + member.phase) * 0.08, sway * 0.7)
    dummy.scale.setScalar(0.92 + (member.scale - 0.9) + cheer * 0.025)
    dummy.updateMatrix()
    view.heads.setMatrixAt(index, dummy.matrix)
    for (const [arm, sign] of [-1, 1].entries()) {
      const raised = cheer * (0.7 + member.energy * 0.3)
      dummy.position.set(member.x + Math.cos(member.facing) * sign * 0.2,
        member.bodyY - 0.03 + raised * 0.3 + bounce, member.z - Math.sin(member.facing) * sign * 0.2)
      dummy.rotation.set(0, member.facing, sign * (0.2 + raised * 2.3))
      dummy.scale.setScalar(member.scale)
      dummy.updateMatrix()
      view.arms.setMatrixAt(index * 2 + arm, dummy.matrix)
    }
  }
  view.bodies.instanceMatrix.needsUpdate = true
  view.heads.instanceMatrix.needsUpdate = true
  view.arms.instanceMatrix.needsUpdate = true
}

function addOfficials(scene: THREE.Scene): OfficialsView {
  const group = new THREE.Group()
  group.name = 'match-officials'
  const umpire = createUmpireChair()
  const leftJudge = createLineJudge('left')
  leftJudge.root.position.set(-7.65, 0, -4.25)
  leftJudge.root.rotation.y = -Math.PI / 2
  const rightJudge = createLineJudge('right')
  rightJudge.root.position.set(7.65, 0, -4.25)
  rightJudge.root.rotation.y = Math.PI / 2
  group.add(umpire.root, leftJudge.root, rightJudge.root)
  scene.add(group)
  return { umpire, lineJudges: [leftJudge, rightJudge] }
}

function createUmpireChair(): OfficialView & { root: THREE.Group } {
  const root = new THREE.Group()
  root.name = 'umpire-chair'
  root.position.set(0, 0, -3.78)
  const frame = new THREE.MeshStandardMaterial({ color: 0xd9dfd8, metalness: 0.55, roughness: 0.36 })
  const seat = new THREE.MeshStandardMaterial({ color: 0x273f43, roughness: 0.75 })
  for (const x of [-0.31, 0.31]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.55, 0.05), frame)
    rail.position.set(x, 0.78, 0.16)
    root.add(rail)
  }
  for (let step = 0; step < 5; step += 1) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.045, 0.15), frame)
    rung.position.set(0, 0.24 + step * 0.27, 0.16)
    root.add(rung)
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.72), frame)
  platform.position.set(0, 1.48, 0)
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.08), seat)
  back.position.set(0, 1.8, -0.32)
  root.add(platform, back)
  return { root, ...createOfficialFigure(root, 'umpire', 1.86, 2.25) }
}

function createLineJudge(name: string): OfficialView & { root: THREE.Group } {
  const root = new THREE.Group()
  root.name = `${name}-line-judge`
  const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x405257, metalness: 0.2, roughness: 0.64 })
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.58), chairMaterial)
  chair.position.y = 0.42
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.07), chairMaterial)
  back.position.set(0, 0.7, -0.27)
  root.add(chair, back)
  return { root, ...createOfficialFigure(root, `${name}-judge`, 0.74, 1.1) }
}

function createOfficialFigure(root: THREE.Group, name: string, bodyY: number, headY: number): OfficialView {
  const uniform = new THREE.MeshStandardMaterial({ color: 0x283744, roughness: 0.82 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a078, roughness: 0.9 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.24), uniform)
  body.name = `${name}-body`
  body.position.set(0, bodyY, -0.02)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), skin)
  head.name = `${name}-head`
  head.position.set(0, headY, -0.01)
  const armY = bodyY + 0.18
  const negativeArm = createOfficialArm(`${name}-negative-arm`, -0.22, armY, uniform)
  const positiveArm = createOfficialArm(`${name}-positive-arm`, 0.22, armY, uniform)
  root.add(body, head, negativeArm, positiveArm)
  return { body, bodyY, head, headY, negativeArm, positiveArm }
}

function createOfficialArm(name: string, x: number, y: number, material: THREE.Material): THREE.Group {
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.set(x, y, -0.02)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.1), material)
  arm.position.y = -0.17
  pivot.add(arm)
  return pivot
}

function updateOfficials(view: OfficialsView, elapsed: number, reaction: ReactionState | null): void {
  const age = reaction ? elapsed - reaction.startedAt : Number.POSITIVE_INFINITY
  const gesture = gestureEnvelope(age)
  const winnerDirection = reaction?.winnerSide === 0 ? -1 : 1
  const idle = Math.sin(elapsed * 1.15) * 0.006
  resetOfficial(view.umpire, idle)
  for (let index = 0; index < view.lineJudges.length; index += 1) {
    resetOfficial(view.lineJudges[index], Math.sin(elapsed * 1.05 + index * 1.7) * 0.004)
  }
  if (!reaction || gesture === 0) return

  view.umpire.body.rotation.x = -gesture * 0.1
  view.umpire.head.rotation.y = winnerDirection * gesture * 0.24
  if (winnerDirection < 0) view.umpire.negativeArm.rotation.z = -gesture * 1.35
  else view.umpire.positiveArm.rotation.z = gesture * 1.35

  for (const judge of view.lineJudges) {
    judge.body.rotation.x = reaction.reason === 'in' ? gesture * 0.1 : -gesture * 0.06
    if (reaction.reason === 'out') {
      judge.negativeArm.rotation.z = -gesture * 1.48
      judge.positiveArm.rotation.z = gesture * 1.48
    } else if (reaction.reason === 'in') {
      judge.negativeArm.rotation.z = -gesture * 0.62
    }
  }
}

function resetOfficial(view: OfficialView, idle: number): void {
  view.body.position.y = view.bodyY + idle
  view.body.rotation.x = 0
  view.head.position.y = view.headY + idle * 0.7
  view.head.rotation.y = 0
  view.negativeArm.rotation.z = 0
  view.positiveArm.rotation.z = 0
}

function gestureEnvelope(age: number): number {
  if (age < 0 || age >= 1.3) return 0
  if (age < 0.14) return age / 0.14
  if (age < 0.78) return 1
  return 1 - (age - 0.78) / 0.52
}
