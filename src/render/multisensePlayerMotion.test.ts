import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ANKLE_HEIGHT, createPlayerSkeleton } from './playerSkeleton'
import { applyMultiSensePlayerMotion, type MultiSenseCapture } from './multisensePlayerMotion'

const capture = JSON.parse(readFileSync(new URL('../../public/mocap/multisense-badminton/expert-backhand-Sub14.json', import.meta.url), 'utf8')) as MultiSenseCapture

describe('measured expert backhand retargeting', () => {
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
