/**
 * 游戏状态管理
 * 管理发球、物理步进、落地检测
 */

import {
  ShuttlecockState,
  launchShuttlecock,
  stepShuttlecock,
  DEFAULT_SHUTTLECOCK,
} from '../physics/shuttlecock'

export type GamePhase = 'idle' | 'playing'

export interface GameState {
  phase: GamePhase
  shuttle: ShuttlecockState | null
  /** Phase 2+ 扩展：暂为 null 不影响 P1，供碰撞/角色系统使用 */
  readonly players: [null, null]
}

export function createInitialState(): GameState {
  return { phase: 'idle', shuttle: null, players: [null, null] }
}

/** 发球参数 */
const SERVE_ORIGIN: [number, number, number] = [-4, 1.0, 0]
const SERVE_SPEED = 15
const SERVE_ANGLE = 22       // 仰角（度）
const SERVE_HEADING = 90     // 水平方向：沿+X

/** 执行发球 */
export function serveShuttle(): ShuttlecockState {
  return launchShuttlecock(SERVE_ORIGIN, SERVE_SPEED, SERVE_ANGLE, SERVE_HEADING)
}

/** 物理步进 + 落地检测 */
export function stepGame(state: GameState, dt: number): GameState {
  if (state.phase !== 'playing' || !state.shuttle) return state

  const next = stepShuttlecock(state.shuttle, dt, DEFAULT_SHUTTLECOCK, 8)

  // 落地 → idle
  if (next.pos[1] <= 0) {
    return { phase: 'idle', shuttle: null, players: [null, null] }
  }

  return { ...state, shuttle: next }
}
