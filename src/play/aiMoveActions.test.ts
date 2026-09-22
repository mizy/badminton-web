import { describe, expect, it } from 'vitest'
import { getAIConfig } from '../ai/difficulty'
import { decideTactical } from '../ai/tactical'
import { createPlayer } from '../game/playerFactory'
import { createFullGameState, type GameState } from '../game/types'
import { createAIMoveActions } from './aiMoveActions'

const config = getAIConfig('medium')

describe('AI move actions', () => {
  it('does not emit actions outside active play or with missing players', () => {
    const state = createPlayingState()
    const configs = { away: config, home: config }
    expect(createAIMoveActions({ ...state, phase: 'idle' }, configs)).toEqual([])
    expect(createAIMoveActions({ ...state, phase: 'paused' }, configs)).toEqual([])
    expect(createAIMoveActions({ ...state, shuttle: null }, configs)).toEqual([])
    expect(createAIMoveActions({ ...state, players: [null, state.players[1]] }, configs)).toEqual([])
    expect(createAIMoveActions(state, {})).toEqual([])
  })

  it('creates only MOVE/STOP_MOVE actions for both explicitly configured AI players', () => {
    const actions = createAIMoveActions(createPlayingState(), { away: config, home: config })
    expect(actions).toHaveLength(2)
    const playerIndexes = actions.map((action) =>
      action.type === 'MOVE' || action.type === 'STOP_MOVE' ? action.playerIndex : -1,
    )
    expect(playerIndexes).toEqual([0, 1])
    for (const action of actions) {
      expect(['MOVE', 'STOP_MOVE']).toContain(action.type)
      if (action.type === 'MOVE') expect(Math.hypot(action.dir.x, action.dir.z)).toBeCloseTo(1, 5)
    }
  })

  it('does not control human 0 when only away AI 1 is configured', () => {
    const state = createPlayingState()
    const before = structuredClone(state)
    const actions = createAIMoveActions(state, { away: config })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ playerIndex: 1 })
    expect(state).toEqual(before)
    expect(createAIMoveActions(state, { home: config })).toHaveLength(1)
    expect(createAIMoveActions(state, { home: config })[0]).toMatchObject({ playerIndex: 0 })
  })

  it.each([0, 1] as const)('follows player.side, not identity, after away swaps to side %s', (side) => {
    const state = createPlayingState()
    state.players = [createPlayer(side === 0 ? 1 : 0), createPlayer(side)]
    const player = state.players[1]!
    const opponent = state.players[0]!
    const sign = side === 0 ? -1 : 1
    player.pos = [sign * 0.8, 0, 1]
    state.shuttle = { pos: [sign * 0.4, 4.3, 0.6], vel: [sign * 4, -1, 0], spin: [0, 0, 0] }
    const decision = decideTactical(player, opponent, state.shuttle, config)
    const [action] = createAIMoveActions(state, { away: config })
    expect(action).toMatchObject({ type: 'MOVE', playerIndex: 1 })
    if (action.type === 'MOVE') {
      const dx = decision.moveTarget[0] - player.pos[0]
      const dz = decision.moveTarget[2] - player.pos[2]
      expect(action.dir.x).toBeCloseTo(dx / Math.hypot(dx, dz), 8)
      expect(action.dir.z).toBeCloseTo(dz / Math.hypot(dx, dz), 8)
      expect(action.dir.x * sign).toBeGreaterThan(0)
    }
  })

  it('does not impose a 1.1m identity-based net barrier on an interception', () => {
    const state = createPlayingState()
    state.players = [createPlayer(1), createPlayer(0)]
    state.players[1]!.pos = [-1.3, 0, 0]
    state.shuttle = { pos: [-0.2, 0.9, 0], vel: [-0.1, -0.5, 0], spin: [0, 0, 0] }
    const [action] = createAIMoveActions(state, { away: config })
    expect(action.type).toBe('MOVE')
    if (action.type === 'MOVE') expect(action.dir.x).toBeGreaterThan(0)
  })

  it('stops a configured AI at its own recovery position', () => {
    const state = createPlayingState()
    state.players = [createPlayer(1), createPlayer(0)]
    state.players[1]!.pos = [-3.35, 0, 0]
    state.shuttle = { pos: [2, 2, 0], vel: [8, 0, 0], spin: [0, 0, 0] }
    expect(createAIMoveActions(state, { away: config })).toEqual([{ type: 'STOP_MOVE', playerIndex: 1 }])
  })
})

function createPlayingState(): GameState {
  return {
    ...createFullGameState(),
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
