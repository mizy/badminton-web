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
    const legSeparation = point(mesh, 'right-ankle').x - point(mesh, 'left-ankle').x
    const initialTurn = mesh.getObjectByName('player-body')!.rotation.y
    expect(bounds(mesh, 'right-shoe').min.y).toBeGreaterThan(0)
    player.body.elapsed = 0.35
    syncPlayerMotion(mesh, player, 0.77)
    expect(legSeparation * (point(mesh, 'right-ankle').x - point(mesh, 'left-ankle').x)).toBeLessThan(0)
    expect(mesh.getObjectByName('player-body')!.rotation.y).not.toBeCloseTo(initialTurn, 3)
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

  it('retains legacy positioning/swing interfaces without detaching the right hand', () => {
    const mesh = makeMesh()
    updatePlayerMesh(mesh, [2, 0.3, -1], Math.PI / 2)
    near(mesh.position, new THREE.Vector3(2, 0.3, -1))
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2)
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      updatePlayerRacketPose(mesh, t)
      expectChains(mesh)
    }
    const marker = createGroundMarker(0xabcdef)
    expect(marker.children).toHaveLength(1)
    expect(bounds(marker).getSize(new THREE.Vector3()).x).toBeLessThan(0.75)
  })
})
