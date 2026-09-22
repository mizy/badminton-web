import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { getAIConfig } from '../ai/difficulty'
import { SERVE_BY_SHOT } from '../character/serve'

function session() {
  return gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)] })
}

describe('serve selection and return', () => {
  it('serves directly with the serve keys, no Space confirmation needed', () => {
    let state = session()
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'SMASH' })
    expect(state.phase).toBe('playing')
    expect(state.players[0]!.serveSelection).toBe(SERVE_BY_SHOT.SMASH)
    expect(state.shuttle).not.toBeNull()
    expect(state.shuttle!.vel[1]).toBeGreaterThan(0)
  })
  it('keeps short serves inside the short-service rule', () => {
    let state = gameReducer(session(), { type: 'SWING_START', playerIndex: 0, shot: 'NET_DROP' })
    let flight = state
    for (let i = 0; i < 600 && flight.phase === 'playing'; i++) flight = gameReducer(flight, { type: 'TICK', dt: 1 / 120 })
    expect(flight.lastPoint).not.toBeNull()
    expect(flight.lastPoint!.reason).not.toBe('service')
    expect(Math.abs(flight.lastPoint!.landing[0])).toBeGreaterThan(1.98)
  })
  it.each(['FOREHAND_HIGH', 'FOREHAND_SHORT', 'BACKHAND_SHORT', 'BACKHAND_FLICK'] as const)('lets the AI return a human %s serve', serve => {
    let state = session()
    const shot = serve === 'FOREHAND_SHORT' ? 'DROP' : serve === 'BACKHAND_SHORT' ? 'NET_DROP' : serve === 'BACKHAND_FLICK' ? 'SMASH' : 'CLEAR'
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot })
    const configs = { away: getAIConfig('hard', 'placement') }
    for (let i = 0; i < 960 && state.rallyHits < 1; i++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120, aiConfigs: configs })
    expect(state.rallyHits).toBe(1)
  }, 20000)
})
