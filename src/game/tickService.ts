/** 完整游戏 Tick — 物理步进 + 碰撞检测 + 击球合成 + 计分 */

import type { GameState } from './types'
import type { AIConfig } from '../ai/types'
import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import { stepShuttlecock, DEFAULT_SHUTTLECOCK } from '../physics/shuttlecock'
import { updateMovement } from '../character/movement'
import { updateStamina } from './stamina'
import { decideTactical } from '../ai/tactical'
import { checkPoint } from './match'
import { evaluateContact, getTechniqueRacketFaceDeg } from '../character/contact'
import {
  createReachableRacketPose,
  getShuttleCorkCenter,
} from '../character/racketKinematics'

export interface TickAIConfigs {
  home?: AIConfig
  away?: AIConfig
}

/**
 * 处理一帧游戏逻辑
 * @param state 当前状态
 * @param dt 时间步长（秒）
 * @param aiConfigs 可选 AI 配置，有则用 AI 决策击球，无则简单反弹
 */
export function processGameTick(
  state: GameState,
  dt: number,
  aiConfigs?: TickAIConfigs,
): GameState {
  if (state.phase !== 'playing' || !state.shuttle) return state

  // 1. 更新球员移动 + 体力
  const players: [PlayerState | null, PlayerState | null] = [
    state.players[0] ? updateStamina(updateMovement(state.players[0], dt), dt) : null,
    state.players[1] ? updateStamina(updateMovement(state.players[1], dt), dt) : null,
  ]

  // 2. 步进羽毛球物理
  let shuttle = stepShuttlecock(state.shuttle, dt, DEFAULT_SHUTTLECOCK, 8)

  // 3. 落地 / 出界检测 → 计分
  if (shuttle.pos[1] <= 0 || Math.abs(shuttle.pos[0]) > 6.7 || Math.abs(shuttle.pos[2]) > 3.05) {
    const scored = checkPoint({ ...state, players, shuttle })
    if (scored.phase === 'set_end' || scored.phase === 'match_end') return scored
    // 回到 idle 等待下一发球
    return { ...scored, phase: 'point_scored' }
  }

  // 4. 球员与球碰撞检测
  shuttle = checkPlayerCollision(players, shuttle, aiConfigs)

  return { ...state, players, shuttle, elapsed: state.elapsed + dt }
}

/** 检测球员是否可击球，并使用与可视化相同的拍弦/球塞接触真相。 */
function checkPlayerCollision(
  players: [PlayerState | null, PlayerState | null],
  shuttle: ShuttlecockState,
  aiConfigs?: TickAIConfigs,
): ShuttlecockState {
  for (const i of [0, 1] as const) {
    const player = players[i]
    if (!player) continue

    const opponent = players[i === 0 ? 1 : 0]
    const cfg = aiConfigs ? (i === 0 ? aiConfigs.home : aiConfigs.away) : undefined
    if (!opponent) continue

    if (cfg) {
      const decision = decideTactical(player, opponent, shuttle, cfg)
      if (decision.shotType) {
        const contacted = attemptPlayerContact(
          player,
          shuttle,
          decision.shotType,
          decision.power,
          decision.target,
          (1 - cfg.accuracy) * 100,
        )
        if (contacted) {
          players[i] = contacted.player
          return contacted.shuttle
        }
      }
    }

    if (player.wantsToSwing && !cfg) {
      const humanShotType: ShotType = shuttle.pos[1] > 1.5 ? 'CLEAR' : 'DRIVE'
      const humanTarget: [number, number, number] = [opponent.pos[0], 0, opponent.pos[2]]
      const contacted = attemptPlayerContact(player, shuttle, humanShotType, 0.7, humanTarget, 0)
      players[i] = contacted?.player ?? { ...player, wantsToSwing: false }
      if (contacted) {
        return contacted.shuttle
      }
    }
  }

  return shuttle
}

function attemptPlayerContact(
  player: PlayerState,
  shuttle: ShuttlecockState,
  technique: ShotType,
  power: number,
  target: [number, number, number],
  swingOffsetMs: number,
): { player: PlayerState; shuttle: ShuttlecockState } | null {
  const racketFaceDeg = getTechniqueRacketFaceDeg(technique)
  const desiredContact = getShuttleCorkCenter(shuttle.pos, shuttle.vel)
  const racket = createReachableRacketPose({
    desiredContact,
    playerPos: player.pos,
    playerSide: player.side,
    racketFaceDeg,
  })
  if (!racket.reachable) return null

  const result = evaluateContact({
    intent: technique,
    playerPos: player.pos,
    playerSide: player.side,
    power,
    racket,
    racketFaceDeg,
    shuttle,
    swingOffsetMs,
    target,
    targetZ: target[2],
  })
  if (result.outcome !== 'hit') return null

  return {
    player: {
      ...player,
      racket: {
        ...player.racket,
        normal: [...racket.faceNormal],
        pos: [...racket.stringCenter],
        vel: [
          result.outgoingVel[0] * 0.55,
          result.outgoingVel[1] * 0.55,
          result.outgoingVel[2] * 0.55,
        ],
      },
      wantsToSwing: false,
    },
    shuttle: {
      pos: [...result.launchPoint],
      spin: [...result.outgoingSpin],
      vel: [...result.outgoingVel],
    },
  }
}
