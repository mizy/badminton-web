import { describe, expect, it } from 'vitest'
import { SHOT_ORDER } from '../character/stroke'
import type { PlayerState } from '../character/types'
import { TOUCH_COMMON_SHOTS, TOUCH_SHOT_ROWS, aimReadoutView, chargeView, pointBannerView } from './ui'

describe('触屏球路键排布', () => {
  it('六个球路各占一个键，不重不漏', () => {
    const shots = TOUCH_SHOT_ROWS.flat()
    expect(shots).toHaveLength(SHOT_ORDER.length)
    expect(new Set(shots).size).toBe(SHOT_ORDER.length)
    expect([...shots].sort()).toEqual([...SHOT_ORDER].sort())
  })

  it('常驻和展开的球路各三个', () => {
    expect(TOUCH_SHOT_ROWS.map(row => row.length)).toEqual([3, 3])
  })

  it('高远、杀球和挑球常驻，其他球路可以展开', () => {
    expect(TOUCH_SHOT_ROWS[0]).toEqual(['CLEAR', 'SMASH', 'LIFT'])
    expect(TOUCH_SHOT_ROWS[1]).toEqual(['DROP', 'DRIVE', 'NET_DROP'])
    expect([...TOUCH_COMMON_SHOTS].sort()).toEqual(['CLEAR', 'LIFT'])
    expect(TOUCH_COMMON_SHOTS.every(shot => TOUCH_SHOT_ROWS.flat().includes(shot))).toBe(true)
  })
})

const swing = (phase: PlayerState['swing']['phase'], elapsed: number, released = 0): PlayerState['swing'] =>
  ({ phase, elapsed, shot: 'CLEAR', aim: { lateral: 0, depth: 0 }, target: null, slice: false, charge01: released, holdLimit: 0.5 })

describe('瞄准读数', () => {
  it('把连续落点写成球路 / 左右 / 纵深三段', () => {
    expect(aimReadoutView('DROP', { lateral: 0.867, depth: 1 })).toBe('吊球 · 右路 87% · 深 100%')
    expect(aimReadoutView('CLEAR', { lateral: -0.4, depth: 0.5 })).toBe('高远 · 左路 40% · 深 50%')
  })

  it('中路与标准深度不刷百分比噪声', () => {
    expect(aimReadoutView('NET_DROP', { lateral: 0.01, depth: 0 })).toBe('放网 · 中路 · 标准深度')
  })
})

describe('力量条', () => {
  it('未挥拍时熄灭', () => {
    expect(chargeView(undefined)).toEqual({ active: false, value: 0, label: '力量' })
    expect(chargeView(swing('ready', 0))).toEqual({ active: false, value: 0, label: '力量' })
  })

  it('蓄力时随按住时长上涨并封顶', () => {
    expect(chargeView(swing('preparing', 0)).value).toBeCloseTo(0, 6)
    const half = chargeView(swing('preparing', 0.225))
    expect(half.active).toBe(true)
    expect(half.value).toBeGreaterThan(0.4)
    expect(half.value).toBeLessThan(0.6)
    expect(half.label).toBe('蓄力 50%')
    expect(chargeView(swing('preparing', 5)).value).toBe(1)
  })

  it('出拍后停在本次实际力量上，直到回位', () => {
    expect(chargeView(swing('swinging', 9, 0.62)).value).toBe(0.62)
    expect(chargeView(swing('recovery', 9, 0.62)).label).toBe('力量 62%')
  })
})

describe('得分横幅', () => {
  it('没有得分时不显示', () => {
    expect(pointBannerView(null)).toBeNull()
  })

  it('我方得分：横幅走主队色，失分方是"对手"', () => {
    expect(pointBannerView({ winner: 0, reason: 'out', landing: [8, 0, 0] })).toEqual({ side: 'home', title: '你得分', reason: '对手击球出界' })
    expect(pointBannerView({ winner: 0, reason: 'in', landing: [4, 0, 0] })?.reason).toBe('球落界内')
  })

  it('对手得分：横幅走客队色，失分方是"你"', () => {
    expect(pointBannerView({ winner: 1, reason: 'net', landing: [0, 0, 0] })).toEqual({ side: 'away', title: '对手得分', reason: '你触网失分' })
  })
})
