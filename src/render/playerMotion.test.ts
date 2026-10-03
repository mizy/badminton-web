import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlayer } from '../game/playerFactory'
import { createPlayerSkeleton } from './playerSkeleton'
import { createPlayerMotion, updatePlayerMotion } from './playerMotion'
import { updateMovement } from '../character/movement'
import { FOOTWORK_POINTS } from '../character/footwork'

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
  it.each([0, 1] as const)('steps through all six corners and recovers without dragging support feet on side %s', side => {
    const forward = side === 0 ? 1 : -1
    for (const point of FOOTWORK_POINTS) {
      const rig = createPlayerMotion(createPlayerSkeleton())
      let player = createPlayer(side)
      player.pos = [-forward * 3.7, 0, 0]
      const x = point.startsWith('front') ? forward : point.startsWith('back') ? -forward : 0
      const z = point.endsWith('left') ? -forward : forward
      let plants = 0
      let lift = 0
      for (let frame = 0; frame < 180; frame++) {
        player.movement.targetDir = frame < 45 ? { x, z } : frame < 65 ? { x: 0, z: 0 }
          : frame < 110 ? { x: -x, z: -z } : { x: 0, z: 0 }
        player = updateMovement(player, 1 / 60)
        updatePlayerMotion(rig, player, frame / 60)
        for (const [i, limb] of [rig.rightLeg, rig.leftLeg].entries()) {
          const ankle = world(limb.end)
          lift = Math.max(lift, ankle.y - 0.09)
          if (rig.feet.feet[i].duration === 0) {
            plants++
            expect(ankle.distanceTo(rig.feet.feet[i].position)).toBeLessThan(1e-5)
          }
        }
        expectLengths(rig)
      }
      expect(plants).toBeGreaterThan(80)
      expect(lift).toBeGreaterThan(0.075)
      for (const foot of rig.feet.feet) {
        expect(foot.duration).toBe(0)
        expect(foot.position.y).toBeCloseTo(0.09, 6)
      }
      const feet = rig.feet.feet.map(foot => ({ position: foot.position.clone(), rotation: foot.rotation.clone() }))
      updatePlayerMotion(rig, player, 179 / 60)
      feet.forEach((foot, i) => {
        expect(rig.feet.feet[i].position.distanceTo(foot.position)).toBeLessThan(1e-6)
        expect(rig.feet.feet[i].rotation.angleTo(foot.rotation)).toBeLessThan(1e-6)
      })
    }
  })

  it.each([0, 1] as const)('uses a distinct cross-body backhand preparation on side %s', side => {
    const wrists = ['forehand', 'backhand'].map(grip => {
      const rig = createPlayerMotion(createPlayerSkeleton())
      const player = createPlayer(side)
      player.grip = grip as 'forehand' | 'backhand'
      player.swing = { ...player.swing, phase: 'preparing', shot: 'DRIVE', elapsed: 0.4 }
      updatePlayerMotion(rig, player, 0)
      expectLengths(rig)
      return rig.chest.worldToLocal(world(rig.rightArm.end))
    })
    expect(wrists[0].x).toBeLessThan(-0.25)
    expect(wrists[1].x).toBeGreaterThan(0.05)
  })

  it.each([0, 1] as const)('plants a racket-leg lunge with a bent front knee and extended support leg on side %s', side => {
    const rig = createPlayerMotion(createPlayerSkeleton())
    const player = createPlayer(side)
    const forward = side === 0 ? 1 : -1
    player.movement.footwork = 'lunge'
    player.movement.footworkPoint = 'front-right'
    player.movement.targetDir = { x: forward, z: forward }
    updatePlayerMotion(rig, player, 0)
    const direction = new THREE.Vector3(forward, 0, forward).normalize()
    const right = world(rig.rightLeg.end)
    const left = world(rig.leftLeg.end)
    expect(right.clone().sub(left).dot(direction)).toBeGreaterThan(0.9)
    const kneeAngle = (limb: typeof rig.rightLeg) => world(limb.root).sub(world(limb.joint))
      .angleTo(world(limb.end).sub(world(limb.joint))) * 180 / Math.PI
    expect(kneeAngle(rig.rightLeg)).toBeGreaterThan(70)
    expect(kneeAngle(rig.rightLeg)).toBeLessThan(140)
    expect(kneeAngle(rig.leftLeg)).toBeGreaterThan(145)
    for (let frame = 1; frame <= 60; frame++) {
      updatePlayerMotion(rig, player, frame / 60)
      expect(world(rig.rightLeg.end).distanceTo(right)).toBeLessThan(1e-6)
      expect(world(rig.leftLeg.end).distanceTo(left)).toBeLessThan(1e-6)
      expectLengths(rig)
    }
  })
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
    expect(frontRight.chest - frontRight.hips).toBeLessThan(-0.1)
    expect(frontLeft.chest - frontLeft.hips).toBeGreaterThan(0.1)
    expect(Math.abs(backRight.chest)).toBeGreaterThan(1.15)
    for (const angle of [frontRight.hips, frontRight.chest, frontLeft.hips, frontLeft.chest, backRight.hips, backRight.chest]) {
      expect(Math.abs(angle)).toBeLessThan(Math.PI / 2)
    }
  })
})
