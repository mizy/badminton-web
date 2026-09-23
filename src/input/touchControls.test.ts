import { describe, expect, it } from 'vitest'
import {
  AIM_DEADZONE,
  STICK_DEADZONE,
  aimFromDrag,
  clampStickOffset,
  isTouchDevice,
  moveVectorFromStick,
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
  it('returns neutral aim inside the dead zone', () => {
    expect(aimFromDrag(0, 0, RADIUS)).toEqual({ lateral: 0, depth: 0 })
    expect(aimFromDrag(RADIUS * AIM_DEADZONE * 0.5, -RADIUS * AIM_DEADZONE * 0.5, RADIUS))
      .toEqual({ lateral: 0, depth: 0 })
  })

  it('maps drag right/left to lateral and up/down to depth', () => {
    expect(aimFromDrag(RADIUS, 0, RADIUS)).toEqual({ lateral: 1, depth: 0 })
    expect(aimFromDrag(-RADIUS, 0, RADIUS)).toEqual({ lateral: -1, depth: 0 })
    expect(aimFromDrag(0, -RADIUS, RADIUS)).toEqual({ lateral: 0, depth: 1 })
    expect(aimFromDrag(0, RADIUS, RADIUS)).toEqual({ lateral: 0, depth: -1 })
  })

  it('combines both axes for corner drags', () => {
    expect(aimFromDrag(-RADIUS, -RADIUS, RADIUS)).toEqual({ lateral: -1, depth: 1 })
    expect(aimFromDrag(RADIUS, RADIUS, RADIUS)).toEqual({ lateral: 1, depth: -1 })
  })

  it('degrades to neutral aim on a zero radius', () => {
    expect(aimFromDrag(40, -40, 0)).toEqual({ lateral: 0, depth: 0 })
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

describe('swingStartAction', () => {
  it('carries the held shot and the current aim', () => {
    expect(swingStartAction('SMASH', { lateral: 1, depth: -1 })).toEqual({
      type: 'SWING_START',
      shot: 'SMASH',
      slice: false,
      aim: { lateral: 1, depth: -1 },
    })
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
