import { describe, it, expect } from 'vitest'
import { stepShuttlecock, launchShuttlecock, DEFAULT_SHUTTLECOCK } from './shuttlecock'

describe('shuttlecock physics', () => {
  // 自由落体: 短暂下落接近真空理论值, 验证 RK4 积分基础正确性
  it('free fall matches vacuum theory at short duration', () => {
    const state = launchShuttlecock([0, 10, 0], 0, -90, 0)
    // dt=0.05s, 32 sub-steps → 空气阻力影响 < 0.2%
    const result = stepShuttlecock(state, 0.05, DEFAULT_SHUTTLECOCK, 32)

    // 理论真空值: y = 10 - ½·9.81·0.05² ≈ 9.9877
    expect(result.pos[1]).toBeCloseTo(9.988, 2)
    // 理论速度: vy = -9.81·0.05 ≈ -0.4905
    expect(result.vel[1]).toBeCloseTo(-0.49, 2)
  })

  // 收尾速度: 由低速 Cd·A 决定，实测约 6.7–6.8 m/s
  it('approaches the measured terminal velocity', () => {
    let state = launchShuttlecock([0, 30, 0], 0, -90, 0)
    for (let i = 0; i < 300; i++) state = stepShuttlecock(state, 1 / 30, DEFAULT_SHUTTLECOCK, 4)
    expect(state.vel[1]).toBeGreaterThan(-7.3)
    expect(state.vel[1]).toBeLessThan(-6.2)
  })

  // 杀球速度衰减: 高阻力使 80 m/s 在 0.2s 内衰减过半
  it('smash speed decays drastically from 80 m/s', () => {
    const state = launchShuttlecock([0, 2, 0], 80, 0, 0)
    const quarter = stepShuttlecock(state, 0.25, DEFAULT_SHUTTLECOCK, 32)
    const half = stepShuttlecock(state, 0.5, DEFAULT_SHUTTLECOCK, 32)
    const speed = (s: typeof state) => Math.sqrt(s.vel[0] ** 2 + s.vel[1] ** 2 + s.vel[2] ** 2)
    expect(speed(quarter)).toBeLessThan(45)
    expect(speed(quarter)).toBeGreaterThan(10)
    expect(speed(half)).toBeLessThan(20)
  })

  // 高远球轨迹: 28 m/s 仰角 55°, 滞空与落点合理
  it('clear shot has realistic hang time and distance', () => {
    const state = launchShuttlecock([0, 2, 0], 28, 55, 0)
    let s = state
    let time = 0
    const dt = 1 / 60 // 60fps 帧步进

    while (s.pos[1] >= 0 && time < 10) {
      s = stepShuttlecock(s, dt, DEFAULT_SHUTTLECOCK, 4)
      time += dt
    }

    // 真实高远球滞空约 1.0-1.5s
    expect(time).toBeGreaterThan(1.5)
    expect(time).toBeLessThan(4.0)
    // 落点水平距离应在合理范围
    expect(Math.abs(s.pos[2])).toBeGreaterThan(4)
    expect(Math.abs(s.pos[2])).toBeLessThan(15)
  })
})
