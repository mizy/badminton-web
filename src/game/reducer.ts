/** 集中状态归约器 — 所有 GameState 变更经过此函数 */

import type { InputAction } from '../input/types'
import type { GameState } from './types'
import { launchShuttlecock } from '../physics/shuttlecock'
import { processGameTick } from './tickService'
import type { TickAIConfigs } from './tickService'

/** 与 InputAction 相同，但携带 playerIndex */
export type GameAction =
  | (InputAction & { playerIndex: 0 | 1 })
  | { type: 'TICK'; dt: number; aiConfigs?: TickAIConfigs }
  | { type: 'RESET' }
  | { type: 'SET_PLAYERS'; players: GameState['players'] }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SERVE':
      // 球在空中时不能发球
      if (state.shuttle !== null) return state
      const server = state.match?.server ?? 0
      const originX = server === 0 ? -4 : 4
      const heading = server === 0 ? 90 : -90
      return {
        ...state,
        phase: 'playing',
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
      if (!state.players[action.playerIndex]) return state
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === action.playerIndex && p
            ? { ...p, movement: { ...p.movement, targetDir: { x: 0, z: 0 } } }
            : p,
        ) as [typeof state.players[0], typeof state.players[1]],
      }

    case 'TICK':
      return processGameTick(state, action.dt, action.aiConfigs)

    case 'RESET':
      return { ...state, phase: 'idle', shuttle: null, match: null }

    case 'SET_PLAYERS':
      return { ...state, players: action.players }

    default:
      return state
  }
}
