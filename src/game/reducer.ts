import type { InputAction } from '../input/types'
import { handleSetEnd, SHORT_SERVICE_LINE, SINGLES_HALF_WIDTH } from './match'
import { createFullGameState, type GameMode, type GameState } from './types'
import { processGameTick, type TickAIConfigs } from './tickService'
import { beginSwing, releaseSwing } from '../character/stroke'
import { SERVE_BY_SHOT, solveServe } from '../character/serve'
import { beginBodyAction } from '../character/body'
import { createPlayer } from './playerFactory'
import { resolveContactGrip } from '../character/contact'
import { getShuttleCorkCenter } from '../character/racketKinematics'

export type PlayerGameAction = InputAction & { playerIndex: 0 | 1 }

export type GameAction =
  | PlayerGameAction
  | { type: 'TICK'; dt: number; aiConfigs?: TickAIConfigs }
  | { type: 'RESET' }
  | { type: 'SET_PLAYERS'; players: GameState['players'] }
  | { type: 'START_SESSION'; mode: GameMode; players: GameState['players']; controls?: GameState['controls'] }
  | { type: 'POINT_DELAY_ELAPSED' }
  | { type: 'RESOLVE_SET_END' }
  | { type: 'RESTART_MATCH'; players: GameState['players'] }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SERVE':
      return serveFrom(state, action.playerIndex)
    case 'MOVE': {
      if (state.phase !== 'playing' && state.phase !== 'idle') return state
      // 击球即制动：引拍与挥拍期间 WASD 只作落点采样，不再驱动移动。
      if (state.phase === 'playing') {
        const swing = state.players[action.playerIndex]?.swing.phase
        if (swing === 'preparing' || swing === 'swinging') return state
      }
      return updatePlayer(state, action.playerIndex, p => ({ ...p, movement: { ...p.movement, targetDir: action.dir } }))
    }
    case 'STOP_MOVE':
      return updatePlayer(state, action.playerIndex, p => ({ ...p, movement: { ...p.movement, targetDir: { x: 0, z: 0 } } }))
    case 'SELECT_SHOT':
      return updatePlayer(state, action.playerIndex, p => ({ ...p, selectedShot: action.shot }))
    case 'AIM':
      return updatePlayer(state, action.playerIndex, p => ({ ...p, aim: { ...action.aim } }))
    case 'SERVE_OR_JUMP':
      return gameReducer(state, { type: state.phase === 'idle' ? 'SERVE' : 'JUMP', playerIndex: action.playerIndex })
    case 'JUMP':
    case 'SCISSOR_STEP':
      if (state.phase !== 'playing') return state
      return updatePlayer(state, action.playerIndex, p => beginBodyAction(p, action.type === 'JUMP' ? 'jump' : 'scissor'))
    case 'SWING_START': {
      if (state.phase !== 'playing' && state.phase !== 'idle') return state
      const selected = updatePlayer(state, action.playerIndex, p => {
        if (p.swing.phase !== 'ready') return p
        const contact = state.shuttle ? getShuttleCorkCenter(state.shuttle.pos, state.shuttle.vel) : null
        return {
          ...p,
          grip: contact ? resolveContactGrip(p.pos, p.side, contact) : p.grip,
          selectedShot: action.shot ?? p.selectedShot,
          aim: action.aim ?? p.aim,
          serveSelection: state.phase === 'idle' && action.shot
            ? SERVE_BY_SHOT[action.shot] ?? p.serveSelection
            : p.serveSelection,
        }
      })
      // 等待发球时，发球键（J/K/I/L）即选择并直接发出该种发球。
      if (state.phase === 'idle') return serveFrom(selected, action.playerIndex)
      return updatePlayer(selected, action.playerIndex, p => {
        if (p.swing.phase !== 'ready') return p
        const winding = beginSwing(p, action.holdGrace)
        return {
          ...winding,
          movement: { ...winding.movement, targetDir: { x: 0, z: 0 } },
          swing: { ...winding.swing, slice: action.slice ?? false },
        }
      })
    }
    case 'SWING_SELECT':
      // 触屏击球盘在按住拖动时改选本次挥拍：只在蓄力阶段生效，不重开计时、不改发球选择。
      return updatePlayer(state, action.playerIndex, p => p.swing.phase !== 'preparing' ? p : ({
        ...p,
        selectedShot: action.shot,
        aim: { ...action.aim },
        swing: { ...p.swing, shot: action.shot, aim: { ...action.aim } },
      }))
    case 'SWING_RELEASE':
      return updatePlayer(state, action.playerIndex, p => releaseSwing(p, action.minimumCharge))
    case 'PAUSE':
      if (state.phase === 'match_end' || state.phase === 'set_end') return state
      if (state.phase === 'paused') return { ...state, phase: state.pausedPhase ?? 'idle', pausedPhase: null }
      return {
        ...state, phase: 'paused', pausedPhase: state.phase,
        players: state.players.map(p => p && ({ ...p, movement: { ...p.movement, targetDir: { x: 0, z: 0 } } })) as GameState['players'],
      }
    case 'TICK': {
      if (!Number.isFinite(action.dt) || action.dt <= 0 || state.phase === 'paused'
        || state.phase === 'match_end' || state.phase === 'set_end') return state
      const next = processGameTick(state, action.dt, action.aiConfigs)
      if (next.phase === 'point_scored' && next.phaseTime >= 1.1) return gameReducer(next, { type: 'POINT_DELAY_ELAPSED' })
      const server = next.mode === 'training' ? 0 : next.match?.server ?? 0
      if (next.phase === 'idle' && next.controls[server] === 'ai' && next.phaseTime >= 0.9) {
        return gameReducer(next, { type: 'SERVE', playerIndex: server })
      }
      return next
    }
    case 'RESET':
      return positionForService({ ...createFullGameState(), mode: state.mode, controls: state.controls, players: state.players.map(p => p && ({ ...createPlayer(p.side), loadout: p.loadout })) as GameState['players'] })
    case 'SET_PLAYERS':
      return { ...state, players: action.players }
    case 'START_SESSION':
      return positionForService({ ...createFullGameState(), mode: action.mode, controls: action.controls ?? ['human', 'ai'], players: action.players })
    case 'POINT_DELAY_ELAPSED': {
      if (state.phase !== 'point_scored') return state
      let next = { ...state, phase: 'idle' as const, phaseTime: 0 }
      if (state.mode === 'match' && state.match?.currentSet === 2 && !state.match.decidingEndsChanged && Math.max(...state.match.points) >= 11) {
        next = { ...next, players: changeEnds(next.players), match: { ...state.match, decidingEndsChanged: true } }
      }
      return positionForService(next)
    }
    case 'RESOLVE_SET_END':
      if (state.phase !== 'set_end' || !state.match) return state
      return positionForService({ ...state, match: handleSetEnd(state.match), players: changeEnds(state.players), phase: 'idle', phaseTime: 0, shuttle: null })
    case 'RESTART_MATCH':
      return positionForService({ ...createFullGameState(), mode: state.mode, controls: state.controls, players: action.players })
    default:
      return state
  }
}

