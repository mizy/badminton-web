import type { GameState } from './types'
import type { AIConfig } from '../ai/types'
import type { ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from '../character/types'
import { stepShuttlecock } from '../physics/shuttlecock'
import { updateMovement } from '../character/movement'
import { advanceBody, beginBodyAction } from '../character/body'
import { updateStamina } from './stamina'
import { decideTactical, getLegalShots } from '../ai/tactical'
import { checkPoint } from './match'
import { evaluateContact, getTechniqueRacketFaceDeg } from '../character/contact'
import { createReachableRacketPose, getShuttleCorkCenter } from '../character/racketKinematics'
import { advanceSwing, beginSwing, canPlayShot, getShotTarget, releaseSwing, RACKETS, SHOT_NAMES } from '../character/stroke'

export interface TickAIConfigs {
  home?: AIConfig
  away?: AIConfig
}

export function processGameTick(state: GameState, dt: number, aiConfigs?: TickAIConfigs): GameState {
  if (state.phase === 'paused' || state.phase === 'set_end' || state.phase === 'match_end') return state
  let next = updateAI(state, aiConfigs)
  const count = Math.max(1, Math.ceil(dt * 240))
  const step = dt / count
  for (let i = 0; i < count; i++) {
    const players = next.players.map(p => p && advanceSwing(updateStamina(updateMovement(advanceBody(p, step), step), step), step)) as GameState['players']
    const previousPlayer = next.players[0]
    const moved = previousPlayer && players[0] ? Math.hypot(players[0].pos[0] - previousPlayer.pos[0], players[0].pos[2] - previousPlayer.pos[2]) : 0
    next = { ...next, players, elapsed: next.elapsed + step, phaseTime: next.phaseTime + step,
      training: { ...next.training, moved: next.training.moved + moved } }
    if (next.phase !== 'playing' || !next.shuttle) continue
    next = contactPlayers(next)
    const previous = next.shuttle!
    let shuttle = stepShuttlecock(previous, step, undefined, 2)
    const dx = shuttle.pos[0] - previous.pos[0]
    const crossesNet = previous.pos[0] * shuttle.pos[0] <= 0 && Math.abs(dx) > 1e-9
    if (crossesNet && !next.netTouched) {
      const alpha = -previous.pos[0] / dx
      const y = previous.pos[1] + (shuttle.pos[1] - previous.pos[1]) * alpha
      const z = previous.pos[2] + (shuttle.pos[2] - previous.pos[2]) * alpha
      const netHeight = 1.524 + 0.026 * Math.min(1, (z / 3.05) ** 2)
      if (Math.abs(z) <= 3.05 && y <= netHeight + 0.018) {
        shuttle = { pos: [Math.sign(previous.pos[0]) * 0.035, Math.max(0, y), z], vel: [0, -0.6, 0], spin: [0, 0, 0] }
        next = { ...next, netTouched: true }
      }
    }
    if (shuttle.pos[1] <= 0) {
      const alpha = previous.pos[1] / Math.max(1e-9, previous.pos[1] - shuttle.pos[1])
      shuttle = { ...shuttle, pos: [previous.pos[0] + (shuttle.pos[0] - previous.pos[0]) * alpha, 0, previous.pos[2] + (shuttle.pos[2] - previous.pos[2]) * alpha] }
      return checkPoint({ ...next, shuttle })
    }
    next = { ...next, shuttle }
  }
  return next
}

function updateAI(state: GameState, configs?: TickAIConfigs): GameState {
  if (state.phase !== 'playing' || !state.shuttle) return state
  const shuttle = state.shuttle
  const players = state.players.map((original, index) => {
    const i = index as 0 | 1
    const cfg = i === 0 ? configs?.home : configs?.away
    const opponent = state.players[i === 0 ? 1 : 0]
    if (!original || !opponent || !cfg || state.controls[i] !== 'ai') return original
    // AI 已引拍：等球真正进入可击区再出拍，避免按预测提前挥空；超时兜底出拍。
    if (original.swing.phase === 'preparing') {
      if (getLegalShots(original, shuttle).length > 0 || original.swing.elapsed >= RACKETS[original.loadout].preparation + 0.5) {
        return releaseSwing(original)
      }
      return original
    }
    if (state.elapsed - state.lastHitAt < cfg.reactionDelay || state.elapsed < original.aiPlanAt) return original
    const decision = decideTactical(original, opponent, shuttle, cfg)
    const dx = decision.moveTarget[0] - original.pos[0]
    const dz = decision.moveTarget[2] - original.pos[2]
    const distance = Math.hypot(dx, dz)
    let player: PlayerState = {
      ...original, aiPlan: decision, aiPlanAt: state.elapsed + 0.08,
      movement: { ...original.movement, targetDir: distance > 0.16 ? { x: dx / distance * Math.min(1, distance / 0.7), z: dz / distance * Math.min(1, distance / 0.7) } : { x: 0, z: 0 } },
    }
    if (state.lastHitter === i || state.netTouched || player.swing.phase !== 'ready') return player
    if (cfg.style === 'attacker' && !cfg.cooperative && player.body.phase === 'grounded' && shuttle.vel[1] < 0
      && shuttle.pos[1] > 2.75 && shuttle.pos[1] < 3.6 && Math.hypot(shuttle.pos[0] - player.pos[0], shuttle.pos[2] - player.pos[2]) < 1.1) {
      return beginBodyAction(player, 'jump')
    }
    const windup = RACKETS[player.loadout].preparation + 0.06
    const future = stepShuttlecock(shuttle, windup, undefined, 12)
    const contactPlayer = advanceBody(player, windup)
    const predicted = decideTactical(contactPlayer, opponent, future, cfg)
    if (!predicted.shotType || !canPlayShot(predicted.shotType, future.pos, contactPlayer.pos[1]) || !onOwnSide(player, future)) return player
    const pose = createReachableRacketPose({ desiredContact: getShuttleCorkCenter(future.pos, future.vel), playerPos: contactPlayer.pos, playerSide: player.side, racketFaceDeg: getTechniqueRacketFaceDeg(predicted.shotType) })
    if (!pose.reachable) return player
    player = beginSwing({ ...player, selectedShot: predicted.shotType })
    return { ...player, swing: { ...player.swing, target: predicted.target } }
  }) as GameState['players']
  return { ...state, players }
}

function onOwnSide(player: PlayerState, shuttle: ShuttlecockState): boolean {
  return player.side === 0 ? shuttle.pos[0] < -0.025 : shuttle.pos[0] > 0.025
}

function contactPlayers(state: GameState): GameState {
  const shuttle = state.shuttle!
  if (state.netTouched) return state
  for (const i of [0, 1] as const) {
    const player = state.players[i]
    if (!player || state.lastHitter === i || player.swing.phase !== 'swinging' || !onOwnSide(player, shuttle)) continue
    const technique = player.swing.shot
    if (!getLegalShots(player, shuttle).includes(technique)) continue
    const face = getTechniqueRacketFaceDeg(technique)
    const cork = getShuttleCorkCenter(shuttle.pos, shuttle.vel)
    const racket = createReachableRacketPose({ desiredContact: cork, playerPos: player.pos, playerSide: player.side, racketFaceDeg: face })
    if (!racket.reachable) continue
    const spec = RACKETS[player.loadout]
    const offset = (player.swing.elapsed - 0.07) * 1000
    const readiness = player.movement.readiness
    const fatigue = 0.65 + 0.35 * player.stamina / player.maxStamina
    const target = player.swing.target ?? getShotTarget(player, technique, player.swing.aim)
    const result = evaluateContact({ intent: technique, playerPos: player.pos, playerSide: player.side,
      power: Math.min(1, (0.68 + readiness * 0.25 + player.swing.charge01 * 0.3) * fatigue * spec.power), racket, racketFaceDeg: face,
      shuttle, swingOffsetMs: offset / spec.sweetSpot, target, targetZ: target[2], slice: player.swing.slice })
    if (result.outcome !== 'hit') continue
    const forward = player.side === 0 ? 1 : -1
    const quality = result.quality * (0.7 + readiness * 0.3) * fatigue
    const feedback = result.netClearance !== null && result.netClearance < 0 ? '下网风险：触球过低或位置太靠后'
      : result.targetError > 0.8 ? '回球偏短：到位、体力或力量不足'
      : Math.abs(offset) > 65 ? '击球偏早：等球进入拍前'
      : readiness < 0.55 ? '被动回球：先制动再出拍'
      : '干净触球'
    const bodyShot = technique === 'SMASH' && player.body.phase === 'airborne'
      ? player.body.action === 'scissor' ? '蹬转杀' : '跳杀' : SHOT_NAMES[technique]
    const shotName = player.swing.slice ? `${technique === 'CLEAR' ? '滑板' : '切削'}${bodyShot}` : bodyShot
    const contacted: PlayerState = {
      ...player, contactPose: racket, contactQuality: quality, feedback: `${shotName} · ${feedback}`,
      grip: (cork[2] - player.pos[2]) * forward < -0.25 ? 'backhand' : 'forehand',
      stamina: Math.max(0, player.stamina - (technique === 'SMASH' ? 4 : 1.5)), wantsToSwing: false,
      swing: { ...player.swing, phase: 'recovery' },
      racket: { ...player.racket, normal: racket.faceNormal, pos: racket.stringCenter, vel: result.outgoingVel },
    }
    const players = [...state.players] as GameState['players']
    players[i] = contacted
    return {
      ...state, players, shuttle: { pos: result.launchPoint, vel: result.outgoingVel, spin: result.outgoingSpin },
      lastHitter: i, lastHitAt: state.elapsed, rallyHits: state.rallyHits + 1, serveInFlight: false,
      training: i === 0 ? { ...state.training, returns: state.training.returns + 1,
        shots: state.training.shots.includes(technique) ? state.training.shots : [...state.training.shots, technique] } : state.training,
    }
  }
  return state
}
