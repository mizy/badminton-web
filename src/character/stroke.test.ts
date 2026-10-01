import { describe, expect, it } from 'vitest'
import { createPlayer } from '../game/playerFactory'
import { advanceSwing, beginSwing, canPlayShot, CHARGE, getShotTarget, RACKETS, releaseSwing } from './stroke'

describe('charged strokes', () => {
  it('holds the windup while charging and strikes only on release', () => {
    let player = beginSwing(createPlayer(0))
    expect(player.swing.phase).toBe('preparing')
    player = advanceSwing(player, 0.13)
    expect(player.swing.phase).toBe('preparing')
    expect(beginSwing(player)).toBe(player)
    player = releaseSwing(player)
    expect(player.swing.phase).toBe('swinging')
    expect(player.swing.charge01).toBeGreaterThan(0.15)
    let struck = advanceSwing(player, 0.23)
    expect(struck.swing.phase).toBe('recovery')
    expect(struck.feedback).toContain('挥空')
    struck = advanceSwing(struck, 0.5)
    expect(struck.swing.phase).toBe('ready')
    expect(struck.wantsToSwing).toBe(false)
    const tapped = releaseSwing(beginSwing(createPlayer(0)))
    expect(tapped.swing.charge01).toBe(0)
  })
  it('caps a full hold by auto-striking without extra penalty', () => {
    let player = beginSwing(createPlayer(0))
    for (let i = 0; i < 120; i++) player = advanceSwing(player, 1 / 120)
    expect(player.swing.phase).not.toBe('preparing')
    expect(player.swing.charge01).toBe(1)
  })
  it('holds the aim open for the given grace, then still auto-strikes', () => {
    const grace = 1.6
    let player = beginSwing(createPlayer(0), grace)
    expect(player.swing.holdLimit).toBeCloseTo(RACKETS.balanced.preparation + CHARGE.max + grace, 6)
    player = advanceSwing(player, 0.6)
    expect(player.swing.phase).toBe('preparing')
    player = advanceSwing(player, grace + CHARGE.max)
    expect(player.swing.phase).not.toBe('preparing')
    expect(player.swing.charge01).toBe(1)
  })
  it('charges depth only within the played shot range', () => {
    const player = createPlayer(0)
    const holdFull = { ...beginSwing(player).swing, elapsed: CHARGE.max }
    const netCharged = releaseSwing({ ...player, selectedShot: 'NET_DROP', swing: holdFull })
    expect(netCharged.swing.aim.depth).toBe(1)
    expect(getShotTarget(netCharged, 'NET_DROP', netCharged.swing.aim)[0]).toBeLessThan(1.6)
    const shallowClear = { ...beginSwing(player).swing, elapsed: CHARGE.max, aim: { lateral: 0 as const, depth: -1 } }
    const deep = releaseSwing({ ...player, selectedShot: 'CLEAR', aim: { lateral: 0, depth: -1 }, swing: shallowClear })
    expect(deep.swing.aim.depth).toBeCloseTo(0.2, 5)
  })
  it('distinguishes six shot uses and maps aiming after changing ends', () => {
    const player = createPlayer(0)
    const clear = getShotTarget(player, 'CLEAR', { lateral: 1, depth: 0 })
    const drop = getShotTarget(player, 'DROP', { lateral: 1, depth: 0 })
    expect(clear[0]).toBeGreaterThan(drop[0])
    expect(clear[2]).toBeGreaterThan(0)
    player.side = 1
    expect(getShotTarget(player, 'CLEAR', { lateral: 1, depth: 0 })).toEqual([-clear[0], 0, -clear[2]])
    // 连续落点越界时钳在单打边线内侧（横向 1.2 × 1.85 ≈ 2.22 m）。
    expect(getShotTarget(player, 'CLEAR', { lateral: 3, depth: 0 })[2]).toBeCloseTo(-2.22, 6)
    expect(canPlayShot('SMASH', [-3, 0.8, 0])).toBe(false)
    expect(canPlayShot('NET_DROP', [-5, 1, 0])).toBe(false)
    expect(canPlayShot('LIFT', [-3, 0.8, 0])).toBe(true)
  })
  it('makes heavier swingweight trade preparation for power', () => {
    expect(RACKETS.power.preparation).toBeGreaterThan(RACKETS.control.preparation)
    expect(RACKETS.power.power).toBeGreaterThan(RACKETS.control.power)
  })
})
