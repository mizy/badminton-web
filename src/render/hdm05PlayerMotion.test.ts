import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ARM_LENGTH, SHOULDER_HALF_WIDTH } from '../character/racketKinematics'
import { createPlayerSkeleton } from './playerSkeleton'
import { applyHdm05PlayerMotion } from './hdm05PlayerMotion'
import { createHdm05StrikeClip, HDM05_CLIPS, type Hdm05Motion } from './hdm05BadmintonMocap'

const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
function neutral(): Hdm05Motion {
  return { id: 'neutral', action: 'smash', label: 'neutral', actor: 'test', take: '0', fps: 10,
    sourceFps: 10, sourcePath: 'test', root: [[0, 0, 0], [0, 0, 0]],
    rootOrient: [[Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]],
    poseBody: [Array(63).fill(0), Array(63).fill(0)] }
}

describe('HDM05 to shared skeleton', () => {
  it('converts a Z-up recording to an upright Y-up T-pose without mirroring the hands', () => {
    const rig = createPlayerSkeleton()
    applyHdm05PlayerMotion(rig, neutral(), 0)
    expect(world(rig.head).y).toBeCloseTo(1.654, 6)
    expect(world(rig.rightArm.end).x).toBeCloseTo(-SHOULDER_HALF_WIDTH - ARM_LENGTH, 6)
    expect(world(rig.leftArm.end).x).toBeCloseTo(SHOULDER_HALF_WIDTH + ARM_LENGTH, 6)
    expect(world(rig.rightLeg.end).y).toBeCloseTo(0.08, 6)
  })

  it('calibrates the shaft along the neutral right hand and the face to the palm', () => {
    const rig = createPlayerSkeleton()
    applyHdm05PlayerMotion(rig, neutral(), 0)
    const q = rig.racket.getWorldQuaternion(new THREE.Quaternion())
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-8)
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(new THREE.Vector3(0, -1, 0))).toBeLessThan(1e-8)
  })

  it('recentres horizontal travel while preserving recorded vertical displacement', () => {
    const motion = neutral()
    motion.root = [[4, 5, 0.2], [5, 7, 0.5]]
    const rig = createPlayerSkeleton()
    applyHdm05PlayerMotion(rig, motion, 0)
    expect(rig.body.position.distanceTo(new THREE.Vector3(0, 0.2, 0))).toBeLessThan(1e-8)
    applyHdm05PlayerMotion(rig, motion, 0.1)
    expect(rig.body.position.x).toBeCloseTo(1, 6)
    expect(rig.body.position.y).toBeCloseTo(0.5, 6)
    expect(rig.body.position.z).toBeCloseTo(-2, 6)
  })

  it('takes the short quaternion path across an axis-angle wrap instead of unwinding the arm', () => {
    const motion = neutral()
    motion.poseBody[0][16 * 3 + 1] = 3.1
    motion.poseBody[1][16 * 3 + 1] = -3.1
    const rig = createPlayerSkeleton()
    applyHdm05PlayerMotion(rig, motion, 0.05)
    expect(world(rig.rightArm.end).x).toBeGreaterThan(0.45)
  })

  it.each(HDM05_CLIPS)('plays every frame of %s on joints alone without changing bone lengths', id => {
    const recording = JSON.parse(readFileSync(new URL(`../../public/mocap/hdm05-badminton/${id}.json`, import.meta.url), 'utf8')) as Hdm05Motion
    const clip = createHdm05StrikeClip(recording)
    const rig = createPlayerSkeleton()
    let high = 0
    for (let frame = 0; frame < clip.poseBody.length * 2; frame++) {
      applyHdm05PlayerMotion(rig, clip, frame / clip.fps / 2)
      for (const limb of [rig.rightArm, rig.leftArm, rig.rightLeg, rig.leftLeg]) {
        expect(world(limb.root).distanceTo(world(limb.joint))).toBeCloseTo(limb.lengths[0], 6)
        expect(world(limb.joint).distanceTo(world(limb.end))).toBeCloseTo(limb.lengths[1], 6)
        expect(world(limb.end).toArray().every(Number.isFinite)).toBe(true)
      }
      high = Math.max(high, world(rig.rightArm.end).y)
    }
    if (clip.action === 'clear' || clip.action === 'smash') expect(high).toBeGreaterThan(1.5)
  })
})
