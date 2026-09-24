import { describe, expect, it } from 'vitest'
import {
  AIM_DEADZONE,
  AIM_LATERAL_SPAN,
  STICK_DEADZONE,
  TAP_CHARGE,
  TOUCH_AIM_HOLD_GRACE,
  aimFromDrag,
  clampStickOffset,
  isTouchDevice,
  moveVectorFromStick,
  swingReleaseAction,
  swingSelectAction,
  swingStartAction,
} from './touchControls'

const RADIUS = 50

describe('moveVectorFromStick', () => {
  it('ignores input inside the dead zone', () => {
    expect(moveVectorFromStick(0, 0, RADIUS, 0)).toBeNull()
    expect(moveVectorFromStick(RADIUS * STICK_DEADZONE * 0.9, 0, RADIUS, 0)).toBeNull()
  })

  it('maps up to forward and mirrors on the far side', () => {
    expect(moveVectorFromStick(0, -RADIUS, RADIUS, 0)).toEqual({ x: 1, z: 0 })
    expect(moveVectorFromStick(0, -RADIUS, RADIUS, 1)).toEqual({ x: -1, z: 0 })
  })

  it('maps right to the player right and mirrors on the far side', () => {
    expect(moveVectorFromStick(RADIUS, 0, RADIUS, 0)).toEqual({ x: 0, z: 1 })
    expect(moveVectorFromStick(RADIUS, 0, RADIUS, 1)).toEqual({ x: 0, z: -1 })
  })

  it('keeps a finite unit-ish vector on diagonals and clamps overshoot', () => {
    const inside = moveVectorFromStick(RADIUS, -RADIUS, RADIUS, 0)!
    expect(Math.hypot(inside.x, inside.z)).toBeCloseTo(1, 6)
    const overshoot = moveVectorFromStick(RADIUS * 3, -RADIUS * 4, RADIUS, 0)!
    expect(Math.hypot(overshoot.x, overshoot.z)).toBeCloseTo(1, 6)
    expect(overshoot.x).toBeGreaterThan(0)
    expect(overshoot.z).toBeGreaterThan(0)
  })

  it('preserves analog magnitude for partial pushes', () => {
    const half = moveVectorFromStick(0, -RADIUS * 0.5, RADIUS, 0)!
    expect(half.x).toBeCloseTo(0.5, 6)
    expect(half.z).toBe(0)
  })

  it('stays safe on a degenerate radius or bad input', () => {
    expect(moveVectorFromStick(10, 10, 0, 0)).toBeNull()
    expect(moveVectorFromStick(Number.NaN, 10, RADIUS, 0)).toBeNull()
  })
})

describe('aimFromDrag', () => {
  it('没位移就是默认落点：中路、标准深度', () => {
    expect(aimFromDrag(0, 0, RADIUS)).toEqual({ lateral: 0, depth: 0 })
  })

  it('横向落点连续：死区内中路，拖满一格到 ±1，中间有中间值', () => {
    expect(aimFromDrag(RADIUS * 1.1, 0, RADIUS).lateral).toBe(1)
    expect(aimFromDrag(-RADIUS * 1.1, 0, RADIUS).lateral).toBe(-1)
    expect(aimFromDrag(RADIUS * AIM_DEADZONE * 0.5, 0, RADIUS).lateral).toBe(0)
    const mid = aimFromDrag(RADIUS * (AIM_DEADZONE + AIM_LATERAL_SPAN) / 2, 0, RADIUS).lateral
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('往上拖落点更深，往下拖不主动打得更浅', () => {
    expect(aimFromDrag(0, -RADIUS * 0.5, RADIUS).depth).toBeCloseTo(0.5, 6)
    expect(aimFromDrag(0, -RADIUS * 3, RADIUS).depth).toBe(1)
    expect(aimFromDrag(0, RADIUS * 2, RADIUS).depth).toBe(0)
  })

  it('横向与纵深互不干扰', () => {
    const corner = aimFromDrag(RADIUS, -RADIUS, RADIUS)
    expect(corner.lateral).toBe(1)
    expect(corner.depth).toBe(1)
  })

  it('拖动单位退化或输入异常时退回默认落点', () => {
    expect(aimFromDrag(40, -40, 0)).toEqual({ lateral: 0, depth: 0 })
    expect(aimFromDrag(Number.NaN, -40, RADIUS)).toEqual({ lateral: 0, depth: 0 })
  })
})

describe('clampStickOffset', () => {
  it('passes through offsets inside the base radius', () => {
    expect(clampStickOffset(10, -20, RADIUS)).toEqual({ x: 10, y: -20 })
  })

  it('clamps overshoot onto the ring while keeping the direction', () => {
    const clamped = clampStickOffset(300, 400, RADIUS)
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(RADIUS, 6)
    expect(clamped.x).toBeGreaterThan(0)
    expect(clamped.y).toBeGreaterThan(0)
  })

  it('returns the origin for invalid input', () => {
    expect(clampStickOffset(5, 5, 0)).toEqual({ x: 0, y: 0 })
    expect(clampStickOffset(Number.NaN, 5, RADIUS)).toEqual({ x: 0, y: 0 })
  })
})

describe('挥拍动作构造', () => {
  it('按下球路键即带着落点开始蓄力，并带上触屏瞄准宽限', () => {
    expect(swingStartAction('SMASH', { lateral: 1, depth: 0 })).toEqual({
      type: 'SWING_START',
      shot: 'SMASH',
      slice: false,
      aim: { lateral: 1, depth: 0 },
      holdGrace: TOUCH_AIM_HOLD_GRACE,
    })
    expect(swingStartAction('SMASH', { lateral: 0, depth: 0 }, 0)).toEqual({
      type: 'SWING_START',
      shot: 'SMASH',
      slice: false,
      aim: { lateral: 0, depth: 0 },
      holdGrace: 0,
    })
  })

  it('拖动中只改落点，走独立的 SWING_SELECT', () => {
    expect(swingSelectAction('CLEAR', { lateral: -1, depth: 0 })).toEqual({
      type: 'SWING_SELECT',
      shot: 'CLEAR',
      aim: { lateral: -1, depth: 0 },
    })
  })

  it('短按出招用点按力量，长按交给蓄力（下限 0）', () => {
    expect(swingReleaseAction(true)).toEqual({ type: 'SWING_RELEASE', minimumCharge: TAP_CHARGE })
    expect(swingReleaseAction(false)).toEqual({ type: 'SWING_RELEASE', minimumCharge: 0 })
  })
})

describe('isTouchDevice', () => {
  it('treats coarse pointers as touch first', () => {
    expect(isTouchDevice({ matchMedia: query => ({ matches: query === '(pointer: coarse)' }) })).toBe(true)
  })

  it('falls back to ontouchstart and defaults to keyboard on desktop', () => {
    expect(isTouchDevice({ ontouchstart: null })).toBe(true)
    expect(isTouchDevice({ matchMedia: () => ({ matches: false }) })).toBe(false)
    expect(isTouchDevice(null)).toBe(false)
  })
})
