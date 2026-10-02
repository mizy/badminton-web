import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { CONTACT_WINDOW_SECONDS } from '../character/stroke'

function incoming() {
  const state = gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'training', players: [createPlayer(0), createPlayer(1)] })
  return { ...state, phase: 'playing' as const, lastHitter: 1 as const,
    players: [{ ...state.players[0]!, pos: [-3, 0, 0] as [number, number, number] }, state.players[1]] as typeof state.players,
    shuttle: { pos: [-1, 4.2, 0.12] as [number, number, number], vel: [-3, -0.2, 0] as [number, number, number], spin: [0, 0, 0] as [number, number, number] } }
}

describe('buffered human shots', () => {
  it('charges a smash while held and hits with a single release', () => {
    let state = gameReducer(incoming(), { type: 'SWING_START', shot: 'SMASH', playerIndex: 0 })
    state = gameReducer(state, { type: 'TICK', dt: 0.6 })
    expect(state.players[0]!.swing.phase).toBe('preparing')
    expect(state.rallyHits).toBe(0)
    state = { ...state, shuttle: { pos: [-2.45, 2.3, 0.12], vel: [-2, -1, 0], spin: [0, 0, 0] } }
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
    expect(state.players[0]!.swing.phase).toBe('swinging')
    expect(state.players[0]!.swing.charge01).toBe(1)
    state = gameReducer(state, { type: 'TICK', dt: 1 / 120 })
    expect(state.lastHitter).toBe(0)
    expect(state.rallyHits).toBe(1)
    expect(state.players[0]!.feedback).toContain('杀球')
    expect(gameReducer(state, { type: 'TICK', dt: 0.1 }).rallyHits).toBe(1)
  })

  it('returns a high ball prepared before the former swing window, then strikes only once', () => {
    let state = gameReducer(incoming(), { type: 'SWING_START', shot: 'CLEAR', playerIndex: 0 })
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
    expect(state.players[0]!.swing.phase).toBe('queued')
    for (let frame = 0; frame < 120 && state.lastHitter !== 0; frame++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120 })
    expect(state.lastHitAt).toBeGreaterThan(CONTACT_WINDOW_SECONDS)
    expect(state.lastHitter).toBe(0)
    expect(state.players[0]!.swing.shot).toBe('CLEAR')
    expect(state.players[0]!.contactQuality).toBeGreaterThan(0.3)
    expect(state.rallyHits).toBe(1)
    expect(gameReducer(state, { type: 'TICK', dt: 0.1 }).rallyHits).toBe(1)
  })

  it('lets the player keep moving while preparing and preserves manual movement over assistance', () => {
    let state = gameReducer(incoming(), { type: 'MOVE', playerIndex: 0, dir: { x: 0, z: -1 } })
    state = gameReducer(state, { type: 'SWING_START', shot: 'SMASH', playerIndex: 0 })
    state = gameReducer(state, { type: 'TICK', dt: 0.1 })
    expect(state.players[0]!.pos[2]).toBeLessThan(-0.05)
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
    state = gameReducer(state, { type: 'TICK', dt: 0.1 })
    expect(state.players[0]!.movement.targetDir).toEqual({ x: 0, z: -1 })
    expect(state.players[0]!.pos[2]).toBeLessThan(-0.2)
  })

  it('cannot hit or auto-run across the court to an unreachable ball', () => {
    let state = incoming()
    state.players[0]!.pos = [-6.5, 0, -2.4]
    state = gameReducer(state, { type: 'SWING_START', shot: 'SMASH', playerIndex: 0 }) as typeof state
    state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 }) as typeof state
    const start = [...state.players[0]!.pos]
    for (let frame = 0; frame < 120; frame++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120 }) as typeof state
    expect(state.players[0]!.pos).toEqual(start)
    expect(state.rallyHits).toBe(0)
    expect(state.players[0]!.swing.phase).toBe('ready')
  })
})
