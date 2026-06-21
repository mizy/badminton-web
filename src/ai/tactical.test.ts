import { describe, expect, it } from 'vitest'
import { getAIConfig } from './difficulty'
import { decideTactical } from './tactical'
import { createPlayer } from '../game/playerFactory'

describe('AI tactical decisions', () => {
  it('keeps shot targets inside the opponent singles court', () => {
    const home = createPlayer(0)
    const away = createPlayer(1)
    const config = getAIConfig('easy')
    const shuttle = {
      pos: [-3, 2.1, 0] as [number, number, number],
      spin: [0, 0, 0] as [number, number, number],
      vel: [0, 0, 0] as [number, number, number],
    }

    for (let i = 0; i < 60; i++) {
      const decision = decideTactical(home, away, shuttle, config)

      expect(decision.target[0]).toBeGreaterThanOrEqual(0.1)
      expect(decision.target[0]).toBeLessThanOrEqual(6.7)
      expect(decision.target[2]).toBeGreaterThanOrEqual(-3.05)
      expect(decision.target[2]).toBeLessThanOrEqual(3.05)
    }
  })

  it('keeps away player shot targets inside home court', () => {
    const home = createPlayer(0)
    const away = createPlayer(1)
    const config = getAIConfig('easy')
    const shuttle = {
      pos: [3, 2.1, 0] as [number, number, number],
      spin: [0, 0, 0] as [number, number, number],
      vel: [0, 0, 0] as [number, number, number],
    }

    for (let i = 0; i < 60; i++) {
      const decision = decideTactical(away, home, shuttle, config)

      expect(decision.target[0]).toBeGreaterThanOrEqual(-6.7)
      expect(decision.target[0]).toBeLessThanOrEqual(-0.1)
      expect(decision.target[2]).toBeGreaterThanOrEqual(-3.05)
      expect(decision.target[2]).toBeLessThanOrEqual(3.05)
    }
  })
})