function updatePlayer(state: GameState, index: 0 | 1, update: (p: NonNullable<GameState['players'][0]>) => NonNullable<GameState['players'][0]>): GameState {
  if (!state.players[index]) return state
  return { ...state, players: state.players.map((p, i) => p && i === index ? update(p) : p) as GameState['players'] }
}

/** 发球共用入口：SERVE 键与等待发球时的击球键都走这里。 */
function serveFrom(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.phase !== 'idle' || state.shuttle) return state
  const server = state.mode === 'training' ? 0 : state.match?.server ?? 0
  if (playerIndex !== server) return state
  const player = state.players[server]
  if (!player) return state
  const forward = player.side === 0 ? 1 : -1
  const serviceZ = forward * (state.match?.serviceSide === 'left' ? -1 : 1)
  if (Math.abs(player.pos[0]) < SHORT_SERVICE_LINE || Math.abs(player.pos[0]) > 6.7
    || player.pos[2] * serviceZ <= 0 || Math.abs(player.pos[2]) > SINGLES_HALF_WIDTH) {
    return updatePlayer(state, server, p => ({ ...p, feedback: '发球：请站在本方高亮发球区内' }))
  }
  const origin: [number, number, number] = [player.pos[0] + forward * 0.35, 1.1, player.pos[2]]
  const { solution } = solveServe(player.serveSelection, origin, forward, serviceZ)
  return {
    ...state, phase: 'playing', phaseTime: 0, currentPlayer: server,
    shuttle: { pos: solution.launchPoint, vel: solution.outgoingVel, spin: [0, 8, 0] },
    lastHitter: server, lastHitAt: state.elapsed, rallyId: state.rallyId + 1, rallyHits: 0,
    serveInFlight: true, serviceCourtZ: -serviceZ, netTouched: false, lastPoint: null,
  }
}

function changeEnds(players: GameState['players']): GameState['players'] {
  return players.map(p => p && ({ ...p, side: p.side === 0 ? 1 : 0, facing: p.side === 0 ? Math.PI : 0 })) as GameState['players']
}

function positionForService(state: GameState): GameState {
  const server = state.mode === 'training' ? 0 : state.match?.server ?? 0
  const serverSide = state.players[server]?.side ?? server
  const z = (serverSide === 0 ? 1 : -1) * (state.match?.serviceSide === 'left' ? -1 : 1)
  return {
    ...state,
    players: state.players.map((p, i) => {
      if (!p) return null
      const fresh = createPlayer(p.side)
      return {
        ...fresh, loadout: p.loadout, selectedShot: p.selectedShot, aim: p.aim,
        stamina: state.lastPoint ? Math.min(p.maxStamina, p.stamina + 8) : p.stamina,
        pos: [(p.side === 0 ? -1 : 1) * (i === server ? 3 : 4.2), 0, i === server ? z : -z] as [number, number, number],
      }
    }) as GameState['players'],
  }
}
