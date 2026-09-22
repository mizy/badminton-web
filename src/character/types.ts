import type { RacketState } from '../physics/racket'
import type { ShotType } from './shotSynthesis'
import type { ServeType } from './serve'
import type { RacketContactPose } from './racketKinematics'
import type { TacticalDecision } from '../ai/types'

export type Gait = 'idle' | 'walk' | 'sprint'
export type Footwork = 'ready' | 'start' | 'chasse' | 'cross' | 'lunge' | 'retreat' | 'recover'
export type Loadout = 'balanced' | 'power' | 'control'

export interface MovementState {
  targetDir: { x: number; z: number }
  currentVel: { x: number; z: number }
  gait: Gait
  readiness: number
  footwork: Footwork
}

export interface TimingWindow {
  open: number
  close: number
  quality: 'perfect' | 'good' | 'late' | 'miss'
}

export interface ShotAim {
  lateral: -1 | 0 | 1
  depth: number
}

export interface SwingState {
  phase: 'ready' | 'preparing' | 'swinging' | 'recovery'
  elapsed: number
  shot: ShotType
  aim: ShotAim
  target: [number, number, number] | null
  slice: boolean
  charge01: number
}

export interface BodyState {
  phase: 'grounded' | 'loading' | 'airborne' | 'landing'
  action: 'jump' | 'scissor' | null
  elapsed: number
  verticalVelocity: number
}

export interface PlayerState {
  pos: [number, number, number]
  facing: number
  movement: MovementState
  racket: RacketState
  stamina: number
  maxStamina: number
  wantsToSwing: boolean
  side: 0 | 1
  selectedShot: ShotType
  serveSelection: ServeType
  aim: ShotAim
  swing: SwingState
  body: BodyState
  grip: 'forehand' | 'backhand'
  loadout: Loadout
  contactPose: RacketContactPose | null
  feedback: string
  contactQuality: number
  aiPlan: TacticalDecision | null
  aiPlanAt: number
}
