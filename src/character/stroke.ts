import type { Loadout, PlayerState, ShotAim } from './types'
import type { ShotType } from './shotSynthesis'
import { MAX_CONTACT_HEIGHT, type Vec3 } from './racketKinematics'

export const SHOT_NAMES: Record<ShotType, string> = {
  CLEAR: '高远', DROP: '吊球', SMASH: '杀球', DRIVE: '平抽', NET_DROP: '放网', LIFT: '挑球',
}
export const SHOT_ORDER: ShotType[] = ['CLEAR', 'DROP', 'SMASH', 'DRIVE', 'NET_DROP', 'LIFT']
export const RACKETS: Record<Loadout, { name: string; balance: number; tension: number; swingweight: number; preparation: number; recovery: number; power: number; sweetSpot: number }> = {
  balanced: { name: '均衡拍', balance: 295, tension: 24, swingweight: 86, preparation: 0.09, recovery: 0.52, power: 1, sweetSpot: 1 },
  power: { name: '头重拍', balance: 310, tension: 26, swingweight: 94, preparation: 0.12, recovery: 0.6, power: 1.08, sweetSpot: 0.9 },
  control: { name: '轻快拍', balance: 285, tension: 22, swingweight: 80, preparation: 0.07, recovery: 0.46, power: 0.94, sweetSpot: 1.08 },
}

/** 蓄力窗口：按住 CHARGE.min 起算，CHARGE.max 蓄满封顶（秒）。 */
export const CHARGE = { min: 0.05, max: 0.4 } as const
const CHARGE_DEPTH_SPAN = 1.2

export function charge01(heldSeconds: number): number {
  return Math.max(0, Math.min(1, (heldSeconds - CHARGE.min) / (CHARGE.max - CHARGE.min)))
}

export function beginSwing(player: PlayerState): PlayerState {
  if (player.swing.phase !== 'ready') return player
  return {
    ...player, wantsToSwing: true, contactPose: null, feedback: '蓄力中 · 松开出拍',
    swing: { phase: 'preparing', elapsed: 0, shot: player.selectedShot, aim: { ...player.aim }, target: null, slice: false, charge01: 0 },
  }
}

/** 松开击球键出拍：按住时长换算深浅与力量，方向沿用按键瞬间采样的 WASD；出拍后接触窗口重新计时。 */
export function releaseSwing(player: PlayerState): PlayerState {
  if (player.swing.phase !== 'preparing') return player
  const held = charge01(player.swing.elapsed)
  const aim: ShotAim = { ...player.swing.aim, depth: Math.max(-1, Math.min(1, player.swing.aim.depth + held * CHARGE_DEPTH_SPAN)) }
  return { ...player, swing: { ...player.swing, phase: 'swinging', elapsed: 0, aim, charge01: held } }
}

export function advanceSwing(player: PlayerState, dt: number): PlayerState {
  if (player.swing.phase === 'ready') return player
  const racket = RACKETS[player.loadout]
  let next = player
  if (next.swing.phase === 'preparing' && next.swing.elapsed + dt >= racket.preparation + CHARGE.max) {
    // 蓄满封顶自动出拍：长时间按住不会卡死，也不额外惩罚。
    next = releaseSwing({ ...next, swing: { ...next.swing, elapsed: racket.preparation + CHARGE.max } })
  }
  const elapsed = next.swing.elapsed + dt
  const phase = next.swing.phase === 'preparing' ? 'preparing'
    : elapsed >= racket.recovery ? 'ready'
    : elapsed >= 0.16 || next.swing.phase === 'recovery' ? 'recovery' : 'swinging'
  const missed = phase === 'recovery' && next.swing.phase !== 'recovery'
  return {
    ...next,
    wantsToSwing: phase === 'preparing' || phase === 'swinging',
    feedback: missed ? '挥空：提前到位，在球到拍前时挥拍' : next.feedback,
    swing: { ...next.swing, elapsed, phase },
  }
}

export function canPlayShot(shot: ShotType, pos: Vec3, playerHeight = 0): boolean {
  const height = pos[1] - playerHeight
  if (height < 0.32 || height > MAX_CONTACT_HEIGHT) return false
  switch (shot) {
    case 'SMASH': return height >= 1.85
    case 'CLEAR': case 'DROP': return height >= 1.35
    case 'DRIVE': return height >= 0.75 && height <= 1.85
    case 'NET_DROP': return height <= 1.65 && Math.abs(pos[0]) <= 2
    case 'LIFT': return height <= 1.65
  }
}

export function getShotTarget(player: PlayerState, shot: ShotType, aim: ShotAim): Vec3 {
  const depth: Record<ShotType, number> = { CLEAR: 5.65, DROP: 1.3, SMASH: 4.3, DRIVE: 4.7, NET_DROP: 0.85, LIFT: 5.5 }
  const forward = player.side === 0 ? 1 : -1
  const x = Math.max(0.5, Math.min(6.25, depth[shot] + aim.depth * 0.55))
  return [forward * x, 0, forward * aim.lateral * 1.85]
}
