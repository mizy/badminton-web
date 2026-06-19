import { describe, expect, it } from 'vitest'
import { createBasicRallyOptions, createBasicRallyState, stepBasicRally } from './basicRally'

describe('basic rally orchestration', () => {
  it('creates a pure gameplay state with both players ready', () => {
    const rally = createBasicRallyState()

    expect(rally.game.phase).toBe('idle')
    expect(rally.game.players[0]?.side).toBe(0)
    expect(rally.game.players[1]?.side).toBe(1)
    expect(rally.game.shuttle).toBeNull()
    expect(rally.stats.serveCount).toBe(0)
  })

  it('auto-serves and advances through the reducer without render dependencies', () => {
    const options = createBasicRallyOptions('medium')
    let rally = createBasicRallyState()
    let served = false
    let sawPlaying = false

    for (let frame = 0; frame < 60; frame++) {
      const result = stepBasicRally(rally, 1 / 60, options)
      served ||= result.events.served
      sawPlaying ||= result.rally.game.phase === 'playing'
      rally = result.rally
    }

    expect(served).toBe(true)
    expect(sawPlaying).toBe(true)
    expect(rally.stats.serveCount).toBeGreaterThan(0)
  })
})
