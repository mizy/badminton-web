import * as THREE from 'three'
import type { AIConfig } from '../ai/types'
import { createPlayer } from '../game/playerFactory'
import { gameReducer, type GameAction } from '../game/reducer'
import type { GameState } from '../game/types'
import type { Recorder } from '../recording/recorder'
import { updateCamera } from '../render/camera'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import type { GameHUD } from '../render/hud'
import { updatePlayerMesh } from '../render/playerMesh'
import { syncShuttlecockMesh } from '../render/shuttlecockMesh'
import type { TrailSystem } from '../render/trajectory'
import { LOG_INTERVAL_MS, RECORD_DURATION_MS, type PlayViewState } from './viewState'

export interface PlaySceneObjects {
  awayGroundMarker: THREE.Group
  awayMesh: THREE.Group
  camera: THREE.PerspectiveCamera
  homeGroundMarker: THREE.Group
  homeMesh: THREE.Group
  scene: THREE.Scene
  shuttleGroup: THREE.Group
  trail: TrailSystem
}

export interface PlayFrameDeps {
  demo: PlayAutomation
  hud: GameHUD
  objects: PlaySceneObjects
  onAutoStopRecording: () => void
  recorder: Recorder
}

export interface PlayAutomation {
  getActions: (state: GameState) => GameAction[]
  getAIConfigs: () => { home: AIConfig; away: AIConfig }
}

export function stepFrame(
  now: number,
  gameState: GameState,
  viewState: PlayViewState,
  deps: PlayFrameDeps,
): GameState {
  const dt = Math.min((now - viewState.lastTime) / 1000, 1 / 30)
  viewState.lastTime = now

  logFrameStatus(now, gameState, viewState)
  gameState = updatePointDelay(now, gameState, viewState)
  gameState = updateSetAndMatchFlow(now, gameState, viewState, deps.hud)
  gameState = dispatchDemoActions(gameState, deps.demo)
  gameState = tryAutoServe(gameState, viewState, deps.objects.trail)
  gameState = enforceServeTimeout(now, gameState, viewState, deps.objects.trail)
  gameState = tickGame(gameState, viewState, dt, deps)
  stopRecordingWhenExpired(now, viewState, deps)

  return gameState
}

export function syncFrameView(
  now: number,
  gameState: GameState,
  viewState: PlayViewState,
  hud: GameHUD,
  objects: PlaySceneObjects,
): void {
  if (gameState.shuttle) {
    syncShuttlecockMesh(objects.shuttleGroup, gameState.shuttle.pos, gameState.shuttle.vel)
    objects.shuttleGroup.visible = true
    objects.trail.update(gameState.shuttle.pos)
  } else {
    objects.shuttleGroup.visible = false
  }

  if (gameState.players[0]) {
    updatePlayerMesh(objects.homeMesh, gameState.players[0].pos, gameState.players[0].facing)
    objects.homeGroundMarker.position.set(gameState.players[0].pos[0], 0.02, gameState.players[0].pos[2])
  }

  if (gameState.players[1]) {
    updatePlayerMesh(objects.awayMesh, gameState.players[1].pos, gameState.players[1].facing)
    objects.awayGroundMarker.position.set(gameState.players[1].pos[0], 0.02, gameState.players[1].pos[2])
  }

  if (gameState.match) {
    const { currentSet, isDeuce, points, sets } = gameState.match
    const setText = sets
      .slice(0, currentSet + 1)
      .map((set, index) => `S${index + 1}  ${set.home}-${set.away}`)
      .join('  |  ')
    const rally = gameState.shuttle ? viewState.rallyHits : Math.max(viewState.lastRallyHits, 0)
    hud.updateScore(points[0], points[1], setText, rally, isDeuce)
  } else {
    hud.resetScore()
  }

  hud.sync()
  updateCamera(objects.camera, gameState.players[0]?.pos)
  updateEffects(now, objects.scene)
}

function createMatchPlayers(): GameState['players'] {
  return [createPlayer(0), createPlayer(1)]
}

function dispatchDemoActions(gameState: GameState, demo: PlayAutomation): GameState {
  for (const action of demo.getActions(gameState)) {
    gameState = gameReducer(gameState, action)
  }

  return gameState
}

function enforceServeTimeout(
  now: number,
  gameState: GameState,
  viewState: PlayViewState,
  trail: TrailSystem,
): GameState {
  if (gameState.phase === 'idle' && !gameState.shuttle && now - viewState.idleSince > 3000) {
    const nextState = gameReducer(gameState, {
      type: 'SERVE',
      playerIndex: gameState.match?.server ?? 0,
    })

    if (nextState.shuttle) {
      trail.reset()
      viewState.rallyHits = 0
      gameState = nextState
    }

    viewState.idleSince = now
    console.log('[safety] force-serve after idle timeout')
    return gameState
  }

  if (gameState.shuttle) {
    viewState.idleSince = now
  }

  return gameState
}

function logFrameStatus(now: number, gameState: GameState, viewState: PlayViewState): void {
  if (now - viewState.lastLogTime <= LOG_INTERVAL_MS) return

  viewState.lastLogTime = now
  const shuttle = gameState.shuttle
  const p0 = gameState.players[0]
  const p1 = gameState.players[1]

  console.log(
    `[status] phase=${gameState.phase} ` +
    `shuttle=${shuttle ? `(${shuttle.pos[0].toFixed(1)},${shuttle.pos[1].toFixed(1)},${shuttle.pos[2].toFixed(1)})` : 'null'} ` +
    `p0=(${p0?.pos[0].toFixed(1)},${p0?.pos[2].toFixed(1)}) ` +
    `p1=(${p1?.pos[0].toFixed(1)},${p1?.pos[2].toFixed(1)}) ` +
    `rally=${viewState.rallyHits} serves=${viewState.phaseChangeCount}`,
  )
}

