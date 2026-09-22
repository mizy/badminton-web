import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { getAIConfig } from '../ai/difficulty'
import { SERVE_BY_SHOT, SERVE_ORDER } from '../character/serve'

function session() {
  return gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)] })
}

describe('serve selection and return', () => {
  it('offers four forehand/backhand serves chosen while waiting, then served by Space flow', () => {
    expect(SERVE_ORDER).toHaveLength(4)
    let state = session()
    for (const shot of ['CLEAR', 'DROP', 'NET_DROP', 'SMASH'] as const) {
      state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot })
      expect(state.players[0]!.serveSelection).toBe(SERVE_BY_SHOT[shot])
    }
    const served = gameReducer(state, { type: 'SERVE', playerIndex: 0 })
    expect(served.phase).toBe('playing')
    expect(served.shuttle!.vel[1]).toBeGreaterThan(0)
  })
  it('keeps short serves inside the short-service rule', () => {
    let state = gameReducer(session(), { type: 'SWING_START', playerIndex: 0, shot: 'NET_DROP' })
    state = gameReducer(state, { type: 'SERVE', playerIndex: 0 })
    let flight = state
    for (let i = 0; i < 600 && flight.phase === 'playing'; i++) flight = gameReducer(flight, { type: 'TICK', dt: 1 / 120 })
    expect(flight.lastPoint).not.toBeNull()
    expect(flight.lastPoint!.reason).not.toBe('service')
    expect(Math.abs(flight.lastPoint!.landing[0])).toBeGreaterThan(1.98)
  })
  it.each(['FOREHAND_HIGH', 'FOREHAND_SHORT', 'BACKHAND_SHORT', 'BACKHAND_FLICK'] as const)('lets the AI return a human %s serve', serve => {
    let state = gameReducer(session(), { type: 'SWING_START', playerIndex: 0, shot: serve === 'FOREHAND_SHORT' ? 'DROP' : serve === 'BACKHAND_SHORT' ? 'NET_DROP' : serve === 'BACKHAND_FLICK' ? 'SMASH' : 'CLEAR' })
    state = gameReducer(state, { type: 'SERVE', playerIndex: 0 })
    const configs = { away: getAIConfig('hard', 'placement') }
    for (let i = 0; i < 960 && state.rallyHits < 1; i++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120, aiConfigs: configs })
    expect(state.rallyHits).toBe(1)
  }, 20000)
})
