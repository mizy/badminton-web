import { describe, expect, it } from 'vitest'
import { getAIConfig } from '../ai/difficulty'
import { createPlayer } from '../game/playerFactory'
import type { GameState } from '../game/types'
import { createAIMoveActions } from './aiMoveActions'

describe('AI move actions', () => {
  it('does not emit actions outside active play', () => {
    const state = createPlayingState()
    const configs = { away: getAIConfig('medium'), home: getAIConfig('medium') }

    expect(createAIMoveActions({ ...state, phase: 'idle' }, configs)).toEqual([])
    expect(createAIMoveActions({ ...state, shuttle: null }, configs)).toEqual([])
  })

  it('creates reducer actions for both AI players', () => {
    const configs = { away: getAIConfig('medium'), home: getAIConfig('medium') }
    const actions = createAIMoveActions(createPlayingState(), configs)

    expect(actions).toHaveLength(2)
    const playerIndexes = actions.map((action) =>
      action.type === 'MOVE' || action.type === 'STOP_MOVE' ? action.playerIndex : -1,
    )
    expect(playerIndexes).toEqual([0, 1])
    for (const action of actions) {
      expect(action.type === 'MOVE' || action.type === 'STOP_MOVE').toBe(true)
      if (action.type === 'MOVE') {
        expect(Math.hypot(action.dir.x, action.dir.z)).toBeCloseTo(1, 5)
      }
    }
  })

  it('keeps AI movement targets out of the net crowding lane', () => {
    const configs = { away: getAIConfig('medium'), home: getAIConfig('medium') }
    const actions = createAIMoveActions(createNetDropState(), configs)

    const home = actions[0]
    const away = actions[1]
    expect(home.type).toBe('MOVE')
    expect(away.type).toBe('MOVE')
    if (home.type === 'MOVE') expect(home.dir.x).toBeLessThan(0)
    if (away.type === 'MOVE') expect(away.dir.x).toBeGreaterThan(0)
  })
})

function createPlayingState(): GameState {
  return {
    currentPlayer: 0,
    elapsed: 0,
    match: null,
    phase: 'playing',
    players: [createPlayer(0), createPlayer(1)],
    shuttle: {
      pos: [-1.4, 1.4, 0.4],
      spin: [0, 0, 0],
      vel: [8, 2, 0],
    },
  }
}

function createNetDropState(): GameState {
  const home = createPlayer(0)
  const away = createPlayer(1)
  home.pos = [-0.9, 0, 0]
  away.pos = [0.9, 0, 0]

  return {
    currentPlayer: 0,
    elapsed: 0,
    match: null,
    phase: 'playing',
    players: [home, away],
    shuttle: {
      pos: [0, 1.2, 0],
      spin: [0, 0, 0],
      vel: [0, -2, 0],
    },
  }
}