function stopRecordingWhenExpired(now: number, viewState: PlayViewState, deps: PlayFrameDeps): void {
  if (!deps.recorder.isRecording()) return
  if (viewState.recordingStartTime <= 0) return
  if (now - viewState.recordingStartTime <= RECORD_DURATION_MS) return
  deps.onAutoStopRecording()
}

function tickGame(
  gameState: GameState,
  viewState: PlayViewState,
  dt: number,
  deps: PlayFrameDeps,
): GameState {
  const previousShuttle = gameState.shuttle
  gameState = gameReducer(gameState, {
    type: 'TICK',
    dt,
    aiConfigs: deps.demo.getAIConfigs(),
  })

  if (!gameState.shuttle || !previousShuttle) return gameState

  const previousVelocity = previousShuttle.vel
  const currentVelocity = gameState.shuttle.vel
  const previousSpeed2 = previousVelocity[0] ** 2 + previousVelocity[1] ** 2 + previousVelocity[2] ** 2
  const currentSpeed2 = currentVelocity[0] ** 2 + currentVelocity[1] ** 2 + currentVelocity[2] ** 2
  if (previousSpeed2 <= 0.5 || currentSpeed2 <= 0.5) return gameState

  const dot = previousVelocity[0] * currentVelocity[0] +
    previousVelocity[1] * currentVelocity[1] +
    previousVelocity[2] * currentVelocity[2]
  const previousSpeed = Math.sqrt(previousSpeed2)
  const currentSpeed = Math.sqrt(currentSpeed2)
  const reversed = dot < -previousSpeed * currentSpeed * 0.2
  const accelerated = currentSpeed > previousSpeed * 3
  const slowed = currentSpeed < previousSpeed * 0.3
  if (!reversed && !accelerated && !slowed) return gameState

  viewState.rallyHits++
  spawnImpactEffect(gameState.shuttle.pos, Math.min(currentSpeed / 40, 1))
  return gameState
}

function tryAutoServe(
  gameState: GameState,
  viewState: PlayViewState,
  trail: TrailSystem,
): GameState {
  if (gameState.phase !== 'idle' || gameState.shuttle) {
    signalReady(viewState)
    return gameState
  }

  const nextState = gameReducer(gameState, {
    type: 'SERVE',
    playerIndex: gameState.match?.server ?? 0,
  })

  if (!nextState.shuttle) {
    signalReady(viewState)
    return gameState
  }

  trail.reset()
  viewState.rallyHits = 0
  viewState.phaseChangeCount++
  console.log(
    `[game] serve #${viewState.phaseChangeCount} - server=${nextState.match?.server ?? 0}, ` +
    `shuttle=(${nextState.shuttle.pos[0].toFixed(1)}, ${nextState.shuttle.pos[1].toFixed(1)}, ` +
    `${nextState.shuttle.pos[2].toFixed(1)}) vel=(${nextState.shuttle.vel[0].toFixed(1)}, ` +
    `${nextState.shuttle.vel[1].toFixed(1)}, ${nextState.shuttle.vel[2].toFixed(1)})`,
  )
  signalReady(viewState)
  return nextState
}

function signalReady(viewState: PlayViewState): void {
  if (viewState.gameReadySignaled) return
  viewState.gameReadySignaled = true
  ;(window as any).__badminton_game_ready__ = true
}

function updatePointDelay(
  now: number,
  gameState: GameState,
  viewState: PlayViewState,
): GameState {
  if (gameState.phase === 'point_scored') {
    if (viewState.pointScoredAt === 0) {
      viewState.pointScoredAt = now
      viewState.lastRallyHits = viewState.rallyHits
      if (viewState.phaseChangeCount % 5 === 0) {
        console.log(`[game] point_scored — match pts=${gameState.match?.points[0]}:${gameState.match?.points[1]}`)
      }
      return gameState
    }

    if (now - viewState.pointScoredAt >= 800) {
      viewState.pointScoredAt = 0
      viewState.idleSince = now
      return gameReducer(gameState, { type: 'POINT_DELAY_ELAPSED' })
    }

    return gameState
  }

  if (gameState.phase !== 'match_end') {
    viewState.pointScoredAt = 0
  }

  return gameState
}

function updateSetAndMatchFlow(
  now: number,
  gameState: GameState,
  viewState: PlayViewState,
  hud: GameHUD,
): GameState {
  if (gameState.phase === 'set_end' && gameState.match) {
    gameState = gameReducer(gameState, { type: 'RESOLVE_SET_END' })
    if (gameState.phase === 'match_end') {
      viewState.pointScoredAt = now
      viewState.lastRallyHits = viewState.rallyHits
    } else if (gameState.phase === 'idle') {
      viewState.rallyHits = 0
      viewState.lastRallyHits = 0
    }
  }

  if (gameState.phase === 'match_end' && viewState.pointScoredAt > 0 && now - viewState.pointScoredAt >= 4000) {
    hud.setStatusText('🔄 新比赛开始!')
    viewState.pointScoredAt = 0
    viewState.rallyHits = 0
    viewState.lastRallyHits = 0
    return gameReducer(gameState, {
      type: 'RESTART_MATCH',
      players: createMatchPlayers(),
    })
  }

  return gameState
}
