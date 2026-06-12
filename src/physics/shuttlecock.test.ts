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

  // 杀球速度衰减: 80 m/s → 0.5s 内降至 ~5-10 m/s (接近收尾速度)
  it('smash speed decays drastically from 80 m/s in 0.5s', () => {
    const state = launchShuttlecock([0, 2, 0], 80, 0, 0)
    const result = stepShuttlecock(state, 0.5, DEFAULT_SHUTTLECOCK, 32)

    const speed = Math.sqrt(
      result.vel[0] ** 2 + result.vel[1] ** 2 + result.vel[2] ** 2,
    )
    // 高速 Cd~0.035, crossSection=0.0020, 速度仍较高
    expect(speed).toBeLessThan(70)
    expect(speed).toBeGreaterThan(35)
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
