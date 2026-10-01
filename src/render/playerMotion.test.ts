import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlayer } from '../game/playerFactory'
import { createPlayerSkeleton } from './playerSkeleton'
import { createPlayerMotion, updatePlayerMotion } from './playerMotion'

const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())

function expectLengths(rig: ReturnType<typeof createPlayerMotion>) {
  rig.group.updateWorldMatrix(true, true)
  for (const limb of [rig.rightArm, rig.leftArm, rig.rightLeg, rig.leftLeg]) {
    expect(world(limb.root).distanceTo(world(limb.joint))).toBeCloseTo(limb.lengths[0], 6)
    expect(world(limb.joint).distanceTo(world(limb.end))).toBeCloseTo(limb.lengths[1], 6)
    expect(limb.joint.position.toArray()).toEqual([0, -limb.lengths[0], 0])
    expect(limb.end.position.toArray()).toEqual([0, -limb.lengths[1], 0])
  }
}

describe('independent player motion', () => {
  it('runs moving, turning and braking without a character model or changing bind lengths', () => {
    const rig = createPlayerMotion(createPlayerSkeleton())
    const player = createPlayer(0)
    updatePlayerMotion(rig, player, 0)
    let previous = [world(rig.rightLeg.end), world(rig.leftLeg.end)]
    let maximum = 0
    for (let frame = 1; frame <= 180; frame++) {
      const velocity = frame < 60 ? 2.8 : frame < 110 ? -2.8 : 0
      player.pos[2] += velocity / 60
      player.movement.currentVel = { x: 0, z: velocity }
      player.movement.targetDir = { x: 0, z: Math.sign(velocity) }
      player.movement.footwork = velocity === 0 ? 'recover' : 'chasse'
      updatePlayerMotion(rig, player, frame / 60)
      const ankles = [world(rig.rightLeg.end), world(rig.leftLeg.end)]
      maximum = Math.max(maximum, ...ankles.map((ankle, i) => ankle.distanceTo(previous[i])))
      previous = ankles
      expect(Math.min(...ankles.map(ankle => ankle.y))).toBeCloseTo(0.09, 6)
      expectLengths(rig)
    }
    expect(maximum).toBeLessThan(0.17)
    for (const ankle of previous) expect(ankle.y).toBeCloseTo(0.09, 6)
    const renderables: THREE.Object3D[] = []
    rig.group.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) renderables.push(node) })
    expect(renderables).toHaveLength(0)
  })

  it('resets foot plants when a new session resets the simulation clock', () => {
    const rig = createPlayerMotion(createPlayerSkeleton())
    const player = createPlayer(0)
    player.movement.currentVel = { x: 0, z: 2 }
    player.movement.footwork = 'chasse'
    for (let frame = 0; frame < 80; frame++) {
      player.pos[2] += 2 / 60
      updatePlayerMotion(rig, player, frame / 60)
    }
    const fresh = createPlayer(0)
    updatePlayerMotion(rig, fresh, 0)
    for (const ankle of [rig.rightLeg.end, rig.leftLeg.end]) {
      expect(world(ankle).y).toBeCloseTo(0.09, 6)
      expect(world(ankle).distanceTo(new THREE.Vector3(...fresh.pos))).toBeLessThan(0.4)
    }
    expectLengths(rig)
  })

  it('mirrors visible hip and shoulder side-on posture across six-point corners and grips', () => {
    const pose = (point: NonNullable<ReturnType<typeof createPlayer>['movement']['footworkPoint']>, grip: 'forehand' | 'backhand') => {
      const rig = createPlayerMotion(createPlayerSkeleton())
      const player = createPlayer(0)
      player.movement.footworkPoint = point
      player.movement.footwork = point.startsWith('front') ? 'lunge' : point.startsWith('back') ? 'cross' : 'chasse'
      player.grip = grip
      player.swing = { ...player.swing, phase: 'preparing', elapsed: 0.08 }
      updatePlayerMotion(rig, player, 0)
      return { hips: rig.hips.rotation.y, chest: rig.chest.rotation.y }
    }

    const frontRight = pose('front-right', 'forehand')
    const frontLeft = pose('front-left', 'backhand')
    const backRight = pose('back-right', 'forehand')

    expect(frontRight.hips).toBeLessThan(-0.35)
    expect(frontLeft.hips).toBeGreaterThan(0.35)
    expect(backRight.hips).toBeLessThan(frontRight.hips)
    expect(frontRight.chest - frontRight.hips).toBeGreaterThan(0.1)
    expect(frontLeft.chest - frontLeft.hips).toBeLessThan(-0.1)
    for (const angle of [frontRight.hips, frontRight.chest, frontLeft.hips, frontLeft.chest, backRight.hips, backRight.chest]) {
      expect(Math.abs(angle)).toBeLessThan(Math.PI / 2)
    }
  })
})
