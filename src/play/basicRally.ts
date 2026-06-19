import { getAIConfig } from '../ai/difficulty'
import { decideTactical } from '../ai/tactical'
import type { AIConfig, AIDifficulty } from '../ai/types'
import { createPlayer } from '../game/playerFactory'
import { gameReducer } from '../game/reducer'
import type { GameAction } from '../game/reducer'
import { createFullGameState, type GameState } from '../game/types'
import type { ShuttlecockState } from '../physics/shuttlecock'

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
  let game = createFullGameState()
  game = gameReducer(game, {
    type: 'SET_PLAYERS',
    players: createMatchPlayers(),
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

  let game = resolveSetEnd(state.game)
  let idleSeconds = state.idleSeconds
  let pointPauseSeconds = state.pointPauseSeconds
  let stats = state.stats

  if (game.phase === 'point_scored') {
    pointPauseSeconds += stepSeconds
    stats = { ...stats, lastRallyHits: stats.hitCount }

    if (pointPauseSeconds >= options.pointPauseSeconds) {
      game = gameReducer(game, { type: 'POINT_DELAY_ELAPSED' })
      game = gameReducer(game, {
        type: 'SET_PLAYERS',
        players: createMatchPlayers(),
      })
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
    game = dispatchAIMovement(game, options.homeAI, options.awayAI)
    const previousShuttle = game.shuttle
    const nextGame = gameReducer(game, {
      type: 'TICK',
      dt: stepSeconds,
      aiConfigs: {
        away: options.awayAI,
        home: options.homeAI,
      },
    })

    events.hit = didHitShuttle(previousShuttle, nextGame.shuttle)
    events.pointEnded = game.phase === 'playing' && nextGame.phase !== 'playing'
    if (events.hit) {
      stats = { ...stats, hitCount: stats.hitCount + 1 }
    }
    if (events.pointEnded) {
      stats = { ...stats, lastRallyHits: stats.hitCount }
    }

    game = nextGame
  }

  return {
    events,
    rally: { game, idleSeconds, pointPauseSeconds, stats },
  }
}

function createMatchPlayers(): GameState['players'] {
  return [createPlayer(0), createPlayer(1)]
}

function resolveSetEnd(game: GameState): GameState {
  if (game.phase !== 'set_end') return game
  return gameReducer(game, { type: 'RESOLVE_SET_END' })
}

function dispatchAIMovement(game: GameState, homeAI: AIConfig, awayAI: AIConfig): GameState {
  if (game.phase !== 'playing' || !game.shuttle) return game
  if (!game.players[0] || !game.players[1]) return game

  let nextGame = game
  for (const playerIndex of [0, 1] as const) {
    const player = nextGame.players[playerIndex]
    const opponent = nextGame.players[playerIndex === 0 ? 1 : 0]
    if (!player || !opponent || !nextGame.shuttle) continue

    const config = playerIndex === 0 ? homeAI : awayAI
    const decision = decideTactical(player, opponent, nextGame.shuttle, config)
    const targetX = clampToPlayerHalf(decision.moveTarget[0], playerIndex)
    const dx = targetX - player.pos[0]
    const dz = decision.moveTarget[2] - player.pos[2]
    const distance = Math.sqrt(dx * dx + dz * dz)
    const action: GameAction = distance > 0.2
      ? {
          type: 'MOVE',
          playerIndex,
          dir: { x: dx / distance, z: dz / distance },
        }
      : { type: 'STOP_MOVE', playerIndex }

    nextGame = gameReducer(nextGame, action)
  }

  return nextGame
}

function clampToPlayerHalf(x: number, playerIndex: 0 | 1): number {
  return playerIndex === 0
    ? Math.min(x, -1.1)
    : Math.max(x, 1.1)
}

function didHitShuttle(
  previousShuttle: ShuttlecockState | null,
  currentShuttle: ShuttlecockState | null,
): boolean {
  if (!previousShuttle || !currentShuttle) return false

  const previousVelocity = previousShuttle.vel
  const currentVelocity = currentShuttle.vel
  const previousSpeed2 = previousVelocity[0] ** 2 + previousVelocity[1] ** 2 + previousVelocity[2] ** 2
  const currentSpeed2 = currentVelocity[0] ** 2 + currentVelocity[1] ** 2 + currentVelocity[2] ** 2
  if (previousSpeed2 <= 0.5 || currentSpeed2 <= 0.5) return false

  const dot =
    previousVelocity[0] * currentVelocity[0] +
    previousVelocity[1] * currentVelocity[1] +
    previousVelocity[2] * currentVelocity[2]
  const previousSpeed = Math.sqrt(previousSpeed2)
  const currentSpeed = Math.sqrt(currentSpeed2)

  return (
    dot < -previousSpeed * currentSpeed * 0.2 ||
    currentSpeed > previousSpeed * 3 ||
    currentSpeed < previousSpeed * 0.3
  )
}
