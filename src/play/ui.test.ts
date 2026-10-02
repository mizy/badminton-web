import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../character/types'
import { TOUCH_DIRECTIONS, aimReadoutView, chargeView, pointBannerView } from './ui'

describe('触屏击球方向', () => {
  it('只保留上挑 / 高远、下压、平抽三个方向', () => {
    expect(TOUCH_DIRECTIONS).toEqual(['up', 'down', 'flat'])
  })
})

const swing = (phase: PlayerState['swing']['phase'], elapsed: number, released = 0): PlayerState['swing'] =>
  ({ phase, elapsed, shot: 'CLEAR', direction: null, aim: { lateral: 0, depth: 0 }, target: null, slice: false, charge01: released, holdLimit: 0.5 })

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
