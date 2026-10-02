import type { Loadout, PlayerState, ShotAim } from './types'
import type { ShotDirection, ShotType } from './shotSynthesis'
import { MAX_CONTACT_HEIGHT, type Vec3 } from './racketKinematics'

export const SHOT_NAMES: Record<ShotType, string> = {
  CLEAR: '高远', DROP: '吊球', SMASH: '杀球', DRIVE: '平抽', NET_DROP: '放网', LIFT: '挑球',
}
export const SHOT_ORDER: ShotType[] = ['CLEAR', 'DROP', 'SMASH', 'DRIVE', 'NET_DROP', 'LIFT']
export const DIRECTION_NAMES: Record<ShotDirection, string> = { up: '高远', down: '下压', flat: '平击' }
export const RACKETS: Record<Loadout, { name: string; balance: number; tension: number; swingweight: number; preparation: number; recovery: number; power: number; sweetSpot: number }> = {
  balanced: { name: '均衡拍', balance: 295, tension: 24, swingweight: 86, preparation: 0.09, recovery: 0.52, power: 1, sweetSpot: 1 },
  power: { name: '头重拍', balance: 310, tension: 26, swingweight: 94, preparation: 0.12, recovery: 0.6, power: 1.08, sweetSpot: 0.9 },
  control: { name: '轻快拍', balance: 285, tension: 22, swingweight: 80, preparation: 0.07, recovery: 0.46, power: 0.94, sweetSpot: 1.08 },
}

/** 蓄力窗口：按住 CHARGE.min 起算，CHARGE.max 蓄满封顶（秒）。 */
export const CHARGE = { min: 0.05, max: 0.4 } as const
/** Keep contact active into follow-through so a slightly early press still returns the ball. */
export const CONTACT_WINDOW_SECONDS = 0.34
/** Released human input waits for the incoming shuttle instead of swinging at empty air. */
export const SHOT_BUFFER_SECONDS = 0.95
const CHARGE_DEPTH_SPAN = 1.2

export function charge01(heldSeconds: number): number {
  return Math.max(0, Math.min(1, (heldSeconds - CHARGE.min) / (CHARGE.max - CHARGE.min)))
}

/** 蓄力最长按住秒数：准备时长 + 蓄力窗口 + holdGrace（触屏瞄准宽限，键盘为 0）。 */
export function holdLimitFor(loadout: Loadout, holdGrace = 0): number {
  return RACKETS[loadout].preparation + CHARGE.max + Math.max(0, holdGrace)
}

export function beginSwing(player: PlayerState, holdGrace = 0, direction: ShotDirection | null = null): PlayerState {
  if (player.swing.phase !== 'ready' && player.swing.phase !== 'queued') return player
  return {
    ...player, wantsToSwing: true, contactPose: null, feedback: '蓄力中 · 松开出拍',
    swing: {
      phase: 'preparing', elapsed: 0, shot: player.selectedShot, direction, aim: { ...player.aim },
      target: null, slice: false, charge01: 0, holdLimit: holdLimitFor(player.loadout, holdGrace),
    },
  }
}

/** 杀球在松开时立即出拍；其他人类球路等待来球，AI 使用已算好的时机。
 * minimumCharge 是触屏短按力量下限。挥拍开始时才计接触窗口。 */
export function releaseSwing(player: PlayerState, minimumCharge = 0, buffered = true): PlayerState {
  if (player.swing.phase !== 'preparing') return player
  const floor = Math.min(1, Math.max(0, minimumCharge))
  const held = Math.max(charge01(player.swing.elapsed), floor)
  const aim: ShotAim = { ...player.swing.aim, depth: Math.max(-1, Math.min(1, player.swing.aim.depth + (player.swing.direction ? 0 : held * CHARGE_DEPTH_SPAN))) }
  const queued = buffered && !player.swing.direction && player.swing.shot !== 'SMASH'
  return { ...player, feedback: queued ? `${SHOT_NAMES[player.swing.shot]}已准备 · 移动到接球圈` : `${SHOT_NAMES[player.swing.shot]} · 出拍`,
    swing: { ...player.swing, phase: queued ? 'queued' : 'swinging', elapsed: 0, aim, charge01: held } }
}

