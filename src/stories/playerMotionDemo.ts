/** Identical input samples for the isolated skeleton and model binding stories. */
import type { PlayerState } from '../character/types'
import { RACKETS, SHOT_ORDER } from '../character/stroke'
import type { ShotType } from '../character/shotSynthesis'

export const MOTION_DEMOS = ['ready', 'lateral', 'forward', 'retreat', 'turn', 'stop', 'sixPoints', 'jump', 'scissor', ...SHOT_ORDER] as const
export type MotionDemo = typeof MOTION_DEMOS[number]

/** @entry Display samples only; gameplay continues to use reducer-owned PlayerState. */
export function sampleMotionDemo(player: PlayerState, motion: MotionDemo, time: number, origin: number): void {
  const forward = player.side === 0 ? 1 : -1
  const cycle = time % 2.4
  player.pos = [origin, 0, 0]
  player.movement.currentVel = { x: 0, z: 0 }
  player.movement.targetDir = { x: 0, z: 0 }
  player.movement.footwork = 'ready'
  player.movement.footworkPoint = null
  player.body = { phase: 'grounded', action: null, elapsed: 0, verticalVelocity: 0 }
  player.swing.phase = 'ready'
  if (motion === 'jump' || motion === 'scissor') {
    const flight = cycle - 0.2
    player.body.action = motion
    player.body.phase = cycle < 0.2 ? 'loading' : cycle < 0.85 ? 'airborne' : cycle < 1.1 ? 'landing' : 'grounded'
    player.body.elapsed = cycle < 0.2 ? cycle : cycle < 0.85 ? flight : cycle - 0.85
    player.pos[1] = player.body.phase === 'airborne' ? Math.sin(Math.PI * flight / 0.65) * 0.45 : 0
  } else if (SHOT_ORDER.includes(motion as ShotType)) {
    player.swing.shot = motion as ShotType
    player.selectedShot = motion as ShotType
    const prep = RACKETS[player.loadout].preparation + 0.3
    const recovery = RACKETS[player.loadout].recovery
    player.swing.phase = cycle < prep ? 'preparing' : cycle < prep + 0.16 ? 'swinging' : cycle < prep + recovery ? 'recovery' : 'ready'
    player.swing.elapsed = cycle < prep ? cycle : cycle - prep
  } else if (motion !== 'ready') {
    moveSample(player, motion, time, origin, forward)
  }
}

function moveSample(player: PlayerState, motion: MotionDemo, time: number, origin: number, forward: number): void {
  const wave = Math.sin(time * 1.8)
  const velocity = Math.cos(time * 1.8) * 1.8
  let x = 0
  let z = wave
  let vx = 0
  let vz = velocity
  if (motion === 'forward' || motion === 'retreat') {
    const direction = motion === 'retreat' ? -forward : forward
    x = wave * direction
    vx = velocity * direction
    z = 0
    vz = 0
  } else if (motion === 'turn') {
    x = Math.sin(time * 1.2) * 0.65
    z = Math.sin(time * 2.4) * 0.5
    vx = Math.cos(time * 1.2) * 0.78
    vz = Math.cos(time * 2.4) * 1.2
  } else if (motion === 'stop') {
    const cycle = time % 4
    const move = Math.min(cycle, 1.4)
    z = Math.sin(move * Math.PI / 2.8) * 1.2 - 0.6
    vz = cycle < 1.4 ? Math.cos(move * Math.PI / 2.8) * Math.PI / 2.8 * 1.2 : 0
  } else if (motion === 'sixPoints') {
    const index = Math.floor(time / 2) % 6
    const depth = ['front', 'mid', 'back'][Math.floor(index / 2)]
    const side = index % 2 ? 'right' : 'left'
    const t = time % 2
    const travel = Math.sin(t * Math.PI / 2)
    const rate = Math.cos(t * Math.PI / 2) * Math.PI / 2
    const longitudinal = depth === 'front' ? forward : depth === 'back' ? -forward : 0
    const lateral = side === 'right' ? forward : -forward
    x = travel * longitudinal * 0.55
    z = travel * lateral * 0.6
    vx = rate * longitudinal * 0.55
    vz = rate * lateral * 0.6
    player.movement.footworkPoint = `${depth}-${side}` as NonNullable<PlayerState['movement']['footworkPoint']>
    player.movement.footwork = depth === 'front' ? 'lunge' : depth === 'back' ? 'cross' : 'chasse'
  }
  player.pos = [origin + x, 0, z]
  player.movement.currentVel = { x: vx, z: vz }
  player.movement.targetDir = { x: Math.sign(vx), z: Math.sign(vz) }
  if (motion !== 'sixPoints') player.movement.footwork = Math.hypot(vx, vz) < 0.05 ? 'ready'
    : vx * forward < -0.1 ? 'retreat' : Math.abs(vz) > Math.abs(vx) ? 'chasse' : 'cross'
}
