import { describe, expect, it } from 'vitest'
import { createPlayer } from '../game/playerFactory'
import { DEFAULT_STAMINA, getSpeedMultiplier, updateStamina } from '../game/stamina'
import { DEFAULT_MOVEMENT, updateMovement } from './movement'
import type { PlayerState } from './types'

function moving(x = 1, z = 0, side: 0 | 1 = 0): PlayerState {
  const player = createPlayer(side)
  return { ...player, pos: [side === 0 ? -5 : 5, 0, 0], movement: { ...player.movement, targetDir: { x, z } } }
}

function advance(player: PlayerState, seconds: number, fps = 120): PlayerState {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    player = updateMovement(player, 1 / fps)
  }
  return player
}

function speed(player: PlayerState): number {
  return Math.hypot(player.movement.currentVel.x, player.movement.currentVel.z)
}

describe('movement dynamics', () => {
  it('accelerates to about 6 m/s with configurable speed and no input mutation', () => {
    const player = moving()
    const snapshot = structuredClone(player)
    const first = updateMovement(player, 1 / 60)
    expect(speed(first)).toBeGreaterThan(0)
    expect(speed(first)).toBeLessThan(1)
    expect(first.movement.footwork).toBe('start')
    const running = advance(player, 0.5)
    expect(speed(running)).toBeCloseTo(6)
    expect(running.movement.gait).toBe('sprint')
    expect(running.movement.readiness).toBeLessThan(0.85)
    expect(player).toEqual(snapshot)
    const slower = updateMovement(player, 0.5, { ...DEFAULT_MOVEMENT, maxSpeed: 4 })
    expect(speed(slower)).toBeCloseTo(4)
  })

  it('does not accelerate faster or exceed maximum speed on diagonals', () => {
    const straight = advance(moving(), 0.5)
    const diagonal = advance(moving(1, 1), 0.5)
    expect(speed(diagonal)).toBeCloseTo(speed(straight))
    expect(diagonal.movement.currentVel.x).toBeCloseTo(diagonal.movement.currentVel.z)
  })

  it('brakes to a stop, settles readiness gradually, and remains stopped', () => {
    const running = advance(moving(), 0.4)
    const stopping = { ...running, movement: { ...running.movement, targetDir: { x: 0, z: 0 } } }
    const first = updateMovement(stopping, 1 / 60)
    expect(speed(first)).toBeLessThan(speed(running))
    expect(speed(first)).toBeGreaterThan(0)
    expect(first.movement.footwork).toBe('recover')
    expect(first.movement.readiness).toBeLessThan(0.9)
    const stopped = advance(stopping, 0.4)
    expect(speed(stopped)).toBe(0)
    expect(stopped.movement.readiness).toBeLessThan(0.98)
    const rested = advance(stopped, 2)
    expect(rested.pos).toEqual(stopped.pos)
    expect(rested.movement.footwork).toBe('ready')
    expect(rested.movement.readiness).toBeCloseTo(1, 2)
  })

  it('removes lateral momentum when turning and brakes before reversing', () => {
    const player = moving(0, 1)
    player.movement.currentVel = { x: 6, z: 0 }
    const turned = advance(player, 0.7)
    expect(turned.movement.currentVel.x).toBeCloseTo(0, 5)
    expect(turned.movement.currentVel.z).toBeCloseTo(6)
    const reversing = moving(-1)
    reversing.movement.currentVel = { x: 6, z: 0 }
    const first = updateMovement(reversing, 1 / 60)
    expect(first.movement.currentVel.x).toBeGreaterThan(0)
    expect(first.movement.currentVel.x).toBeLessThan(6)
    expect(first.movement.footwork).toBe('recover')
    const reversed = advance(reversing, 0.7)
    expect(reversed.movement.currentVel.x).toBeLessThan(0)
    expect(reversed.movement.currentVel.z).toBe(0)
  })

  it.each([0, 1] as const)('keeps side %s behind the net and cancels velocity into it', side => {
    const player = moving(side === 0 ? 1 : -1, 0, side)
    player.pos[0] = side === 0 ? -0.2 : 0.2
    const blocked = advance(player, 1)
    expect(blocked.pos[0]).toBe(side === 0 ? -0.1 : 0.1)
    expect(blocked.movement.currentVel.x).toBe(0)
    expect(blocked.movement.gait).toBe('idle')
  })

  it.each([0, 1] as const)('allows rescue space but stops at x ±7.5, z ±3.6 on side %s', side => {
    const player = moving(side === 0 ? -1 : 1, 1, side)
    player.pos = [side === 0 ? -6.65 : 6.65, 0, 3]
    const rescue = advance(player, 0.3)
    expect(Math.abs(rescue.pos[0])).toBeGreaterThan(6.7)
    expect(rescue.pos[2]).toBeGreaterThan(3.05)
    const blocked = advance(rescue, 2)
    expect(blocked.pos[0]).toBe(side === 0 ? -7.5 : 7.5)
    expect(blocked.pos[2]).toBe(3.6)
    expect(speed(blocked)).toBe(0)
    const lower = advance({ ...player, pos: [...player.pos], movement: { ...player.movement, targetDir: { x: 0, z: -1 } } }, 2)
    expect(lower.pos[2]).toBe(-3.6)
  })

  it('uses stamina proportion, backward steps, and swing recovery in actual velocity', () => {
    const fresh = moving()
    const tired = { ...fresh, stamina: 5 }
    const equivalent = { ...fresh, stamina: 10, maxStamina: 200 }
    const recovery = { ...fresh, swing: { ...fresh.swing, phase: 'recovery' as const } }
    const swinging = { ...fresh, swing: { ...fresh.swing, phase: 'swinging' as const } }
    expect(speed(advance(tired, 0.5))).toBeLessThan(speed(advance(fresh, 0.5)))
    expect(speed(advance(tired, 0.5))).toBeCloseTo(speed(advance(equivalent, 0.5)))
    expect(speed(advance(moving(-1), 0.5))).toBeLessThan(speed(advance(fresh, 0.5)))
    const recovered = advance(recovery, 0.5)
    expect(speed(recovered)).toBeLessThan(speed(advance(fresh, 0.5)))
    expect(recovered.movement.footwork).toBe('recover')
    expect(recovered.movement.readiness).toBeLessThan(advance(fresh, 0.5).movement.readiness)
    expect(speed(advance(swinging, 0.5))).toBeLessThan(speed(advance(fresh, 0.5)))
    expect(advance(moving(-1), 0.5).movement.footwork).toBe('retreat')
  })

  it('distinguishes chasse, cross, and a forward lunge rather than always ready', () => {
    expect(advance(moving(0, 0.4), 0.5).movement.footwork).toBe('chasse')
    expect(advance(moving(0, 1), 0.5).movement.footwork).toBe('cross')
    const approaching = moving()
    approaching.pos[0] = -2.2
    expect(advance(approaching, 0.4).movement.footwork).toBe('lunge')
  })

  it('is symmetric for human/AI sides and does not use loadout as a movement bonus', () => {
    const home = advance(moving(1, 0.4), 0.5)
    const away = advance(moving(-1, -0.4, 1), 0.5)
    expect(home.pos[0]).toBeCloseTo(-away.pos[0])
    expect(home.pos[2]).toBeCloseTo(-away.pos[2])
    expect(home.movement.readiness).toBeCloseTo(away.movement.readiness)
    const power = { ...moving(), loadout: 'power' as const }
    expect(advance(power, 0.5).pos).toEqual(advance(moving(), 0.5).pos)
  })

  it('gives comparable movement and readiness at 30, 60, 144 Hz and a long frame', () => {
    const simulate = (fps: number) => {
      let player = advance(moving(), 0.5, fps)
      player = { ...player, movement: { ...player.movement, targetDir: { x: 0, z: 1 } } }
      player = advance(player, 0.5, fps)
      player = { ...player, movement: { ...player.movement, targetDir: { x: 0, z: 0 } } }
      return advance(player, 0.5, fps)
    }
    const reference = simulate(60)
    for (const fps of [30, 144]) {
      const result = simulate(fps)
      expect(Math.abs(result.pos[0] - reference.pos[0])).toBeLessThan(0.04)
      expect(Math.abs(result.pos[2] - reference.pos[2])).toBeLessThan(0.04)
      expect(Math.abs(result.movement.readiness - reference.movement.readiness)).toBeLessThan(0.03)
    }
    const longFrame = updateMovement(moving(), 0.5)
    const normal = advance(moving(), 0.5, 60)
    expect(longFrame.pos[0]).toBeCloseTo(normal.pos[0], 5)
    expect(longFrame.movement.readiness).toBeCloseTo(normal.movement.readiness, 5)
  })

  it.each([0, -1, NaN, Infinity])('ignores invalid/non-positive dt %s', dt => {
    const player = moving()
    expect(updateMovement(player, dt)).toBe(player)
    expect(updateStamina(player, dt)).toBe(player)
  })
})