export function advanceSwing(player: PlayerState, dt: number, buffered = true): PlayerState {
  if (player.swing.phase === 'ready') return player
  const racket = RACKETS[player.loadout]
  let next = player
  if (next.swing.phase === 'preparing' && (!buffered || (!next.swing.direction && next.swing.shot !== 'SMASH')) && next.swing.elapsed + dt >= next.swing.holdLimit) {
    // 蓄满封顶自动出拍：长时间按住不会卡死，也不额外惩罚。触屏的 holdLimit 含瞄准宽限。
    next = releaseSwing({ ...next, swing: { ...next.swing, elapsed: next.swing.holdLimit } }, 0, buffered)
  }
  const elapsed = next.swing.elapsed + dt
  if (next.swing.phase === 'queued') {
    const expired = elapsed >= SHOT_BUFFER_SECONDS
    return { ...next, wantsToSwing: !expired,
      feedback: expired ? '未接到来球 · 向接球圈移动，再准备下一拍' : next.feedback,
      swing: { ...next.swing, elapsed: expired ? 0 : elapsed, phase: expired ? 'ready' : 'queued' } }
  }
  const phase = next.swing.phase === 'preparing' ? 'preparing'
    : elapsed >= racket.recovery ? 'ready'
    : elapsed >= 0.16 || next.swing.phase === 'recovery' ? 'recovery' : 'swinging'
  const missed = next.contactPose === null && next.swing.elapsed < CONTACT_WINDOW_SECONDS
    && elapsed >= CONTACT_WINDOW_SECONDS
  return {
    ...next,
    wantsToSwing: phase === 'preparing' || phase === 'swinging',
    feedback: missed ? '挥空：提前到位，在球到拍前时挥拍' : next.feedback,
    swing: { ...next.swing, elapsed, phase, direction: phase === 'ready' ? null : next.swing.direction },
  }
}

export function isContactWindowOpen(swing: PlayerState['swing']): boolean {
  return (swing.phase === 'swinging' || swing.phase === 'recovery')
    && swing.elapsed <= CONTACT_WINDOW_SECONDS
}

export function canPlayShot(shot: ShotType, pos: Vec3, playerHeight = 0, direction: ShotDirection | null = null): boolean {
  const height = pos[1] - playerHeight
  if (height < 0.32 || height > MAX_CONTACT_HEIGHT) return false
  switch (shot) {
    case 'SMASH': return height >= 1.85
    case 'CLEAR': case 'DROP': return height >= 1.35
    case 'DRIVE': return height >= 0.75 && (direction === 'flat' || height <= 1.85)
    case 'NET_DROP': return height <= 1.65 && Math.abs(pos[0]) <= 2
    case 'LIFT': return height <= 1.65
  }
}

export function getShotTarget(player: PlayerState, shot: ShotType, aim: ShotAim): Vec3 {
  const depth: Record<ShotType, number> = { CLEAR: 5.65, DROP: 1.3, SMASH: 4.3, DRIVE: 4.7, NET_DROP: 0.85, LIFT: 5.5 }
  const forward = player.side === 0 ? 1 : -1
  const charge = player.swing.phase === 'preparing' ? charge01(player.swing.elapsed) : player.swing.charge01
  const distance = player.swing.direction ? (shot === 'NET_DROP' ? 0.5 + charge * 0.8
    : shot === 'DROP' ? 0.7 + charge * 2.2 : 0.8 + charge * 4.8) : depth[shot]
  const x = Math.max(0.5, Math.min(6.25, distance + aim.depth * (player.swing.direction ? 0.9 : 0.55)))
  // 横向落点可以连续（触屏瞄准区），钳在单打边线内，避免指到界外。
  const lateral = Math.max(-1.2, Math.min(1.2, aim.lateral))
  return [forward * x, 0, forward * lateral * 1.85]
}

/** @entry The input selects a direction; contact height and power select the technique. */
export function resolveDirectionalShot(player: PlayerState, contact: Vec3, power: number): ShotType {
  const direction = player.swing.direction
  if (!direction) return player.swing.shot
  const height = contact[1] - player.pos[1]
  const nearNet = Math.abs(contact[0]) <= 2
  const gentle = power < 0.3
  if (height < 1.35) {
    if (nearNet && gentle) return 'NET_DROP'
    return direction === 'flat' && height >= 1.05 ? 'DRIVE' : 'LIFT'
  }
  if (direction === 'down') {
    if (!gentle && height >= 1.85 && contact[1] >= 2.15
      && (power >= 0.6 || Math.abs(contact[0]) <= 3)) return 'SMASH'
    return !gentle && height <= 1.85 ? 'DRIVE' : nearNet && height < 1.65 ? 'NET_DROP' : 'DROP'
  }
  if (nearNet && gentle && height < 1.65) return 'NET_DROP'
  if (direction === 'flat') return 'DRIVE'
  return gentle ? 'DROP' : 'CLEAR'
}
