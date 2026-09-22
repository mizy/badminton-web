import { describe, expect, it } from 'vitest'
import { ARM_LENGTH, createReachableRacketPose, distance3, getPlayerRightShoulder, PLAYER_HEIGHT, RACKET_STRING_CENTER_DISTANCE } from './racketKinematics'

describe('metre-scale right-handed contact geometry', () => {
  it('uses the anatomical right shoulder when either player faces the net', () => {
    expect(getPlayerRightShoulder([-3, 0, 0], 0)).toEqual([-2.96, 1.46, 0.2])
    expect(getPlayerRightShoulder([3, 0, 0], 1)).toEqual([2.96, 1.46, -0.2])
    expect(PLAYER_HEIGHT).toBe(1.78)
    expect(RACKET_STRING_CENTER_DISTANCE).toBe(0.46)
  })
  it('keeps a bent ready arm on the right without stretching the racket or upper limb', () => {
    for (const side of [0, 1] as const) {
      const forward = side === 0 ? 1 : -1
      const pos: [number, number, number] = [-forward * 3, 0, 0]
      const pose = createReachableRacketPose({ playerPos: pos, playerSide: side, desiredContact: [pos[0] + forward * 0.5, 1.45, forward * 0.35], racketFaceDeg: 0 })
      expect(pose.reachable).toBe(true)
      expect(pose.gripPoint[2] * forward).toBeGreaterThan(0)
      expect(distance3(getPlayerRightShoulder(pos, side), pose.gripPoint)).toBeLessThan(ARM_LENGTH - 0.05)
      expect(distance3(pose.gripPoint, pose.stringCenter)).toBeCloseTo(RACKET_STRING_CENTER_DISTANCE, 6)
    }
  })
  it('does not retain the old oversized racket reach', () => {
    const pose = createReachableRacketPose({ playerPos: [-3, 0, 0], playerSide: 0, desiredContact: [-1.7, 1.46, 0.2], racketFaceDeg: 0 })
    expect(pose.reachable).toBe(false)
  })
})
