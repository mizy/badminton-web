import { describe, expect, it } from 'vitest'
import { createPlayer } from '../game/playerFactory'
import { beginBodyAction, advanceBody } from './body'
import { createReachableRacketPose } from './racketKinematics'
import { updateMovement } from './movement'

function simulate(action: 'jump' | 'scissor', fps: number) {
  let player = beginBodyAction(createPlayer(0), action)
  let peak = 0
  for (let i = 0; i < fps * 2; i++) {
    player = advanceBody(player, 1 / fps)
    peak = Math.max(peak, player.pos[1])
  }
  return { player, peak }
}

describe('composable body actions', () => {
  it('loads, rises, falls, lands and recovers without a second airborne jump', () => {
    let player = beginBodyAction(createPlayer(0), 'jump')
    expect(player.body.phase).toBe('loading')
    player = advanceBody(player, 0.2)
    expect(player.body.phase).toBe('airborne')
    expect(player.pos[1]).toBeGreaterThan(0)
    expect(beginBodyAction(player, 'jump')).toBe(player)
    const result = simulate('jump', 120)
    expect(result.peak).toBeGreaterThan(0.5)
    expect(result.player.pos[1]).toBe(0)
    expect(result.player.body.phase).toBe('grounded')
    expect(result.player.stamina).toBeLessThan(100)
  })
  it('makes scissor a lower jump with a forward push and finite landing recovery', () => {
    const player = advanceBody(beginBodyAction(createPlayer(0), 'scissor'), 0.12)
    expect(player.movement.currentVel.x).toBeGreaterThan(0)
    expect(simulate('scissor', 120).peak).toBeLessThan(simulate('jump', 120).peak)
    const away = advanceBody(beginBodyAction(createPlayer(1), 'scissor'), 0.12)
    expect(away.movement.currentVel.x).toBeLessThan(0)
  })
  it('does not allow exhausted or recovering players to jump repeatedly', () => {
    const tired = { ...createPlayer(0), stamina: 2 }
    expect(beginBodyAction(tired, 'jump').body.phase).toBe('grounded')
    const recovering = { ...createPlayer(0), body: { phase: 'landing' as const, action: 'jump' as const, elapsed: 0, verticalVelocity: 0 } }
    expect(beginBodyAction(recovering, 'scissor')).toBe(recovering)
  })
  it('elevates the real contact volume instead of granting a named smash bonus', () => {
    const pose = (height: number) => createReachableRacketPose({ playerPos: [-3, height, 0], playerSide: 0, desiredContact: [-2.8, 3.1, 0.2], racketFaceDeg: -18 })
    expect(pose(0).reachable).toBe(false)
    expect(pose(0.65).reachable).toBe(true)
  })
  it('preserves airborne momentum rather than allowing instant lateral changes', () => {
    let player = advanceBody(beginBodyAction(createPlayer(0), 'jump'), 0.2)
    player.movement.currentVel = { x: 3, z: 0 }
    player.movement.targetDir = { x: -1, z: 0 }
    expect(updateMovement(player, 0.1).movement.currentVel.x).toBeGreaterThan(2)
  })
  it('has matching body trajectories at different frame rates', () => {
    const a = simulate('jump', 30)
    const b = simulate('jump', 120)
    expect(a.player.pos).toEqual(b.player.pos)
    expect(a.peak).toBeCloseTo(b.peak, 2)
  })
})
