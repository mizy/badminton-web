/** 游戏状态扩展类型 — 纯逻辑 */

import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'

export type GamePhase = 'idle' | 'playing' | 'paused' | 'point_scored' | 'set_end' | 'match_end'

export interface SetScore {
  home: number
  away: number
}

export interface MatchState {
  server: 0 | 1
  currentSet: number
  sets: [SetScore, SetScore, SetScore]
  points: [number, number]
  isDeuce: boolean
  serviceSide: 'left' | 'right'
}

export interface GameState {
  phase: GamePhase
  shuttle: ShuttlecockState | null
  players: [PlayerState | null, PlayerState | null]
  match: MatchState | null
  currentPlayer: 0 | 1
  elapsed: number
}

export function createDefaultMatchState(): MatchState {
  return {
    server: 0,
    currentSet: 0,
    sets: [{ home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }],
    points: [0, 0],
    isDeuce: false,
    serviceSide: 'right',
  }
}

/** 创建完整游戏初始状态 */
export function createFullGameState(): GameState {
  return {
    phase: 'idle',
    shuttle: null,
    players: [null, null],
    match: createDefaultMatchState(),
    currentPlayer: 0,
    elapsed: 0,
  }
}
