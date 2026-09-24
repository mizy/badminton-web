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

  it('keeps the portrait camera near the landscape distance instead of backing off the whole court', () => {
    const portrait = new THREE.PerspectiveCamera(50, 393 / 852, 0.1, 200)
    const landscape = new THREE.PerspectiveCamera(50, 852 / 393, 0.1, 200)
    for (let i = 0; i < 120; i++) {
      updateCamera(portrait, undefined, 0, undefined, 1 / 60)
      updateCamera(landscape, undefined, 0, undefined, 1 / 60)
    }
    // 竖屏横向视锥窄，但仍应贴着横屏机位；旧实现在 393x852 下退到 28（球场缩成中间一条）。
    expect(portrait.fov).toBe(55)
    expect(landscape.fov).toBe(50)
    expect(currentDistance(landscape)).toBeLessThan(21)
    expect(currentDistance(portrait)).toBeLessThanOrEqual(24)
  })

  it('places both baselines and the home player inside the portrait frustum', () => {
    const camera = createGameCamera()
    camera.aspect = 393 / 852
    for (let i = 0; i < 120; i++) updateCamera(camera, undefined, 0, undefined, 1 / 60)
    for (const point of [[7.5, 0, 0], [-6.7, 0, 0], [-4.2, 0.9, 2]] as const) {
      const ndc = new THREE.Vector3(...point).project(camera)
      expect(Math.abs(ndc.x)).toBeLessThan(1)
      expect(Math.abs(ndc.y)).toBeLessThan(1)
    }
  })

  it('fills the portrait width with the court and lifts it into the band between HUD and touch pad', () => {
    const width = 360
    const height = 630
    const camera = createGameCamera()
    camera.aspect = width / height
    for (let i = 0; i < 120; i++) updateCamera(camera, undefined, 0, undefined, 1 / 60)
    const project = (x: number, y: number, z: number) => {
      const ndc = new THREE.Vector3(x, y, z).project(camera)
      return { x: (ndc.x * 0.5 + 0.5) * width, y: (1 - (ndc.y * 0.5 + 0.5)) * height }
    }
    const court = [[-6.7, 0, -3.05], [-6.7, 0, 3.05], [6.7, 0, -3.05], [6.7, 0, 3.05]] as const
    const corners = court.map(([x, y, z]) => project(x, y, z))
    const xs = corners.map(corner => corner.x)
    const ys = corners.map(corner => corner.y)
    // 球场横向铺满视口的七成以上，且四角都留在画面里（不留黑边也不裁线）。
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(width * 0.7)
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(width)
    // 顶部不再对着空天：球场远端要落到悬浮记分牌（约 88px）下方的可视带里，
    // 近端留在触控层（击球盘上沿约 476px）上方——两条边界由 play/touchControls.css 定。
    expect(Math.min(...ys)).toBeGreaterThan(90)
    expect(Math.min(...ys)).toBeLessThan(210)
    expect(Math.max(...ys)).toBeGreaterThan(330)
    expect(Math.max(...ys)).toBeLessThan(470)
  })

  it('mirrors the portrait framing when the player changes ends', () => {
    const side0 = new THREE.PerspectiveCamera(50, 393 / 852, 0.1, 200)
    const side1 = new THREE.PerspectiveCamera(50, 393 / 852, 0.1, 200)
    for (let i = 0; i < 120; i++) {
      updateCamera(side0, undefined, 0, undefined, 1 / 60)
      updateCamera(side1, undefined, 1, undefined, 1 / 60)
    }
    expect(side0.position.x).toBeLessThan(0)
    expect(side1.position.x).toBeGreaterThan(0)
    expect(Math.abs(side0.position.z)).toBeCloseTo(Math.abs(side1.position.z), 6)
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
