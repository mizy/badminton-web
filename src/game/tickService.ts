/** 完整游戏 Tick — 物理步进 + 碰撞检测 + 击球合成 + 计分 */

import type { GameState } from './types'
import type { AIConfig } from '../ai/types'
import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import type { RacketState } from '../physics/racket'
import { stepShuttlecock, DEFAULT_SHUTTLECOCK } from '../physics/shuttlecock'
import { sphereAABBIntersect } from '../physics/collision'
import { resolveRacketCollision } from '../physics/racket'
import { updateMovement } from '../character/movement'
import { updateStamina } from './stamina'
import { computeTimingWindow } from '../character/timing'
import { decideTactical } from '../ai/tactical'
import { synthesizeShot } from '../character/shotSynthesis'
import { checkPoint } from './match'

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

/** 检测球员是否可击球，合成击球结果 */
function checkPlayerCollision(
  players: [PlayerState | null, PlayerState | null],
  shuttle: ShuttlecockState,
  aiConfigs?: TickAIConfigs,
): ShuttlecockState {
  for (const i of [0, 1] as const) {
    const player = players[i]
    if (!player) continue

    const px = player.pos[0]
    const pz = player.pos[2]

    // 碰撞盒大幅扩大（x: ±2.0, y: 0~3.5, z: ±1.2）让 AI 更容易拦截到球
    // 确保在高球速下也能触发碰撞，形成多回合对打
    const hit = sphereAABBIntersect(
      shuttle.pos,
      0.15,
      { min: [px - 0.6, 0.3, pz - 0.4], max: [px + 0.6, 2.5, pz + 0.4] },
    )
    if (!hit) continue

    const opponent = players[i === 0 ? 1 : 0]
    const cfg = aiConfigs ? (i === 0 ? aiConfigs.home : aiConfigs.away) : undefined

    if (cfg && opponent) {
      const decision = decideTactical(player, opponent, shuttle, cfg)
      if (decision.shotType) {
        const timing = computeTimingWindow(player, shuttle)
        if (timing) {
          const shotResult = synthesizeShot(
            { type: decision.shotType, power: decision.power, target: decision.target },
            player,
            shuttle,
            timing,
          )
          const speed = Math.sqrt(
            shotResult.collision.outgoingVel[0] ** 2 +
              shotResult.collision.outgoingVel[1] ** 2 +
              shotResult.collision.outgoingVel[2] ** 2,
          )
          const desiredVel = computeShotVelocity(player.pos, decision.target, speed, decision.shotType)
          // Use racket physics collision model
          const racketForCollision: RacketState = {
            ...player.racket,
            vel: [
              desiredVel[0] * 0.6,
              Math.max(desiredVel[1] * 0.4, 2),
              desiredVel[2] * 0.6,
            ],
          }
          const collisionResult = resolveRacketCollision(shuttle.vel, shuttle.spin, racketForCollision, shuttle.pos)
          if (collisionResult) {
            return {
              ...shuttle,
              vel: collisionResult.outgoingVel,
              spin: collisionResult.outgoingSpin,
            }
          }
          // Fallback: use desired velocity directly
          return {
            ...shuttle,
            vel: desiredVel,
            spin: shotResult.collision.outgoingSpin,
          }
        }
      }
    }

    // Human 玩家击球（wantsToSwing 标志，无 AI config）
    if (player.wantsToSwing && opponent) {
      // 清除击球标志
      players[i] = { ...player, wantsToSwing: false }

      // 根据球高度选择球路
      const humanShotType: ShotType = shuttle.pos[1] > 1.5 ? 'CLEAR' : 'DRIVE'
      const humanTarget: [number, number, number] = [opponent.pos[0], 0, opponent.pos[2]]
      const timing = computeTimingWindow(player, shuttle)

      if (timing) {
        const shotResult = synthesizeShot(
          { type: humanShotType, power: 0.7, target: humanTarget },
          player,
          shuttle,
          timing,
        )
        const speed = Math.sqrt(
          shotResult.collision.outgoingVel[0] ** 2 +
            shotResult.collision.outgoingVel[1] ** 2 +
            shotResult.collision.outgoingVel[2] ** 2,
        )
        const desiredVel = computeShotVelocity(player.pos, humanTarget, speed, humanShotType)
        const racketForCollision: RacketState = {
          ...player.racket,
          vel: [
            desiredVel[0] * 0.6,
            Math.max(desiredVel[1] * 0.4, 2),
            desiredVel[2] * 0.6,
          ],
        }
        const collisionResult = resolveRacketCollision(shuttle.vel, shuttle.spin, racketForCollision, shuttle.pos)
        if (collisionResult) {
          return {
            ...shuttle,
            vel: collisionResult.outgoingVel,
            spin: collisionResult.outgoingSpin,
          }
        }
        return {
          ...shuttle,
          vel: desiredVel,
          spin: shotResult.collision.outgoingSpin,
        }
      }
    }


  }

  return shuttle
}

/** 根据目标位置和球路计算击球速度向量 */
function computeShotVelocity(
  playerPos: [number, number, number],
  target: [number, number, number],
  speed: number,
  shotType: ShotType,
): [number, number, number] {
  const dx = target[0] - playerPos[0]
  const dz = target[2] - playerPos[2]

  let elevation: number
  switch (shotType) {
    case 'SMASH':   elevation = 15; break
    case 'DROP':    elevation = 30; break
    case 'CLEAR':   elevation = 55; break
    case 'DRIVE':   elevation = 8; break
    case 'NET_DROP': elevation = 15; break
    case 'LIFT':    elevation = 60; break
    default:        elevation = 30
  }

  const angleRad = elevation * Math.PI / 180
  const headingRad = Math.atan2(dx, dz)

  return [
    speed * Math.cos(angleRad) * Math.sin(headingRad),
    speed * Math.sin(angleRad),
    speed * Math.cos(angleRad) * Math.cos(headingRad),
  ]
}
