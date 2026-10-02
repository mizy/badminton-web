import { describe, expect, it, vi } from 'vitest'
import * as physics from '../physics/shuttlecock'
import { solveTargetedShot } from './shotTargeting'

describe('targeted shot convergence', () => {
  it('stops after reaching centimetre accuracy instead of repeatedly solving an already aligned shot', () => {
    const step = vi.spyOn(physics, 'stepShuttlecock')
    try {
      const result = solveTargetedShot({ corkCenter: [-2, 1.82, 0], elevationDeg: 42,
        maxSpeed: 28, spin: [0, 0, 0], target: [5.65, 0, 0] })
      expect(result.converged).toBe(true)
      expect(result.targetError).toBeLessThan(0.02)
      expect(result.netClearance).toBeGreaterThan(0)
      // Every candidate calls the real RK4 physics until landing. This bounds
      // repeated flight work rather than a machine-dependent timing assertion.
      expect(step.mock.calls.length).toBeLessThan(4000)
    } finally { step.mockRestore() }
  })
})
