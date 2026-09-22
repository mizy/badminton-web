import { getAIConfig } from '../ai/difficulty'
import type { AIConfig, AIDifficulty } from '../ai/types'
import { createPlayer } from '../game/playerFactory'
import { gameReducer } from '../game/reducer'
import { createFullGameState, type GameState } from '../game/types'

const DEFAULT_AUTO_SERVE_DELAY_SECONDS = 0.15
const DEFAULT_POINT_PAUSE_SECONDS = 0.8

export interface BasicRallyOptions {
  autoServeDelaySeconds: number
  awayAI: AIConfig
  homeAI: AIConfig
  pointPauseSeconds: number
}

export interface BasicRallyStats {
  hitCount: number
  lastRallyHits: number
  serveCount: number
}

export interface BasicRallyState {
  game: GameState
  idleSeconds: number
  pointPauseSeconds: number
  stats: BasicRallyStats
}

export interface BasicRallyEvents {
  hit: boolean
  pointEnded: boolean
  restarted: boolean
  served: boolean
}

export interface BasicRallyStep {
  events: BasicRallyEvents
  rally: BasicRallyState
}

export function createBasicRallyOptions(difficulty: AIDifficulty = 'medium'): BasicRallyOptions {
  return {
    autoServeDelaySeconds: DEFAULT_AUTO_SERVE_DELAY_SECONDS,
    awayAI: getAIConfig(difficulty),
    homeAI: getAIConfig(difficulty),
    pointPauseSeconds: DEFAULT_POINT_PAUSE_SECONDS,
  }
}

export function createBasicRallyState(): BasicRallyState {
  const game = gameReducer(createFullGameState(), {
    type: 'START_SESSION',
    mode: 'match',
    players: [createPlayer(0), createPlayer(1)],
    controls: ['ai', 'ai'],
  })

  return {
    game,
    idleSeconds: 0,
    pointPauseSeconds: 0,
    stats: {
      hitCount: 0,
      lastRallyHits: 0,
      serveCount: 0,
    },
  }
}

export function stepBasicRally(
  state: BasicRallyState,
  dt: number,
  options: BasicRallyOptions,
): BasicRallyStep {
  const events: BasicRallyEvents = {
    hit: false,
    pointEnded: false,
    restarted: false,
    served: false,
  }
  const stepSeconds = Math.max(0, Math.min(dt, 1 / 30))

  if (state.game.phase === 'match_end') {
    return {
      events: { ...events, restarted: true },
      rally: createBasicRallyState(),
    }
  }

  let game = state.game
  let idleSeconds = state.idleSeconds
  let pointPauseSeconds = state.pointPauseSeconds
  let stats = { ...state.stats, hitCount: game.rallyHits }

  if (game.phase === 'set_end') {
    stats.lastRallyHits = game.rallyHits
    game = gameReducer(game, { type: 'RESOLVE_SET_END' })
    idleSeconds = 0
    pointPauseSeconds = 0
  }

  // Demo delays are local: only tick during play so the main game's timers
  // cannot shorten the story's configured serve/point pauses.
  if (game.phase === 'point_scored') {
    pointPauseSeconds += stepSeconds
    stats.lastRallyHits = game.rallyHits

    if (pointPauseSeconds >= options.pointPauseSeconds) {
      game = gameReducer(game, { type: 'POINT_DELAY_ELAPSED' })
      pointPauseSeconds = 0
      idleSeconds = 0
    }

    return {
      events,
      rally: { game, idleSeconds, pointPauseSeconds, stats },
    }
  }

  if (game.phase === 'idle' && !game.shuttle) {
    idleSeconds += stepSeconds
    if (idleSeconds >= options.autoServeDelaySeconds) {
      const nextGame = gameReducer(game, {
        type: 'SERVE',
        playerIndex: game.match?.server ?? 0,
      })

      if (nextGame.shuttle) {
        events.served = true
        game = nextGame
        idleSeconds = 0
        pointPauseSeconds = 0
        stats = {
          ...stats,
          hitCount: 0,
          serveCount: stats.serveCount + 1,
        }
      }
    }
  }

  if (game.phase === 'playing') {
    const nextGame = gameReducer(game, {
      type: 'TICK',
      dt: stepSeconds,
      aiConfigs: {
        away: options.awayAI,
        home: options.homeAI,
      },
    })

    events.hit = nextGame.rallyHits > game.rallyHits
    events.pointEnded = nextGame.phase !== 'playing'
    stats.hitCount = nextGame.rallyHits
    if (events.pointEnded) {
      stats.lastRallyHits = nextGame.rallyHits
    }

    game = nextGame
  }

  return {
    events,
    rally: { game, idleSeconds, pointPauseSeconds, stats },
  }
}
