/** 角色状态 — 完全纯逻辑，无 Three.js 依赖 */

import type { RacketState } from '../physics/racket'

export type Gait = 'idle' | 'walk' | 'sprint'

export interface MovementState {
  targetDir: { x: number; z: number }
  currentVel: { x: number; z: number }
  gait: Gait
  readiness: number
}

export interface TimingWindow {
  open: number
  close: number
  quality: 'perfect' | 'good' | 'late' | 'miss'
}

export interface PlayerState {
  pos: [number, number, number]
  facing: number
  movement: MovementState
  racket: RacketState
  stamina: number
  maxStamina: number
  isCharging: boolean
  chargeStartTime: number
  lastSwingTime: number
  wantsToSwing: boolean
  side: 0 | 1
}
