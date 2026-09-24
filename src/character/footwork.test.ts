import { describe, expect, it } from 'vitest'
import { classifyFootworkPoint, type FootworkPoint } from './footwork'

const point = (pos: [number, number, number], dir: { x: number; z: number }, side: 0 | 1 = 0) =>
  classifyFootworkPoint({ x: pos[0], z: pos[2] }, dir, side)

describe('单打六点步法判定', () => {
  it.each([
    ['front-left', [-1.8, 0, -1.6], { x: 1, z: 0 }],
    ['front-right', [-1.8, 0, 1.6], { x: 1, z: 0 }],
    ['mid-left', [-4.2, 0, -1.2], { x: 0, z: -1 }],
    ['mid-right', [-4.2, 0, 1.2], { x: 0, z: 1 }],
    ['back-left', [-6.4, 0, -1.4], { x: -1, z: 0 }],
    ['back-right', [-6.4, 0, 1.4], { x: -1, z: 0 }],
  ] as const)('side 0 判定 %s', (expected, pos, dir) => {
    expect(point(pos as [number, number, number], dir)).toBe<FootworkPoint>(expected)
  })

  it.each([
    ['front-left', [1.8, 0, 1.6], { x: -1, z: 0 }],
    ['front-right', [1.8, 0, -1.6], { x: -1, z: 0 }],
    ['mid-left', [4.2, 0, 1.2], { x: 0, z: 1 }],
    ['mid-right', [4.2, 0, -1.2], { x: 0, z: -1 }],
    ['back-left', [6.4, 0, 1.4], { x: 1, z: 0 }],
    ['back-right', [6.4, 0, -1.4], { x: 1, z: 0 }],
  ] as const)('side 1 镜像判定 %s', (expected, pos, dir) => {
    expect(point(pos as [number, number, number], dir, 1)).toBe<FootworkPoint>(expected)
  })

  it('uses the projected run direction so an early start reads as the destination corner', () => {
    // 仍在中场，但已经朝右后启动：应提前读成右后场，而不是等跑到才变。
    expect(point([-4.6, 0, 0.37], { x: -1, z: 1 })).toBe('back-right')
    expect(point([-4.6, 0, -0.37], { x: -1, z: -1 })).toBe('back-left')
  })

  it('returns null while standing still and keeps side symmetry', () => {
    expect(point([-3, 0, 1], { x: 0, z: 0 })).toBeNull()
    const home = point([-4.1, 0, 1.8], { x: -0.6, z: 0.8 })
    const away = point([4.1, 0, -1.8], { x: 0.6, z: -0.8 }, 1)
    expect(home).toBe(away)
  })
})