describe('rally stamina balance', () => {
  it('supports sustained multi-shot rallies, but eventually exhausts sprinting', () => {
    const player = moving()
    player.movement.gait = 'sprint'
    player.movement.currentVel = { x: 6, z: 0 }
    const afterRally = updateStamina(player, 8)
    expect(afterRally.stamina).toBeGreaterThan(30)
    expect(afterRally.stamina).toBeLessThan(80)
    expect(updateStamina(player, 30).stamina).toBe(0)
  })

  it('caps rest recovery at the player maximum, not the config maximum', () => {
    const player = { ...createPlayer(0), stamina: 140, maxStamina: 150 }
    expect(updateStamina(player, 10).stamina).toBe(150)
    expect(updateStamina({ ...player, stamina: 35, maxStamina: 40 }, 10).stamina).toBe(40)
    expect(player.stamina).toBe(140)
  })

  it('does not replenish stamina while standing in active swing recovery', () => {
    const player = createPlayer(0)
    player.stamina = 30
    player.swing.phase = 'recovery'
    expect(updateStamina(player, 1).stamina).toBeLessThanOrEqual(30)
    player.swing.phase = 'ready'
    expect(updateStamina(player, 1).stamina).toBeGreaterThan(30)
  })

  it('drains slower movement less than sprinting and accumulates consistently across frames', () => {
    const player = moving()
    player.movement.gait = 'walk'
    player.movement.currentVel = { x: 2, z: 0 }
    const walking = updateStamina(player, 1)
    expect(walking.stamina).toBeLessThan(100)
    player.movement.gait = 'sprint'
    expect(updateStamina(player, 1).stamina).toBeLessThan(walking.stamina)
    let stepped = player
    for (let i = 0; i < 60; i++) stepped = updateStamina(stepped, 1 / 60)
    expect(stepped.stamina).toBeCloseTo(updateStamina(player, 1).stamina, 7)
  })

  it('scales fatigue smoothly relative to maxStamina without immobilizing an exhausted player', () => {
    expect(getSpeedMultiplier(0)).toBeGreaterThan(0)
    expect(getSpeedMultiplier(0)).toBeLessThan(getSpeedMultiplier(10))
    expect(getSpeedMultiplier(10)).toBeLessThan(getSpeedMultiplier(20))
    expect(getSpeedMultiplier(100)).toBe(1)
    expect(getSpeedMultiplier(10, DEFAULT_STAMINA, 200)).toBeCloseTo(getSpeedMultiplier(5))
  })
})
