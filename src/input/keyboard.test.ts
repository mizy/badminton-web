import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createKeyboardAdapter } from './keyboard'
import type { InputAdapter, InputEvent } from './types'
import { connectPlayHotkeys } from '../play/hotkeys'
import { createGameCamera, getCameraMode, toggleCameraMode, updateCamera } from '../render/camera'

class FakeWindow extends EventTarget {
  innerWidth = 1280
  innerHeight = 720
}

class FakeDocument extends EventTarget {
  hidden = false
  visibilityState = 'visible'
  activeElement: unknown = null
}

let host: FakeWindow
let doc: FakeDocument
let events: InputEvent[]
let adapter: InputAdapter
let cleanups: (() => void)[]

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, { code, repeat })
  host.dispatchEvent(event)
  return event
}

function tap(code: string) {
  key('keydown', code)
  key('keyup', code)
}

function lastAction() {
  return events.at(-1)?.action
}

beforeEach(() => {
  host = new FakeWindow()
  doc = new FakeDocument()
  events = []
  cleanups = []
  vi.stubGlobal('window', host)
  vi.stubGlobal('document', doc)
  adapter = createKeyboardAdapter()
  adapter.connect(event => events.push(event))
})

afterEach(() => {
  adapter.disconnect()
  cleanups.forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('keyboard court-relative controls', () => {
  it.each([
    ['KeyW', 1, 0], ['KeyS', -1, 0], ['KeyD', 0, 1], ['KeyA', 0, -1],
  ])('maps %s toward the net or screen direction on either side', (code, x, z) => {
    key('keydown', code as string)
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x, z } })
    adapter.disconnect()
    adapter = createKeyboardAdapter(1)
    adapter.connect(event => events.push(event))
    key('keydown', code as string)
    const action = lastAction()
    expect(action?.type).toBe('MOVE')
    if (action?.type === 'MOVE') {
      expect(action.dir.x).toBeCloseTo(-Number(x))
      expect(action.dir.z).toBeCloseTo(-Number(z))
    }
    expect(events.at(-1)?.playerIndex).toBe(1)
  })

  it('normalizes diagonals and cancels opposing keys', () => {
    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    const diagonal = lastAction()
    expect(diagonal?.type).toBe('MOVE')
    if (diagonal?.type === 'MOVE') {
      expect(diagonal.dir.x).toBeCloseTo(Math.SQRT1_2)
      expect(diagonal.dir.z).toBeCloseTo(Math.SQRT1_2)
      expect(Math.hypot(diagonal.dir.x, diagonal.dir.z)).toBeCloseTo(1)
    }
    key('keydown', 'KeyS')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: 0, z: 1 } })
    key('keydown', 'KeyA')
    expect(lastAction()).toEqual({ type: 'STOP_MOVE' })
    key('keyup', 'KeyW')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: -1, z: 0 } })
  })

  it('samples WASD as the shot target at the swing edge without moving the right hand', () => {
    key('keydown', 'KeyW')
    key('keydown', 'KeyA')
    key('keydown', 'KeyL')
    expect(events.at(-1)?.action).toEqual({ type: 'SWING_START', direction: 'down', slice: false, aim: { lateral: -1, depth: 1 } })
    key('keyup', 'KeyL')
    key('keyup', 'KeyW')
    key('keyup', 'KeyA')
    tap('KeyJ')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'up', slice: false, aim: { lateral: 0, depth: 0 } })
    adapter.disconnect()
    adapter = createKeyboardAdapter(1)
    adapter.connect(event => events.push(event))
    key('keydown', 'KeyD')
    key('keydown', 'Digit3')
    expect(events.at(-1)?.action).toEqual({ type: 'SWING_START', direction: 'down', slice: false, aim: { lateral: 1, depth: 0 } })
  })

  it('keeps custom keymaps and resolves the side on each new input', () => {
    adapter.disconnect()
    let side: 0 | 1 = 0
    adapter = createKeyboardAdapter(0, {
      moveUp: 'KeyI', moveDown: 'KeyK', moveLeft: 'KeyU', moveRight: 'KeyO',
      serve: 'Enter', swing: 'KeyH', pause: 'Escape',
    }, () => side)
    adapter.connect(event => events.push(event))
    tap('KeyI')
    side = 1
    key('keydown', 'KeyI')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: -1, z: 0 } })
    key('keyup', 'KeyI')
    expect(events.at(-1)?.playerIndex).toBe(0)
    tap('Enter')
    expect(lastAction()).toEqual({ type: 'SERVE_OR_JUMP' })
    expect(events.some(event => event.action.type === 'SWING_START')).toBe(false)
    key('keydown', 'ShiftRight')
    tap('KeyH')
    expect(events.at(-2)?.action).toMatchObject({ type: 'SWING_START', direction: 'up', slice: true, aim: { lateral: 0, depth: 0 } })
    expect(lastAction()).toEqual({ type: 'SWING_RELEASE' })
    tap('KeyJ')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', shot: 'CLEAR', slice: true, aim: { lateral: 0, depth: 0 } })
  })

  it.each([
    ['KeyJ', 'up'], ['Digit1', 'up'], ['KeyK', 'flat'], ['Digit2', 'flat'], ['KeyL', 'down'], ['Digit3', 'down'],
  ])('starts the %s direction as %s once per press and pairs the release', (code, direction) => {
    key('keydown', code)
    key('keydown', code, true)
    key('keydown', code)
    key('keyup', code)
    key('keyup', code)
    expect(events.map(event => event.action)).toEqual([
      { type: 'SWING_START', direction, slice: false, aim: { lateral: 0, depth: 0 } }, { type: 'SWING_RELEASE' },
    ])
    tap(code)
    expect(events).toHaveLength(4)
  })

  it('always makes J the high direction, not a repeat of the last direction', () => {
    tap('KeyL')
    tap('KeyJ')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'up', slice: false, aim: { lateral: 0, depth: 0 } })
  })

  it.each(['Space', 'KeyQ', 'Escape'])('does not autorepeat %s', code => {
    key('keydown', code, true)
    expect(events).toHaveLength(0)
    key('keydown', code)
    key('keydown', code, true)
    key('keydown', code)
    key('keyup', code)
    expect(events).toHaveLength(1)
    expect(lastAction()).toEqual({ type: code === 'Space' ? 'SERVE_OR_JUMP' : code === 'KeyQ' ? 'SCISSOR_STEP' : 'PAUSE' })
  })

  it.each([
    ['Space', 'SERVE_OR_JUMP'], ['KeyQ', 'SCISSOR_STEP'],
  ])('allows %s followed by L before releasing the body-action key', (code, type) => {
    key('keydown', code)
    tap('KeyL')
    key('keyup', code)
    expect(events.map(event => event.action)).toEqual([
      { type }, { type: 'SWING_START', direction: 'down', slice: false, aim: { lateral: 0, depth: 0 } }, { type: 'SWING_RELEASE' },
    ])
  })

  it.each(['ShiftLeft', 'ShiftRight'])('uses %s only as a slice modifier for letters and numbers', shift => {
    key('keydown', shift)
    key('keydown', shift, true)
    expect(events).toHaveLength(0)
    for (const code of ['KeyJ', 'KeyK', 'KeyL', 'Digit1', 'Digit2', 'Digit3']) {
      tap(code)
      expect(events.at(-2)?.action).toMatchObject({ type: 'SWING_START', slice: true, aim: { lateral: 0, depth: 0 } })
      expect(lastAction()).toEqual({ type: 'SWING_RELEASE' })
    }
    const count = events.length
    key('keyup', shift)
    expect(events).toHaveLength(count)
    tap('KeyJ')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'up', slice: false, aim: { lateral: 0, depth: 0 } })
  })

  it('keeps slicing until both Shift keys are released and samples it on the swing edge', () => {
    key('keydown', 'ShiftLeft')
    key('keydown', 'ShiftRight')
    key('keyup', 'ShiftLeft')
    key('keydown', 'KeyK')
    expect(lastAction()).toEqual({ type: 'SWING_START', direction: 'flat', slice: true, aim: { lateral: 0, depth: 0 } })
    key('keyup', 'ShiftRight')
    expect(events).toHaveLength(1)
    key('keyup', 'KeyK')
    tap('KeyK')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'flat', slice: false, aim: { lateral: 0, depth: 0 } })
  })

  it('pairs overlapping swing keys independently', () => {
    key('keydown', 'KeyK')
    key('keydown', 'Digit3')
    key('keyup', 'KeyK')
    key('keyup', 'Digit3')
    expect(events.map(event => event.action.type)).toEqual(['SWING_START', 'SWING_START', 'SWING_RELEASE', 'SWING_RELEASE'])
  })

  it('persists both aim axes across releases and resets them with X', () => {
    tap('ArrowRight')
    tap('ArrowUp')
    expect(lastAction()).toEqual({ type: 'AIM', aim: { lateral: 1, depth: 1 } })
    tap('KeyJ')
    tap('ArrowLeft')
    expect(lastAction()).toEqual({ type: 'AIM', aim: { lateral: -1, depth: 1 } })
    tap('ArrowDown')
    expect(lastAction()).toEqual({ type: 'AIM', aim: { lateral: -1, depth: -1 } })
    tap('KeyX')
    expect(lastAction()).toEqual({ type: 'AIM', aim: { lateral: 0, depth: 0 } })
    expect(events[0].action).toEqual({ type: 'AIM', aim: { lateral: 1, depth: 0 } })
  })

  it.each(['input', 'select', 'textarea', 'contenteditable'])('ignores %s focus without cancelling browser keys', kind => {
    doc.activeElement = {
      isContentEditable: kind === 'contenteditable',
      closest: (selector: string) => selector.includes(kind) ? {} : null,
    }
    for (const code of ['KeyW', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'Space', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'Escape', 'Digit3', 'ArrowUp']) {
      expect(key('keydown', code).defaultPrevented).toBe(false)
      key('keyup', code)
    }
    expect(events).toHaveLength(0)
  })

  it('clears held movement on focus entering an editor', () => {
    key('keydown', 'KeyW')
    doc.activeElement = { isContentEditable: true }
    host.dispatchEvent(new Event('focusin'))
    expect(lastAction()).toEqual({ type: 'STOP_MOVE' })
    doc.activeElement = null
    key('keydown', 'KeyD')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: 0, z: 1 } })
  })

  it.each(['blur', 'visibilitychange', 'focusin'])('clears held keys and both Shifts on %s without losing aim', reason => {
    tap('ArrowUp')
    key('keydown', 'KeyW')
    key('keydown', 'ShiftLeft')
    key('keydown', 'ShiftRight')
    key('keydown', 'KeyK')
    key('keydown', 'Digit3')
    if (reason === 'blur') host.dispatchEvent(new Event('blur'))
    else if (reason === 'focusin') {
      doc.activeElement = { isContentEditable: true }
      host.dispatchEvent(new Event('focusin'))
      doc.activeElement = null
    } else {
      doc.hidden = true
      doc.visibilityState = 'hidden'
      doc.dispatchEvent(new Event('visibilitychange'))
      doc.hidden = false
      doc.visibilityState = 'visible'
    }
    expect(lastAction()).toEqual({ type: 'STOP_MOVE' })
    expect(events.filter(event => event.action.type === 'SWING_RELEASE')).toHaveLength(2)
    key('keyup', 'KeyK')
    key('keyup', 'Digit3')
    expect(events.filter(event => event.action.type === 'SWING_RELEASE')).toHaveLength(2)
    key('keydown', 'KeyD')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: 0, z: 1 } })
    tap('ArrowLeft')
    expect(lastAction()).toEqual({ type: 'AIM', aim: { lateral: -1, depth: 1 } })
    tap('KeyK')
    // 按键瞬间 KeyD 仍按住：WASD 采样覆盖箭头，右路即瞄 lateral 1
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'flat', slice: false, aim: { lateral: 1, depth: 0 } })
  })

  it('does not turn a remapped movement key into a swing or release on blur', () => {
    adapter.disconnect()
    adapter = createKeyboardAdapter(0, {
      moveUp: 'KeyJ', moveDown: 'KeyK', moveLeft: 'KeyQ', moveRight: 'KeyL',
      serve: 'Space', swing: 'KeyJ', pause: 'Escape',
    })
    adapter.connect(event => events.push(event))
    events = []
    for (const code of ['KeyJ', 'KeyK', 'KeyQ', 'KeyL']) tap(code)
    key('keydown', 'KeyJ')
    host.dispatchEvent(new Event('blur'))
    expect(events.every(event => event.action.type === 'MOVE' || event.action.type === 'STOP_MOVE')).toBe(true)
  })

  it('clears the slice modifier and swing on disconnect before reconnecting', () => {
    key('keydown', 'ShiftLeft')
    key('keydown', 'ShiftRight')
    key('keydown', 'KeyL')
    adapter.disconnect()
    expect(events.slice(-2).map(event => event.action.type)).toEqual(['SWING_RELEASE', 'STOP_MOVE'])
    adapter.connect(event => events.push(event))
    tap('KeyL')
    expect(events.at(-2)?.action).toEqual({ type: 'SWING_START', direction: 'down', slice: false, aim: { lateral: 0, depth: 0 } })
  })

  it('installs no interval, disconnects every listener, and reconnects cleanly', () => {
    adapter.disconnect()
    const interval = vi.spyOn(globalThis, 'setInterval')
    adapter.connect(event => events.push(event))
    expect(interval).not.toHaveBeenCalled()
    key('keydown', 'KeyW')
    adapter.disconnect()
    expect(lastAction()).toEqual({ type: 'STOP_MOVE' })
    const count = events.length
    tap('Space')
    host.dispatchEvent(new Event('blur'))
    doc.hidden = true
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(events).toHaveLength(count)
    adapter.connect(event => events.push(event))
    key('keydown', 'KeyD')
    expect(lastAction()).toEqual({ type: 'MOVE', dir: { x: 0, z: 1 } })
  })
})

