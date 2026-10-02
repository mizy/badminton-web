import { describe, expect, it } from 'vitest'
import { createPlayer } from '../game/playerFactory'
import { advanceSwing, beginSwing, getShotTarget, releaseSwing, resolveDirectionalShot } from './stroke'
import type { ShotDirection } from './shotSynthesis'

function player(direction: ShotDirection, x = -1.7) {
  const p = beginSwing(createPlayer(0), 0, direction)
  p.pos = [x, 0, 0]
  return p
}

describe('direction, contact height and power', () => {
  it('turns light overhead down strokes into drops and strong ones into smashes', () => {
    const p = player('down')
    expect(resolveDirectionalShot(p, [-1.1, 2.3, 0], 0.1)).toBe('DROP')
    expect(resolveDirectionalShot(p, [-1.1, 2.3, 0], 0.9)).toBe('SMASH')
  })
  it('uses gentle net touches and strong lifts at a low contact', () => {
    const p = player('up')
    expect(resolveDirectionalShot(p, [-1.1, 0.9, 0], 0.1)).toBe('NET_DROP')
    expect(resolveDirectionalShot(p, [-1.1, 0.9, 0], 0.9)).toBe('LIFT')
    expect(resolveDirectionalShot(p, [-1.1, 2.2, 0], 0.9)).toBe('CLEAR')
  })
  it('keeps flat strokes usable at chest and overhead height', () => {
    const p = player('flat')
    expect(resolveDirectionalShot(p, [-1.1, 1.6, 0], 0.2)).toBe('DRIVE')
    expect(resolveDirectionalShot(p, [-1.1, 2.3, 0], 0.9)).toBe('DRIVE')
  })
  it.each(['up', 'down', 'flat'] as const)('%s keeps charging at the cap and strikes on release', direction => {
    const p = advanceSwing(player(direction), 2.7)
    expect(p.swing.phase).toBe('preparing')
    const struck = releaseSwing(p)
    expect(struck.swing.phase).toBe('swinging')
    expect(struck.swing.charge01).toBe(1)
  })
  it.each(['SMASH', 'DRIVE', 'LIFT'] as const)('%s power changes depth rather than requiring another shot button', shot => {
    const direction = shot === 'SMASH' ? 'down' : shot === 'DRIVE' ? 'flat' : 'up'
    const p = player(direction)
    p.swing.phase = 'swinging'
    p.swing.charge01 = 0.4
    const near = getShotTarget(p, shot, { lateral: 0, depth: 0 })
    p.swing.charge01 = 0.95
    const far = getShotTarget(p, shot, { lateral: 0, depth: 0 })
    expect(far[0] - near[0]).toBeGreaterThan(2)
    expect(far[0]).toBeLessThan(6.7)
  })
})
