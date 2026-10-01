import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIM_DEADZONE,
  AIM_LATERAL_SPAN,
  STICK_DEADZONE,
  TAP_CHARGE,
  TOUCH_AIM_HOLD_GRACE,
  aimFromDrag,
  clampStickOffset,
  createTouchControlsAdapter,
  isTouchDevice,
  moveVectorFromStick,
  swingReleaseAction,
  swingSelectAction,
  swingStartAction,
} from './touchControls'
import type { InputAdapter, InputEvent } from './types'

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
    expect(half.x).toBeCloseTo((0.5 - STICK_DEADZONE) / (1 - STICK_DEADZONE), 6)
    expect(half.z).toBe(0)
  })

  it('starts smoothly outside the dead zone without jumping to walking speed', () => {
    const justOutside = moveVectorFromStick(0, -RADIUS * (STICK_DEADZONE + 0.001), RADIUS, 0)!
    expect(justOutside.x).toBeGreaterThan(0)
    expect(justOutside.x).toBeLessThan(0.002)
    expect(moveVectorFromStick(0, -RADIUS * STICK_DEADZONE, RADIUS, 0)).toBeNull()
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

describe('touch stick pointer flow', () => {
  let host: EventTarget
  let doc: EventTarget & { hidden: boolean }
  let zone: EventTarget & {
    setPointerCapture: ReturnType<typeof vi.fn>
    hasPointerCapture: ReturnType<typeof vi.fn>
    releasePointerCapture: ReturnType<typeof vi.fn>
  }
  let stick: { clientWidth: number; dataset: Record<string, string>; style: Record<string, unknown> }
  let knob: { offsetWidth: number; style: Record<string, unknown> }
  let adapter: InputAdapter
  let events: InputEvent[]
  const pointers = new Set<number>()

  function pointer(type: string, x: number, y: number, id = 1, samples?: number[][]): void {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: x, clientY: y })
    if (samples) Object.assign(event, {
      getCoalescedEvents: () => samples.map(([clientX, clientY]) => ({ clientX, clientY })),
    })
    zone.dispatchEvent(event)
  }

  beforeEach(() => {
    host = new EventTarget()
    doc = Object.assign(new EventTarget(), { hidden: false })
    vi.stubGlobal('window', host)
    vi.stubGlobal('document', doc)
    pointers.clear()
    zone = Object.assign(new EventTarget(), {
      setPointerCapture: vi.fn((id: number) => { pointers.add(id) }),
      hasPointerCapture: vi.fn((id: number) => pointers.has(id)),
      releasePointerCapture: vi.fn((id: number) => { pointers.delete(id) }),
    })
    const style = () => {
      const properties: Record<string, unknown> = {}
      properties.setProperty = (key: string, value: string) => { properties[key] = value }
      properties.removeProperty = (key: string) => { delete properties[key] }
      return properties
    }
    stick = { clientWidth: 120, dataset: {}, style: style() }
    knob = { offsetWidth: 48, style: style() }
    const nodes = { '[data-touch="stick-zone"]': zone, '[data-touch="stick"]': stick, '[data-touch="stick-knob"]': knob }
    const root = {
      querySelector: (selector: string) => nodes[selector as keyof typeof nodes] ?? null,
      querySelectorAll: () => [],
    } as unknown as HTMLElement
    events = []
    adapter = createTouchControlsAdapter(0, { root })
    adapter.connect(event => events.push(event))
  })

  afterEach(() => {
    adapter.disconnect()
    vi.unstubAllGlobals()
  })

  it('starts neutral at the finger and keeps analog movement outside the activation zone', () => {
    pointer('pointerdown', 8, 824)
    expect(events).toEqual([])
    expect(zone.setPointerCapture).toHaveBeenCalledWith(1)
    expect(stick.style.left).toBe('8px')
    expect(stick.style.top).toBe('824px')
    pointer('pointermove', 8, 816)
    const slow = events.at(-1)?.action
    expect(slow?.type).toBe('MOVE')
    if (slow?.type === 'MOVE') expect(slow.dir.x).toBeGreaterThan(0)
    if (slow?.type === 'MOVE') expect(slow.dir.x).toBeLessThan(0.25)
    pointer('pointermove', 8, 400)
    expect(events.at(-1)?.action).toEqual({ type: 'MOVE', dir: { x: 1, z: 0 } })
    expect(knob.style.transform).toBe('translate(0px, -36px)')
    pointer('pointermove', 8, 436)
    expect(events.at(-1)?.action).toEqual({ type: 'STOP_MOVE' })
    pointer('pointermove', 8, 472)
    expect(events.at(-1)?.action).toEqual({ type: 'MOVE', dir: { x: -1, z: 0 } })
  })

  it('follows the same curved path when the browser coalesces pointer samples', () => {
    pointer('pointerdown', 80, 700)
    pointer('pointermove', 130, 700)
    pointer('pointermove', 130, 650)
    const direction = events.at(-1)?.action
    const center = { left: stick.style.left, top: stick.style.top }
    pointer('pointerup', 130, 650)
    pointer('pointerdown', 80, 700)
    pointer('pointermove', 130, 650, 1, [[130, 700], [130, 650]])
    expect(events.at(-1)?.action).toEqual(direction)
    expect(parseFloat(String(stick.style.left))).toBeCloseTo(parseFloat(String(center.left)), 6)
    expect(parseFloat(String(stick.style.top))).toBeCloseTo(parseFloat(String(center.top)), 6)
  })

  it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'resize', 'orientationchange', 'visibilitychange', 'disconnect'])(
    'resets once on %s, releases capture and ignores stale movement', reason => {
      pointer('pointerdown', 80, 700)
      pointer('pointermove', 80, 640)
      if (reason === 'lostpointercapture') pointers.delete(1)
      if (reason.startsWith('pointer') || reason === 'lostpointercapture') pointer(reason, 80, 640)
      else if (reason === 'disconnect') adapter.disconnect()
      else if (reason === 'visibilitychange') {
        doc.hidden = true
        doc.dispatchEvent(new Event(reason))
      } else host.dispatchEvent(new Event(reason))
      expect(events.at(-1)?.action).toEqual({ type: 'STOP_MOVE' })
      expect(stick.dataset.active).toBeUndefined()
      expect(stick.style.left).toBeUndefined()
      expect(stick.style.top).toBeUndefined()
      expect(knob.style.transform).toBe('translate(0px, 0px)')
      expect(pointers.size).toBe(0)
      expect(events.filter(event => event.action.type === 'STOP_MOVE')).toHaveLength(1)
      const count = events.length
      pointer('pointermove', 80, 610)
      pointer('pointerup', 80, 610)
      expect(events).toHaveLength(count)
      if (reason === 'disconnect') adapter.connect(event => events.push(event))
      doc.hidden = false
      pointer('pointerdown', 100, 700, 2)
      pointer('pointermove', 136, 700, 2)
      expect(events.at(-1)?.action).toEqual({ type: 'MOVE', dir: { x: 0, z: 1 } })
    },
  )

  it('keeps the first finger as owner while another finger touches or lifts', () => {
    pointer('pointerdown', 80, 700)
    pointer('pointermove', 80, 664)
    const count = events.length
    pointer('pointerdown', 120, 720, 2)
    pointer('pointermove', 140, 720, 2)
    pointer('pointerup', 140, 720, 2)
    expect(events).toHaveLength(count)
    expect(stick.dataset.active).toBe('true')
    pointer('pointerup', 80, 664)
    expect(events.at(-1)?.action).toEqual({ type: 'STOP_MOVE' })
  })
})
