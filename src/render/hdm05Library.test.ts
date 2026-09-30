import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerSkeleton } from './playerSkeleton'
import { applyHdm05PlayerMotion } from './hdm05PlayerMotion'
import type { Hdm05Motion } from './hdm05BadmintonMocap'

const catalog = JSON.parse(readFileSync(new URL('../../public/mocap/hdm05-library/manifest.json', import.meta.url), 'utf8')) as {
  motions: { id: string; category: string; path: string; frames: number }[]
}
const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())

describe('playable HDM05 library', () => {
  it('covers movement, jumping, training, daily actions and badminton with unique recordings', () => {
    expect(new Set(catalog.motions.map(entry => entry.category))).toEqual(new Set(['移动步法', '跳跃平衡', '运动训练', '日常动作', '羽毛球']))
    expect(new Set(catalog.motions.map(entry => entry.id)).size).toBe(catalog.motions.length)
    expect(catalog.motions.length).toBeGreaterThanOrEqual(28)
  })

  it.each(catalog.motions)('$id keeps the shared rig finite and preserves limb lengths across the recording', entry => {
    const motion = JSON.parse(readFileSync(new URL(`../../public${entry.path}`, import.meta.url), 'utf8')) as Hdm05Motion<string>
    expect(motion.poseBody.length).toBe(entry.frames)
    expect(motion.root.length).toBe(entry.frames)
    expect(motion.rootOrient.length).toBe(entry.frames)
    const rig = createPlayerSkeleton()
    for (let sample = 0; sample <= 10; sample++) {
      applyHdm05PlayerMotion(rig, motion, (entry.frames - 1) / motion.fps * sample / 10)
      for (const limb of [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg]) {
        expect(world(limb.root).distanceTo(world(limb.joint))).toBeCloseTo(limb.lengths[0], 6)
        expect(world(limb.joint).distanceTo(world(limb.end))).toBeCloseTo(limb.lengths[1], 6)
        expect(world(limb.end).toArray().every(Number.isFinite)).toBe(true)
      }
    }
  })
})
