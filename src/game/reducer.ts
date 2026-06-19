/** 集中状态归约器 — 所有 GameState 变更经过此函数 */

import type { InputAction } from '../input/types'
import { handleSetEnd } from './match'
import { createFullGameState, type GameState } from './types'
import { launchShuttlecock } from '../physics/shuttlecock'
import { processGameTick } from './tickService'
import type { TickAIConfigs } from './tickService'

/** 与 InputAction 相同，但携带 playerIndex */
export type PlayerGameAction = InputAction & { playerIndex: 0 | 1 }

export type GameAction =
  | PlayerGameAction
  | { type: 'TICK'; dt: number; aiConfigs?: TickAIConfigs }
  | { type: 'RESET' }
  | { type: 'SET_PLAYERS'; players: GameState['players'] }
  | { type: 'POINT_DELAY_ELAPSED' }
  | { type: 'RESOLVE_SET_END' }
  | { type: 'RESTART_MATCH'; players: GameState['players'] }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SERVE':
      if (state.phase !== 'idle' || state.shuttle !== null) return state
      const server = state.match?.server ?? 0
      const originX = server === 0 ? -0.5 : 0.5
      const heading = server === 0 ? 90 : -90
      return {
        ...state,
        phase: 'playing',
        currentPlayer: server,
        // 平快发球（20 m/s, 22°仰角）：保持球在碰撞检测范围内(y<4)，
        // 让AI能够持续拦截，形成多回合对打
        shuttle: launchShuttlecock([originX, 1.5, 0], 20, 22, heading),
      }

    case 'MOVE':
      if (state.phase !== 'playing') return state
      if (!state.players[action.playerIndex]) return state
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === action.playerIndex && p
            ? { ...p, movement: { ...p.movement, targetDir: action.dir } }
            : p,
        ) as [typeof state.players[0], typeof state.players[1]],
      }

    case 'STOP_MOVE':
      if (state.phase !== 'playing') return state
      if (!state.players[action.playerIndex]) return state
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === action.playerIndex && p
            ? { ...p, movement: { ...p.movement, targetDir: { x: 0, z: 0 } } }
            : p,
        ) as [typeof state.players[0], typeof state.players[1]],
      }

    case 'SWING_START':
      if (state.phase !== 'playing') return state
      if (!state.players[action.playerIndex]) return state
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === action.playerIndex && p
            ? { ...p, wantsToSwing: true }
            : p,
        ) as [typeof state.players[0], typeof state.players[1]],
      }

    case 'SWING_RELEASE':
      if (state.phase !== 'playing') return state
      if (!state.players[action.playerIndex]) return state
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === action.playerIndex && p
            ? { ...p, wantsToSwing: false }
            : p,
        ) as [typeof state.players[0], typeof state.players[1]],
      }

    case 'PAUSE':
      if (state.phase === 'playing') return { ...state, phase: 'paused' }
      if (state.phase === 'paused') return { ...state, phase: 'playing' }
      return state

    case 'TICK':
      return processGameTick(state, action.dt, action.aiConfigs)

    case 'RESET':
      return createFullGameState()

    case 'SET_PLAYERS':
      return { ...state, players: action.players }

    case 'POINT_DELAY_ELAPSED':
      if (state.phase !== 'point_scored') return state
      return { ...state, phase: 'idle' }

    case 'RESOLVE_SET_END':
      if (state.phase !== 'set_end' || !state.match) return state
      const nextMatch = handleSetEnd(state.match)
      const homeSets = nextMatch.sets.filter((set) => set.home > set.away).length
      const awaySets = nextMatch.sets.filter((set) => set.away > set.home).length
      return {
        ...state,
        match: nextMatch,
        shuttle: null,
        phase: homeSets >= 2 || awaySets >= 2 ? 'match_end' : 'idle',
      }

    case 'RESTART_MATCH':
      return {
        ...createFullGameState(),
        players: action.players,
      }

    default:
      return state
  }
}