describe('play camera hotkeys', () => {
  it('ignores repeat and editor focus, toggles C, and returns cleanup', () => {
    const record = vi.fn()
    const cleanup = connectPlayHotkeys(record)
    cleanups.push(cleanup)
    key('keydown', 'KeyR', true)
    expect(record).not.toHaveBeenCalled()
    tap('KeyR')
    expect(record).toHaveBeenCalledTimes(1)
    const mode = getCameraMode()
    tap('KeyC')
    expect(getCameraMode()).not.toBe(mode)
    doc.activeElement = { isContentEditable: true }
    tap('KeyR')
    tap('KeyC')
    expect(record).toHaveBeenCalledTimes(1)
    expect(getCameraMode()).not.toBe(mode)
    doc.activeElement = null
    tap('KeyC')
    expect(getCameraMode()).toBe(mode)
    cleanup()
    tap('KeyR')
    tap('KeyC')
    expect(record).toHaveBeenCalledTimes(1)
    expect(getCameraMode()).toBe(mode)
  })

  it('frames both halves and high shuttles on landscape and portrait screens after side changes', () => {
    expect(getCameraMode()).toBe('third_person')
    const camera = createGameCamera()
    expect(camera.position.x).toBeLessThan(0)
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      camera.aspect = aspect
      for (const side of [0, 1] as const) {
        updateCamera(camera, [side === 0 ? -7 : 7, 0, 3], side)
        expect(Math.sign(camera.position.x)).toBe(side === 0 ? -1 : 1)
        const position = camera.position.clone()
        updateCamera(camera, [side === 0 ? -1 : 1, 0, -3], side)
        expect(camera.position).toEqual(position)
        camera.updateMatrixWorld()
        // baseline 机位只保证固定包围角点集在视锥内；球对取景仅弱影响（camera.ts）。
        for (const [x, y] of [[-7.5, 0], [7.5, 0], [-6, 2.8], [6, 2.8], [-2, 6], [2, 6]]) for (const z of [-3.6, 3.6]) {
          updateCamera(camera, [side === 0 ? -3 : 3, 0, 0], side, [x, y, z])
          camera.updateMatrixWorld()
          const projected = new THREE.Vector3(x, y, z).project(camera)
          expect(Math.abs(projected.x)).toBeLessThan(1)
          expect(Math.abs(projected.y)).toBeLessThan(1)
          expect(projected.z).toBeGreaterThan(-1)
          expect(projected.z).toBeLessThan(1)
        }
      }
    }
    toggleCameraMode()
    updateCamera(camera)
    expect(camera.position.x).toBe(0)
    expect(camera.position.z).toBeGreaterThan(0)
    toggleCameraMode()
  })
})
