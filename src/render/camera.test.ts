import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createGameCamera, getAimHeading, getCameraMode, getShuttleShadow, updateCamera } from './camera'

class FakeWindow extends EventTarget {
  innerWidth = 1280
  innerHeight = 720
}

class FakeDocument extends EventTarget {
  hidden = false
  visibilityState = 'visible'
  activeElement: unknown = null
}

beforeEach(() => {
  vi.stubGlobal('window', new FakeWindow())
  vi.stubGlobal('document', new FakeDocument())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const TARGET = new THREE.Vector3(0, -0.3, 0)

/** 跑 n 帧（默认 60fps）并返回平滑后的取景 distance。 */
function settle(shuttle: [number, number, number] | undefined, frames: number, side: 0 | 1 = 0, dt = 1 / 60, aspect = 16 / 9): number {
  const camera = createGameCamera()
  camera.aspect = aspect
  for (let i = 0; i < frames; i++) updateCamera(camera, undefined, side, shuttle, dt)
  return camera.position.distanceTo(TARGET) - 2.5
}

function currentDistance(camera: THREE.PerspectiveCamera): number {
  return camera.position.distanceTo(TARGET) - 2.5
}

describe('updateCamera framing stability', () => {
  it('keeps shuttle height from stretching distance beyond the weak-influence cap', () => {
    const low = settle([7.5, 0, 3.6], 120)
    const high = settle([7.5, 8, 3.6], 120)
    expect(high / low).toBeLessThanOrEqual(1.08)
  })

  it('engages the weak-influence cap (≤6%) only where the clamped shuttle exceeds the fixed envelope', () => {
    // 窄屏下横向视锥紧张：场地边缘的球会触发弱影响，但被截断在基准的 6% 内。
    const base = settle(undefined, 120, 0, 1 / 60, 9 / 16)
    const withBall = settle([-8.5, 0, 4.4], 120, 0, 1 / 60, 9 / 16)
    expect(withBall / base).toBeGreaterThan(1)
    expect(withBall / base).toBeLessThanOrEqual(1.07)
  })

  it('bounds the per-frame distance change at 60fps while the shuttle climbs from y=0 to y=8', () => {
    const camera = createGameCamera()
    let previous = -1
    for (let i = 0; i <= 60; i++) {
      updateCamera(camera, undefined, 0, [7.5, (i / 60) * 8, 3.6], 1 / 60)
      const distance = currentDistance(camera)
      if (previous > 0) {
        expect(Math.abs(distance - previous)).toBeLessThanOrEqual(previous * 0.021)
      }
      previous = distance
    }
  })

  it('snaps orientation and distance on a side change with no lerp trail', () => {
    const camera = createGameCamera()
    updateCamera(camera, undefined, 0, [7.5, 8, 3.6], 1 / 60)
    updateCamera(camera, undefined, 0, [7.5, 8, 3.6], 1 / 60)
    expect(camera.position.x).toBeLessThan(0)

    updateCamera(camera, undefined, 1, [7.5, 8, 3.6], 1 / 60)
    expect(camera.position.x).toBeGreaterThan(0)
    const snapped = currentDistance(camera)
    const fresh = createGameCamera()
    updateCamera(fresh, undefined, 1, [7.5, 8, 3.6], 1 / 60)
    expect(currentDistance(fresh)).toBeCloseTo(snapped, 6)

    updateCamera(camera, undefined, 1, [7.5, 8, 3.6], 1 / 60)
    expect(currentDistance(camera)).toBeCloseTo(snapped, 6)
  })

  it('keeps the same distance regardless of player position', () => {
    const camera = createGameCamera()
    updateCamera(camera, [-7, 0, 3], 0)
    const a = camera.position.clone()
    updateCamera(camera, [-1, 0, -3], 0)
    expect(camera.position).toEqual(a)
    expect(getCameraMode()).toBe('third_person')
  })

  it('does not throw for undefined playerPos or shuttlePos', () => {
    const camera = createGameCamera()
    expect(() => updateCamera(camera)).not.toThrow()
    expect(() => updateCamera(camera, undefined, 0, undefined)).not.toThrow()
    expect(() => updateCamera(camera, [3, 1, 2], 1)).not.toThrow()
  })
})

describe('getShuttleShadow', () => {
  it('fades with height, grows slightly, and sticks to the ground plane', () => {
    const ground = getShuttleShadow({ pos: [3, 0, -2] })
    expect(ground.position).toEqual([3, 0.035, -2])
    expect(ground.opacity).toBeCloseTo(0.8)
    expect(ground.scale).toBeCloseTo(2.3)

    const high = getShuttleShadow({ pos: [3, 8, -2] })
    expect(high.opacity).toBeLessThan(ground.opacity)
    expect(high.opacity).toBeGreaterThanOrEqual(0.3)
    expect(high.scale).toBeGreaterThan(ground.scale)
    expect(high.scale).toBeLessThan(ground.scale * 1.3)
    expect(high.position[1]).toBe(0.035)
  })

  it('matches the landing marker size at touchdown and tolerates null', () => {
    const landing = getShuttleShadow({ pos: [4.2, 0.05, 1.5] })
    // ring 几何半径 0.11 * scale ≈ landingMarker 外径 0.3
    expect(landing.scale * 0.11).toBeGreaterThan(0.2)
    expect(landing.scale * 0.11).toBeLessThan(0.3)
    expect(getShuttleShadow(null)).toEqual({ position: [0, 0.035, 0], opacity: 0.8, scale: 2.3 })
    expect(getShuttleShadow()).toEqual(getShuttleShadow(null))
  })
})

describe('getAimHeading', () => {
  it('points depth toward the opponent baseline on both sides', () => {
    expect(getAimHeading(0, { lateral: 0, depth: 1 }).x).toBeGreaterThan(0)
    expect(getAimHeading(0, { lateral: 0, depth: -1 }).x).toBeLessThan(0)
    expect(getAimHeading(1, { lateral: 0, depth: 1 }).x).toBeLessThan(0)
    expect(getAimHeading(1, { lateral: 0, depth: -1 }).x).toBeGreaterThan(0)
  })

  it('maps lateral to screen-relative z with side mirroring', () => {
    expect(getAimHeading(0, { lateral: 1, depth: 0 }).z).toBeGreaterThan(0)
    expect(getAimHeading(0, { lateral: -1, depth: 0 }).z).toBeLessThan(0)
    expect(getAimHeading(1, { lateral: 1, depth: 0 }).z).toBeLessThan(0)
    expect(getAimHeading(1, { lateral: -1, depth: 0 }).z).toBeGreaterThan(0)
  })

  it('returns zero aim for a neutral input and clamps out-of-range values', () => {
    expect(getAimHeading(0, { lateral: 0, depth: 0 })).toEqual({ x: 0, z: 0 })
    expect(getAimHeading(0, { lateral: 5, depth: -3 })).toEqual({ x: -1, z: 1 })
  })
})
