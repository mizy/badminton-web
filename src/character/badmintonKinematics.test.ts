import { describe, expect, it } from 'vitest'
import {
  BADMINTON_ACTIONS,
  canBadmintonActionContact,
  getBadmintonActionContactCycle,
  sampleBadmintonShuttle,
} from './badmintonKinematics'
import type { Vec3 } from './racketKinematics'

describe('badminton action contact kinematics', () => {
  it('routes every hitting action through the measured racket anchor', () => {
    const anchor: Vec3 = [-1.37, 2.18, 0.41]
    const hittingActions = BADMINTON_ACTIONS.filter(canBadmintonActionContact)

    expect(hittingActions).toHaveLength(12)
    for (const action of hittingActions) {
      const shuttle = sampleBadmintonShuttle(action, getBadmintonActionContactCycle(action), anchor)
      expect(shuttle?.corkCenter, action).toEqual(anchor)
    }
  })

  it('is translation invariant instead of relying on story world coordinates', () => {
    const first: Vec3 = [-1.8, 1.4, 0.2]
    const second: Vec3 = [2.4, 2.1, -0.6]
    const cycle = 0.31
    const firstSample = sampleBadmintonShuttle('smash', cycle, first)
    const secondSample = sampleBadmintonShuttle('smash', cycle, second)

    expect(firstSample).not.toBeNull()
    expect(secondSample).not.toBeNull()
    expect(secondSample!.corkCenter[0] - firstSample!.corkCenter[0]).toBeCloseTo(second[0] - first[0])
    expect(secondSample!.corkCenter[1] - firstSample!.corkCenter[1]).toBeCloseTo(second[1] - first[1])
    expect(secondSample!.corkCenter[2] - firstSample!.corkCenter[2]).toBeCloseTo(second[2] - first[2])
  })

  it('brings the shuttle in from the opponent side before returning it across the net', () => {
    const anchor: Vec3 = [-1.8, 1.7, 0.2]
    const hittingActions = BADMINTON_ACTIONS.filter(canBadmintonActionContact)

    for (const action of hittingActions) {
      const contact = getBadmintonActionContactCycle(action)
      const incomingStart = sampleBadmintonShuttle(action, contact - 0.12, anchor)!
      const incomingEnd = sampleBadmintonShuttle(action, contact - 0.06, anchor)!
      const outgoingStart = sampleBadmintonShuttle(action, contact + 0.03, anchor)!
      const outgoingEnd = sampleBadmintonShuttle(action, contact + 0.09, anchor)!

      expect(incomingStart.corkCenter[0], action).toBeGreaterThan(anchor[0])
      expect(incomingEnd.corkCenter[0], action).toBeLessThan(incomingStart.corkCenter[0])
      expect(outgoingEnd.corkCenter[0], action).toBeGreaterThan(outgoingStart.corkCenter[0])
    }
  })
})
