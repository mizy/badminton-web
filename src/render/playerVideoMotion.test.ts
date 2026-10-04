import { describe, expect, it } from 'vitest'
import { createPlayer } from '../game/playerFactory'
import { selectVideoMotion } from './playerVideoMotion'

describe('game video motion selection', () => {
  it('selects all eight clips from movement, corner and recovery side', () => {
    const player = createPlayer(0)
    expect(selectVideoMotion(player, null)).toBeNull()
    player.movement.currentVel = { x: 2, z: 1 }
    player.movement.footwork = 'start'
    expect(selectVideoMotion(player, null)).toBe('ready-start')
    player.movement.footwork = 'cross'
    player.movement.footworkPoint = 'mid-left'
    expect(selectVideoMotion(player, null)).toBe('cross-approach')
    for (const [point, expected] of [['front-right', 'front-forehand'], ['front-left', 'front-backhand'],
      ['back-right', 'rear-forehand'], ['back-left', 'rear-backhand']] as const) {
      player.movement.currentVel.x = point.startsWith('front') ? 2 : -2
      player.movement.footwork = point.startsWith('front') ? 'lunge' : 'cross'
      player.movement.footworkPoint = point
      expect(selectVideoMotion(player, null)).toBe(expected)
      player.movement.footwork = 'recover'
      expect(selectVideoMotion(player, expected)).toBe(point.endsWith('left') ? 'backhand-recover' : 'forehand-recover')
    }
  })
  it.each([0, 1] as const)('recovers toward centre on both court sides before the corner label changes (%s)', side => {
    const player = createPlayer(side)
    player.movement.footwork = 'cross'
    player.movement.footworkPoint = 'front-left'
    player.movement.currentVel = { x: side === 0 ? -2 : 2, z: 0 }
    expect(selectVideoMotion(player, 'front-backhand')).toBe('backhand-recover')
    player.movement.footworkPoint = 'back-right'
    player.movement.currentVel.x *= -1
    expect(selectVideoMotion(player, 'rear-forehand')).toBe('forehand-recover')
  })
})
