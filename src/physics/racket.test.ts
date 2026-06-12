import { describe, it, expect } from 'vitest'
import { resolveRacketCollision } from './racket'
import type { RacketState } from './racket'

describe('racket collision', () => {
  const stationaryRacket: RacketState = {
    pos: [0, 1, 0],
    vel: [0, 0, 0],
    normal: [0, 1, 0],
    angularVel: [0, 0, 0],
  }

  // 正面碰撞: 球在拍面上方，垂直下落击球
  it('frontal collision reflects normal velocity with restitution', () => {
    const result = resolveRacketCollision(
      [0, -10, 0], // 球垂直下落（朝拍面运动）
      [0, 0, 0],
      stationaryRacket, // racket at (0,1,0), 法向朝上
      [0, 1.5, 0], // 球在拍面上方，朝拍面下落 → 应碰撞
    )

    expect(result).not.toBeNull()
    // 法向反弹: approachRate < 0 → 球向拍面运动
    // vn = dot([0,-10], [0,1]) = -10 → approachSpeed=10
    // vnOut = 0.75 * 10 = 7.5
    expect(result!.outgoingVel[1]).toBeCloseTo(7.5, 5)
    // 切向无分量
    expect(result!.outgoingVel[0]).toBe(0)
    expect(result!.outgoingVel[2]).toBe(0)
    expect(result!.impactSpeed).toBeCloseTo(10, 5)
  })

  // 切向摩擦: 切向分量被摩擦减速, 法向正常反弹
  it('tangential friction reduces lateral component', () => {
    const result = resolveRacketCollision(
      [5, -10, 0], // 5 m/s 横向 + -10 m/s 垂直
      [0, 0, 0],
      stationaryRacket, // racket at (0,1,0)
      [0, 1.5, 0], // 球在拍面上方，朝拍面运动
    )

    expect(result).not.toBeNull()

    // 法向: 0.75 * 10 = 7.5
    expect(result!.outgoingVel[1]).toBeCloseTo(7.5, 5)

    // 切向: FRICTION=0.3, fr=min(0.3*10, 5)=3, 剩余 5*(5-3)/5=2
    expect(result!.outgoingVel[0]).toBeCloseTo(2, 5)
    expect(result!.outgoingVel[2]).toBe(0)

    expect(result!.impactSpeed).toBeCloseTo(10, 5)
  })

  // 球在拍面前方且朝远离方向运动 → AABB 已确认球在范围内，仍执行反弹
  it('still bounces ball when ball in front moves away (AABB-triggered)', () => {
    const result = resolveRacketCollision(
      [0, 5, 0], // 向上运动
      [0, 0, 0],
      stationaryRacket, // racket at (0,1,0), normal (0,1,0)
      [0, 1.5, 0], // 球在拍面上方，朝上远离
    )

    expect(result).not.toBeNull()
    // 法向反弹: approachSpeed=5, vnOut=0.75*5=3.75
    expect(result!.outgoingVel[1]).toBeCloseTo(3.75, 5)
  })

  // 球在拍面后方且朝拍面运动 → 应触发碰撞（球从后方接近拍面）
  it('hits ball when ball approaches from behind racket', () => {
    const racket: RacketState = {
      pos: [0, 1, 0],
      vel: [0, 0, 0],
      normal: [0, 1, 0],
      angularVel: [0, 0, 0],
    }
    const result = resolveRacketCollision(
      [0, 5, 0], // 向上运动（朝拍面）
      [0, 0, 0],
      racket,
      [0, 0.5, 0], // 球在拍面下方，朝上接近拍面 → 应碰撞
    )

    expect(result).not.toBeNull()
    // 法向反弹: vn=5, approachSpeed=5, vnOut=0.75*5=3.75
    expect(result!.outgoingVel[1]).toBeCloseTo(3.75, 5)
  })

  // 球在拍面后方且远离拍面 → AABB 已确认球在范围内，仍执行反弹
  it('still bounces ball when ball behind moves away (AABB-triggered)', () => {
    const result = resolveRacketCollision(
      [0, -5, 0], // 向下运动
      [0, 0, 0],
      stationaryRacket, // racket at (0,1,0), normal (0,1,0)
      [0, 0.5, 0], // 球在拍面下方，朝下远离
    )

    expect(result).not.toBeNull()
    // 法向反弹: approachSpeed=5, vnOut=0.75*5=3.75
    expect(result!.outgoingVel[1]).toBeCloseTo(3.75, 5)
  })
})
