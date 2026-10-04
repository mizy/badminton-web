import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ANKLE_HEIGHT, createPlayerSkeleton } from './playerSkeleton'
import { applyMultiSensePlayerMotion, type MultiSenseCapture } from './multisensePlayerMotion'

const capture = JSON.parse(readFileSync(new URL('../../public/mocap/multisense-badminton/expert-backhand-Sub14.json', import.meta.url), 'utf8')) as MultiSenseCapture

describe('measured expert backhand retargeting', () => {
  it.each([0.75, 1.15])('preserves captured knee and elbow angles for an actor scaled by %s', scale => {
    const recording: MultiSenseCapture = { time: capture.time,
      globalPositions: capture.globalPositions.map(frame => frame.map(point => point.map(value => value * scale) as [number, number, number])) }
    const rig = createPlayerSkeleton()
    applyMultiSensePlayerMotion(rig, recording, 0)
    const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
    for (const [limb, indices] of [[rig.rightLeg, [1, 2, 3]], [rig.leftLeg, [4, 5, 6]],
      [rig.rightArm, [14, 15, 16]], [rig.leftArm, [18, 19, 20]]] as const) {
      const [root, joint, end] = indices.map(index => new THREE.Vector3(...recording.globalPositions[0][index]))
      const capturedAngle = root.sub(joint).angleTo(end.sub(joint))
      const mappedAngle = world(limb.root).sub(world(limb.joint)).angleTo(world(limb.end).sub(world(limb.joint)))
      expect(mappedAngle).toBeCloseTo(capturedAngle, 6)
    }
    expect(Math.min(world(rig.rightLeg.end).y, world(rig.leftLeg.end).y)).toBeCloseTo(ANKLE_HEIGHT, 6)
  })

  it('samples all captured frames with fixed bone lengths and a grounded support ankle', () => {
    const rig = createPlayerSkeleton()
    for (const time of capture.time) {
      applyMultiSensePlayerMotion(rig, capture, time)
      const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
      for (const limb of [rig.rightArm, rig.leftArm, rig.rightLeg, rig.leftLeg]) {
        expect(world(limb.root).distanceTo(world(limb.joint))).toBeCloseTo(limb.lengths[0], 6)
        expect(world(limb.joint).distanceTo(world(limb.end))).toBeCloseTo(limb.lengths[1], 6)
        expect(world(limb.end).toArray().every(Number.isFinite)).toBe(true)
      }
      expect(Math.abs(Math.min(world(rig.rightLeg.end).y, world(rig.leftLeg.end).y) - ANKLE_HEIGHT)).toBeLessThan(0.015)
    }
  })
})
