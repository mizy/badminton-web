import { describe, expect, it } from 'vitest'
import {
  createHdm05StrikeClip,
  findHdm05StrikeFrame,
  sampleHdm05Playback,
  type Hdm05Motion,
} from './hdm05BadmintonMocap'

describe('HDM05 playback sampling', () => {
  it('never directly interpolates the last raw frame to the first', () => {
    const motion = createMotion()
    const active = sampleHdm05Playback(motion, 0.19)
    const blend = sampleHdm05Playback(motion, 0.26)
    const nextLoop = sampleHdm05Playback(motion, 0.32)

    expect(active.loopBlend).toBe(false)
    expect(active.nextFrame).toBe(2)
    expect(blend.loopBlend).toBe(true)
    expect(blend.frame).toBe(2)
    expect(blend.nextFrame).toBe(0)
    expect(blend.alpha).toBeCloseTo(0.5, 5)
    expect(nextLoop.loopIndex).toBe(1)
    expect(nextLoop.frame).toBe(0)
    expect(nextLoop.loopBlend).toBe(false)
  })

  it('cuts around the arm-motion peak without changing the original arrays or root height', () => {
    const motion = createMotion()
    motion.poseBody = Array.from({ length: 60 }, () => createPose())
    motion.root = Array.from({ length: 60 }, (_, frame) => [frame / 10, 0, 0.2])
    motion.rootOrient = Array.from({ length: 60 }, () => [0, 0, 0])
    motion.poseBody[30][48] = 2
    const clip = createHdm05StrikeClip(motion)
    expect(clip.poseBody).toHaveLength(22)
    expect(clip.poseBody[0]).toBe(motion.poseBody[21])
    expect(clip.root[0]).toEqual([2.1, 0, 0.2])
    expect(motion.poseBody).toHaveLength(60)
    expect(sampleHdm05Playback(clip, 0).duration).toBeCloseTo(2.52, 6)
  })

  it('detects the strike from adjacent source frames without a loop seam', () => {
    const motion = createMotion()
    motion.poseBody[1][60] = 1
    motion.poseBody[2][60] = 1.05

    expect(findHdm05StrikeFrame(motion)).toBe(1)
  })
})

function createMotion(): Hdm05Motion {
  return {
    action: 'smash',
    actor: 'test',
    fps: 10,
    id: 'test-smash',
    label: 'Test smash',
    poseBody: [createPose(), createPose(), createPose()],
    root: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    rootOrient: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    sourceFps: 10,
    sourcePath: 'test',
    take: '01',
  }
}

function createPose(): number[] {
  return Array.from({ length: 63 }, () => 0)
}
