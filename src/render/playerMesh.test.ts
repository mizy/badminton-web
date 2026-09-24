import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlayer } from '../game/playerFactory'
import { idealContactPoint, getTechniqueRacketFaceDeg } from '../character/contact'
import {
  ARM_LENGTH,
  PLAYER_HEIGHT,
  RACKET_STRING_CENTER_DISTANCE,
  SHOULDER_HEIGHT,
  SHOULDER_HALF_WIDTH,
  createReachableRacketPose,
  getPlayerRightShoulder,
} from '../character/racketKinematics'
import { RACKETS, SHOT_ORDER } from '../character/stroke'
import type { PlayerState } from '../character/types'
import {
  createGroundMarker,
  createPlayerMesh,
  updateGroundMarker,
  syncPlayerMotion,
  updatePlayerMesh,
  updatePlayerRacketPose,
} from './playerMesh'

const makeMesh = () => createPlayerMesh(undefined, '', { labelScale: 0, glowScale: 0 })
const point = (mesh: THREE.Object3D, name: string) => {
  mesh.updateMatrixWorld(true)
  const node = mesh.getObjectByName(name)
  expect(node, name).toBeDefined()
  return node!.getWorldPosition(new THREE.Vector3())
}
const bounds = (mesh: THREE.Object3D, name?: string) => {
  mesh.updateWorldMatrix(true, true)
  return new THREE.Box3().setFromObject(name ? mesh.getObjectByName(name)! : mesh)
}
const near = (actual: THREE.Vector3, expected: THREE.Vector3, tolerance = 1e-6) => {
  expect(actual.distanceTo(expected)).toBeLessThan(tolerance)
}

function expectChains(mesh: THREE.Group) {
  for (const side of ['right', 'left']) {
    const shoulder = point(mesh, `${side}-shoulder`)
    const elbow = point(mesh, `${side}-elbow`)
    const wrist = point(mesh, `${side}-wrist`)
    expect(shoulder.distanceTo(elbow)).toBeCloseTo(0.34, 6)
    expect(elbow.distanceTo(wrist)).toBeCloseTo(ARM_LENGTH - 0.34, 6)
    const hip = point(mesh, `${side}-hip`)
    const knee = point(mesh, `${side}-knee`)
    const ankle = point(mesh, `${side}-ankle`)
    expect(hip.distanceTo(knee)).toBeCloseTo(0.43, 6)
    expect(knee.distanceTo(ankle)).toBeCloseTo(0.43, 6)
    near(point(mesh, `${side}-shoe`), ankle)
    expect(mesh.getObjectByName(`${side}-shoe`)!.parent!.name).toBe(`${side}-ankle`)
    for (const [name, start, end] of [
      ['upper-arm', shoulder, elbow], ['forearm', elbow, wrist],
      ['thigh', hip, knee], ['shin', knee, ankle],
    ] as const) {
      const segment = mesh.getObjectByName(`${side}-${name}`)!
      near(segment.localToWorld(new THREE.Vector3(0, -0.5, 0)), start)
      near(segment.localToWorld(new THREE.Vector3(0, 0.5, 0)), end)
    }
  }
  near(point(mesh, 'player-racket'), point(mesh, 'right-wrist'))
  expect(point(mesh, 'racket-string-center').distanceTo(point(mesh, 'right-wrist')))
    .toBeCloseTo(RACKET_STRING_CENTER_DISTANCE, 6)
}

function setContact(player: PlayerState) {
  player.swing = { ...player.swing, phase: 'recovery', elapsed: RACKETS[player.loadout].preparation + 0.04 }
  player.contactPose = createReachableRacketPose({
    desiredContact: idealContactPoint(player.pos, player.side, player.swing.shot),
    playerPos: player.pos,
    playerSide: player.side,
    racketFaceDeg: getTechniqueRacketFaceDeg(player.swing.shot),
  })
}

