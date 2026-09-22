import { describe, expect, it } from 'vitest'
import { advanceSimulation } from './simulation'
import { createPlayer } from '../game/playerFactory'
import { gameReducer } from '../game/reducer'
import { createFullGameState } from '../game/types'
import { getAIConfig } from '../ai/difficulty'

function play(fps: number, seconds: number) {
  let state = gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)], controls: ['ai', 'ai'] })
  const configs = { home: getAIConfig('medium', 'rally'), away: getAIConfig('medium', 'placement') }
  const clock = { accumulator: 0 }
  for (let i = 0; i < seconds * fps; i++) {
    state = advanceSimulation(state, 1 / fps, clock, configs)
    if (state.phase === 'set_end') state = gameReducer(state, { type: 'RESOLVE_SET_END' })
  }
  return state
}

describe('fixed-step game simulation', () => {
  it('has identical physical and score results at 30/60/120 FPS', () => {
    expect(play(30, 12)).toEqual(play(60, 12))
    expect(play(120, 12)).toEqual(play(60, 12))
  }, 30000)
  it('forms cooperative multi-shot rallies without forced contact or score changes', () => {
    let state = gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'training', players: [createPlayer(0), createPlayer(1)], controls: ['ai', 'ai'] })
    const configs = { home: getAIConfig('medium', 'rally', true), away: getAIConfig('medium', 'rally', true) }
    const clock = { accumulator: 0 }
    let best = 0
    for (let frame = 0; frame < 60 * 90; frame++) {
      state = advanceSimulation(state, 1 / 60, clock, configs)
      best = Math.max(best, state.rallyHits)
    }
    expect(best).toBeGreaterThanOrEqual(6)
    expect(state.match?.points).toEqual([0, 0])
  }, 30000)
  it('drops hidden-tab backlog instead of advancing a paused match', () => {
    const state = gameReducer(createFullGameState(), { type: 'PAUSE', playerIndex: 0 })
    const clock = { accumulator: 0.2 }
    expect(advanceSimulation(state, 10, clock)).toBe(state)
    expect(clock.accumulator).toBe(0)
  })
  it('finishes a full best-of-three without external services or auto-restarting', () => {
    const state = play(60, 1200)
    expect(state.phase).toBe('match_end')
    expect(state.match!.sets.filter(s => s.home > s.away).length >= 2 || state.match!.sets.filter(s => s.away > s.home).length >= 2).toBe(true)
    expect(state.rallyId).toBeGreaterThan(40)
  }, 60000)
})
