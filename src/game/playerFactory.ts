/** 球员工厂 — 创建双方初始 PlayerState */

import type { PlayerState } from '../character/types'
import type { RacketState } from '../physics/racket'

export function createPlayer(side: 0 | 1): PlayerState {
  const x = side === 0 ? -3 : 3
  const facing = side === 0 ? 0 : Math.PI
  const normalX = side === 0 ? 1 : -1
  const racket: RacketState = {
    pos: [x + normalX * 0.3, 0.8, 0],
    vel: [0, 0, 0],
    normal: [normalX, 0.3, 0],
    angularVel: [0, 0, 0],
  }
  return {
    pos: [x, 0, 0],
    facing,
    movement: {
      targetDir: { x: 0, z: 0 },
      currentVel: { x: 0, z: 0 },
      gait: 'idle',
      readiness: 1,
    },
    racket,
    stamina: 100,
    maxStamina: 100,
    isCharging: false,
    chargeStartTime: 0,
    lastSwingTime: 0,
    wantsToSwing: false,
    side,
  }
}