describe('low-poly player rig', () => {
  it('has a 1.78 m silhouette, adult head and 0.40 m shoulder joint span without a DOM', () => {
    const mesh = makeMesh()
    const box = bounds(mesh)
    expect(PLAYER_HEIGHT).toBe(1.78)
    expect(box.min.y).toBeCloseTo(0, 5)
    expect(box.max.y).toBeCloseTo(PLAYER_HEIGHT, 4)
    const headSize = bounds(mesh, 'player-head').getSize(new THREE.Vector3())
    expect(headSize.x).toBeGreaterThanOrEqual(0.21)
    expect(headSize.x).toBeLessThanOrEqual(0.23)
    near(point(mesh, 'right-shoulder'), new THREE.Vector3(-SHOULDER_HALF_WIDTH, SHOULDER_HEIGHT, 0.04))
    expect(point(mesh, 'right-shoulder').distanceTo(point(mesh, 'left-shoulder'))).toBeCloseTo(0.4, 6)
    expectChains(mesh)
  })

  it('builds a 0.675 m racket with an elliptical frame and thin string bed', () => {
    const mesh = makeMesh()
    const racket = mesh.getObjectByName('player-racket')!.clone(true)
    racket.position.set(0, 0, 0)
    racket.quaternion.identity()
    const box = bounds(racket)
    expect(box.min.y).toBeCloseTo(-0.08, 4)
    expect(box.max.y).toBeCloseTo(0.46 + 0.135, 4)
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(0.675, 4)
    expect(box.getSize(new THREE.Vector3()).x).toBeCloseTo(0.2, 4)
    expect((racket.getObjectByName('racket-strings') as THREE.LineSegments).isLineSegments).toBe(true)
    expect(racket.getObjectByName('racket-string-center')!.position.y).toBe(0.46)
  })

  it.each([0, 1] as const)('puts the racket in anatomical right hand for side %s', side => {
    const mesh = makeMesh()
    const player = createPlayer(side)
    player.pos = [side === 0 ? -3 : 3, 0, 0.7]
    syncPlayerMotion(mesh, player, 0)
    near(point(mesh, 'right-shoulder'), new THREE.Vector3(...getPlayerRightShoulder(player.pos, side)))
    const forward = side === 0 ? 1 : -1
    expect((point(mesh, 'right-wrist').z - player.pos[2]) * forward).toBeGreaterThan(0)
    expect((point(mesh, 'left-wrist').z - player.pos[2]) * forward).toBeLessThan(0)
    expectChains(mesh)
  })

  for (const side of [0, 1] as const) {
    it.each(SHOT_ORDER)(`aligns side ${side} %s contact grip, strings and face with shared physics`, shot => {
      const mesh = makeMesh()
      const player = createPlayer(side)
      player.swing.shot = shot
      player.selectedShot = shot
      setContact(player)
      syncPlayerMotion(mesh, player, 1)
      near(point(mesh, 'right-wrist'), new THREE.Vector3(...player.contactPose!.gripPoint))
      near(point(mesh, 'racket-string-center'), new THREE.Vector3(...player.contactPose!.stringCenter))
      const orientation = mesh.getObjectByName('player-racket')!.getWorldQuaternion(new THREE.Quaternion())
      near(new THREE.Vector3(0, 0, 1).applyQuaternion(orientation), new THREE.Vector3(...player.contactPose!.faceNormal))
      expectChains(mesh)
    })
  }

  it.each(['loading', 'airborne', 'landing'] as const)('keeps contact aligned during %s and scissor rotation', phase => {
    const mesh = makeMesh()
    const player = createPlayer(1)
    player.body = { phase, action: 'scissor', elapsed: 0.15, verticalVelocity: 1 }
    player.pos[1] = phase === 'airborne' ? 0.35 : 0
    setContact(player)
    syncPlayerMotion(mesh, player, 0.5)
    near(point(mesh, 'right-shoulder'), new THREE.Vector3(...getPlayerRightShoulder(player.pos, player.side)))
    near(point(mesh, 'racket-string-center'), new THREE.Vector3(...player.contactPose!.stringCenter))
    expectChains(mesh)
  })

  it.each([0, 1] as const)('keeps a support foot planted even during moving contact on side %s', side => {
    const mesh = makeMesh()
    const player = createPlayer(side)
    player.movement.currentVel = { x: 5.5, z: 2 }
    for (let frame = 0; frame < 20; frame++) {
      // A new physical contact at each sampled gait time raises the shoulder
      // to its shared height, where a full running stride would be unreachable.
      setContact(player)
      syncPlayerMotion(mesh, player, frame / 60)
      expect(Math.min(bounds(mesh, 'right-shoe').min.y, bounds(mesh, 'left-shoe').min.y)).toBeCloseTo(0, 5)
      near(point(mesh, 'racket-string-center'), new THREE.Vector3(...player.contactPose!.stringCenter))
      expectChains(mesh)
    }
  })

  it('keeps shoes grounded at rest and during loading/landing while bending the knees', () => {
    const mesh = makeMesh()
    const player = createPlayer(0)
    syncPlayerMotion(mesh, player, 0)
    const standingHip = point(mesh, 'right-hip').y
    for (const phase of ['grounded', 'loading', 'landing'] as const) {
      player.body = { phase, action: phase === 'grounded' ? null : 'jump', elapsed: 0.06, verticalVelocity: 0 }
      syncPlayerMotion(mesh, player, 0.2)
      for (const side of ['right', 'left']) {
        expect(bounds(mesh, `${side}-shoe`).min.y).toBeCloseTo(0, 5)
      }
      if (phase !== 'grounded') expect(point(mesh, 'right-hip').y).toBeLessThan(standingHip - 0.03)
      expectChains(mesh)
    }
  })

  it('animates start, walking and airborne scissor legs without stretching or detached feet', () => {
    const mesh = makeMesh()
    const player = createPlayer(0)
    syncPlayerMotion(mesh, player, 0)
    const idleAnkle = point(mesh, 'right-ankle')
    player.movement.footwork = 'start'
    player.movement.targetDir.x = 1
    syncPlayerMotion(mesh, player, 0.08)
    expect(point(mesh, 'right-ankle').distanceTo(idleAnkle)).toBeGreaterThan(0.02)
    player.movement.currentVel = { x: 4.5, z: 1.5 }
    for (let frame = 0; frame < 30; frame++) {
      syncPlayerMotion(mesh, player, frame / 60)
      expectChains(mesh)
      const bottoms = ['right', 'left'].map(side => bounds(mesh, `${side}-shoe`).min.y)
      expect(Math.min(...bottoms)).toBeCloseTo(0, 5)
      expect(Math.max(...bottoms)).toBeLessThan(0.16)
    }
    player.body = { phase: 'airborne', action: 'scissor', elapsed: 0.08, verticalVelocity: 1.5 }
    player.pos[1] = 0.35
    syncPlayerMotion(mesh, player, 0.5)
    const hips = mesh.getObjectByName('player-hips')!
    const legSeparation = hips.worldToLocal(point(mesh, 'right-ankle')).z - hips.worldToLocal(point(mesh, 'left-ankle')).z
    const initialTurn = mesh.getObjectByName('player-hips')!.rotation.y
    expect(bounds(mesh, 'right-shoe').min.y).toBeGreaterThan(0)
    player.body.elapsed = 0.35
    syncPlayerMotion(mesh, player, 0.77)
    const swapped = hips.worldToLocal(point(mesh, 'right-ankle')).z - hips.worldToLocal(point(mesh, 'left-ankle')).z
    expect(legSeparation * swapped).toBeLessThan(0)
    expect(mesh.getObjectByName('player-hips')!.rotation.y).not.toBeCloseTo(initialTurn, 3)
    expectChains(mesh)
  })

  it.each(SHOT_ORDER)('%s uses a bent ready arm, bounded continuous phases and returns to ready', shot => {
    const mesh = makeMesh()
    const player = createPlayer(0)
    player.swing.shot = shot
    player.selectedShot = shot
    syncPlayerMotion(mesh, player, 0)
    const ready = point(mesh, 'racket-string-center')
    expect(point(mesh, 'right-shoulder').distanceTo(point(mesh, 'right-wrist'))).toBeLessThan(ARM_LENGTH - 0.15)
    const prep = RACKETS[player.loadout].preparation
    let previous = ready
    const step = 0.002
    const advance = (phase: PlayerState['swing']['phase'], from: number, to: number) => {
      player.swing.phase = phase
      for (let clock = from; clock <= to; clock += step) {
        player.swing.elapsed = clock
        syncPlayerMotion(mesh, player, clock)
        const center = point(mesh, 'racket-string-center')
        expect(center.distanceTo(previous)).toBeLessThan(0.09)
        previous = center
        expectChains(mesh)
      }
    }
    // 新时钟：引拍按住时长（蓄力可长于 preparation），出拍后接触窗口与恢复从 0 重新计时。
    advance('preparing', 0, prep)
    advance('preparing', prep, prep + 0.3)
    advance('swinging', 0, 0.16)
    advance('recovery', 0.16, RACKETS[player.loadout].recovery)
    player.swing.phase = 'ready'
    syncPlayerMotion(mesh, player, 1)
    near(point(mesh, 'racket-string-center'), ready)
  })

  it('translates recovery with the body, rather than reusing stale contact world positions', () => {
    const stationary = makeMesh()
    const moving = makeMesh()
    const player = createPlayer(0)
    setContact(player)
    syncPlayerMotion(stationary, player, 1)
    syncPlayerMotion(moving, player, 1)
    player.swing.elapsed += 0.035
    syncPlayerMotion(stationary, player, 1.035)
    const translation = new THREE.Vector3(1.7, 0, -1.2)
    const moved = { ...player, pos: new THREE.Vector3(...player.pos).add(translation).toArray() as [number, number, number] }
    syncPlayerMotion(moving, moved, 1.035)
    near(point(moving, 'right-wrist'), point(stationary, 'right-wrist').add(translation))
    near(point(moving, 'racket-string-center'), point(stationary, 'racket-string-center').add(translation))
    expectChains(moving)
    moved.swing = { ...moved.swing, phase: 'ready', elapsed: 0.6 }
    syncPlayerMotion(moving, moved, 1.6)
    expect(point(moving, 'right-shoulder').distanceTo(point(moving, 'right-wrist'))).toBeLessThan(0.5)
  })

  it('霓虹饰件存在且自带自发光（队服饰边 / 额带 / 袖口 / 护腕 / 鞋侧 / 拍框 / 手胶）', () => {
    const mesh = makeMesh()
    const parts = [
      'jersey-trim', 'jersey-collar', 'player-headband', 'shorts-waistband',
      'right-sleeve', 'left-sleeve', 'right-wristband', 'right-shoe-stripe', 'right-shoe-laces',
      'racket-frame', 'racket-shaft', 'racket-grip-wrap-0.02', 'player-rim-light',
    ]
    for (const name of parts) {
      const node = mesh.getObjectByName(name)
      expect(node, name).toBeDefined()
      if (node instanceof THREE.Mesh) {
        expect((node.material as THREE.MeshStandardMaterial).emissiveIntensity, name).toBeGreaterThan(0)
      }
    }
    // 身体包围盒仍由原骨架决定：饰件没有把身高撑高，也没有把鞋底压到地面以下。
    const box = bounds(mesh)
    expect(box.min.y).toBeCloseTo(0, 5)
    expect(box.max.y).toBeCloseTo(PLAYER_HEIGHT, 4)
  })

  it('drives facing from the hips and increases shoulder-hip separation on the backswing', () => {
    const mesh = makeMesh()
    const player = createPlayer(0)
    const hips = () => mesh.getObjectByName('player-hips')!.rotation.y
    const separation = () => mesh.getObjectByName('player-chest')!.rotation.y - mesh.getObjectByName('player-hips')!.rotation.y

    player.movement.targetDir = { x: 0, z: 1 }
    syncPlayerMotion(mesh, player, 0)
    const movingRight = hips()
    player.movement.targetDir = { x: 0, z: -1 }
    syncPlayerMotion(mesh, player, 0)
    const movingLeft = hips()
    expect(movingRight).not.toBeCloseTo(movingLeft, 3)

    player.movement.targetDir = { x: 0, z: 0 }
    player.swing = { ...player.swing, phase: 'ready', elapsed: 0 }
    syncPlayerMotion(mesh, player, 0)
    const readySeparation = Math.abs(separation())
    player.swing = { ...player.swing, phase: 'preparing', elapsed: RACKETS[player.loadout].preparation }
    syncPlayerMotion(mesh, player, 0)
    expect(Math.abs(separation())).toBeGreaterThan(readySeparation + 0.1)
  })

  it.each([0, 1] as const)('turns side-on and keeps the off-hand raised on side %s', side => {
    const mesh = makeMesh()
    const player = createPlayer(side)
    player.pos = [side === 0 ? -3 : 3, 0, 0.6]
    syncPlayerMotion(mesh, player, 0)
    const forward = side === 0 ? 1 : -1
    const shoulderGap = (point(mesh, 'right-shoulder').x - point(mesh, 'left-shoulder').x) * forward
    // 正手准备：持拍肩在后（-），非持拍肩朝网；反手时镜像。
    expect(shoulderGap).toBeLessThan(-0.08)
    const chest = mesh.getObjectByName('player-chest')!
    const localWrist = () => chest.worldToLocal(point(mesh, 'left-wrist').clone())
    expect(localWrist().y).toBeGreaterThan(1.15)
    expect(localWrist().z).toBeGreaterThan(0.15)

    player.grip = 'backhand'
    syncPlayerMotion(mesh, player, 0)
    expect((point(mesh, 'right-shoulder').x - point(mesh, 'left-shoulder').x) * forward).toBeGreaterThan(0.08)

    // 前场跨步时辅助手向后展开配平，而非继续吊在胸前。
    player.movement.footworkPoint = side === 0 ? 'front-right' : 'front-left'
    player.movement.footwork = 'lunge'
    player.movement.currentVel = { x: forward * 5, z: forward * 2 }
    syncPlayerMotion(mesh, player, 0.05)
    expect(localWrist().z).toBeLessThan(-0.2)
  })

  it('poses the six points differently: front lunge, mid chasse and rear cross step', () => {
    const mesh = makeMesh()
    const player = createPlayer(0)
    player.pos = [-3, 0, 0.8]
    // 侧身后脚踝挂在髋下，用髋局部坐标判断步型，避免混入躯干朝向。
    const hips = mesh.getObjectByName('player-hips')!
    const offset = (side: string) => hips.worldToLocal(point(mesh, `${side}-ankle`).clone())
    const worldOffset = (side: string) => {
      const value = point(mesh, `${side}-ankle`).clone()
      value.x -= player.pos[0]
      value.z -= player.pos[2]
      return value
    }
    const pose = (pointName: NonNullable<PlayerState['movement']['footworkPoint']>, footwork: PlayerState['movement']['footwork'], vel: { x: number; z: number }, elapsed: number) => {
      player.movement.footworkPoint = pointName
      player.movement.footwork = footwork
      player.movement.currentVel = vel
      player.movement.targetDir = { x: Math.sign(vel.x), z: Math.sign(vel.z) }
      syncPlayerMotion(mesh, player, elapsed)
      return { right: offset('right'), left: offset('left') }
    }

    // 前场：持拍腿向前跨，并朝目标角一侧压；异侧腿在身后蹬地。
    const frontRight = pose('front-right', 'lunge', { x: 5, z: 2 }, 0.06)
    const frontRightWorld = worldOffset('right')
    expect(frontRightWorld.x).toBeGreaterThan(0.25)
    expect(frontRightWorld.z).toBeGreaterThan(0.2)
    expect(frontRight.left.z).toBeLessThan(frontRight.right.z - 0.25)
    pose('front-left', 'lunge', { x: 5, z: -2 }, 0.06)
    const frontLeftWorld = worldOffset('right')
    expect(frontLeftWorld.x).toBeGreaterThan(0.25)
    expect(frontLeftWorld.z).toBeLessThan(-0.15)

    // 中场：同侧腿领步，两脚整体沿目标方向并步移动。
    const midRight = pose('mid-right', 'chasse', { x: 0, z: 5 }, 0.06)
    expect(midRight.right.x - midRight.left.x).toBeLessThan(-0.22)
    const midLeft = pose('mid-left', 'chasse', { x: 0, z: -5 }, 0.06)
    expect(midLeft.left.x).toBeGreaterThan(0.2)

    // 后场：异侧腿从身后越过身体中线。侧身后的世界坐标混入躯干旋转，
    // 所以直接比较踝关节在人体局部坐标里的左右关系。
    const phase = Math.PI / 2 / 14
    const localAnkle = (side: string) => mesh.getObjectByName(`${side}-ankle`)!.position.x
    pose('back-right', 'cross', { x: -4, z: 3 }, phase)
    expect(localAnkle('left')).toBeLessThan(localAnkle('right'))
    pose('back-left', 'cross', { x: -4, z: -3 }, phase)
    expect(localAnkle('right')).toBeGreaterThan(localAnkle('left'))
  })

  it('retains legacy positioning/swing interfaces without detaching the right hand', () => {
    const mesh = makeMesh()
    updatePlayerMesh(mesh, [2, 0.3, -1], Math.PI / 2)
    near(mesh.position, new THREE.Vector3(2, 0.3, -1))
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2)
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      updatePlayerRacketPose(mesh, t)
      expectChains(mesh)
    }
    // 脚下能量环：细边线环 + 光晕 + 扫描弧，三层都不许长成发光圆盘。
    const marker = createGroundMarker(0xabcdef)
    expect(marker.children.map(child => child.name)).toEqual(['ground-ring', 'ground-halo', 'ground-sweep'])
    expect(bounds(marker).getSize(new THREE.Vector3()).x).toBeLessThan(0.75)
    updateGroundMarker(marker, 0.5)
    expect(marker.getObjectByName('ground-sweep')!.rotation.z).toBeCloseTo(-0.75, 6)
    const halo = marker.getObjectByName('ground-halo') as THREE.Mesh
    expect((halo.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0.1)
  })
})
