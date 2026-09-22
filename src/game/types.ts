import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'

export type GamePhase = 'idle' | 'playing' | 'paused' | 'point_scored' | 'set_end' | 'match_end'
export type GameMode = 'training' | 'match'
export type PointReason = 'in' | 'out' | 'net' | 'service'

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
  decidingEndsChanged: boolean
}

export interface GameState {
  phase: GamePhase
  pausedPhase: Exclude<GamePhase, 'paused'> | null
  phaseTime: number
  mode: GameMode
  controls: ['human' | 'ai', 'human' | 'ai']
  shuttle: ShuttlecockState | null
  players: [PlayerState | null, PlayerState | null]
  match: MatchState | null
  currentPlayer: 0 | 1
  elapsed: number
  lastHitter: 0 | 1 | null
  lastHitAt: number
  rallyId: number
  rallyHits: number
  serveInFlight: boolean
  serviceCourtZ: number
  netTouched: boolean
  lastPoint: { winner: 0 | 1; reason: PointReason; landing: [number, number, number] } | null
  training: { bestRally: number; returns: number; shots: ShotType[]; moved: number }
}

export function createDefaultMatchState(): MatchState {
  return {
    server: 0,
    currentSet: 0,
    sets: [{ home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }],
    points: [0, 0],
    isDeuce: false,
    serviceSide: 'right',
    decidingEndsChanged: false,
  }
}

export function createFullGameState(): GameState {
  return {
    phase: 'idle',
    pausedPhase: null,
    phaseTime: 0,
    mode: 'match',
    controls: ['human', 'ai'],
    shuttle: null,
    players: [null, null],
    match: createDefaultMatchState(),
    currentPlayer: 0,
    elapsed: 0,
    lastHitter: null,
    lastHitAt: 0,
    rallyId: 0,
    rallyHits: 0,
    serveInFlight: false,
    serviceCourtZ: 0,
    netTouched: false,
    lastPoint: null,
    training: { bestRally: 0, returns: 0, shots: [], moved: 0 },
  }
}
