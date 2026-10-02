import type { FootworkPoint } from './footwork'
import type { RacketState } from '../physics/racket'
import type { ShotDirection, ShotType } from './shotSynthesis'
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
  /** 当前移动指向的六点区域（前/中/后 × 左/右）；站定无输入时为 null。 */
  footworkPoint: FootworkPoint | null
}

export interface TimingWindow {
  open: number
  close: number
  quality: 'perfect' | 'good' | 'late' | 'miss'
}

export interface ShotAim {
  /** 横向落点：-1 左路 … 0 中路 … 1 右路。键盘只给 -1/0/1，触屏瞄准区给连续值。 */
  lateral: number
  /** 纵深修正：-1 网前 … 0 标准 … 1 底线。出拍时再叠加按住时长的力度加成（见 stroke.releaseSwing）。 */
  depth: number
}

export interface SwingState {
  phase: 'ready' | 'preparing' | 'queued' | 'swinging' | 'recovery'
  elapsed: number
  shot: ShotType
  /** Touch intent; the technical shot is resolved from contact height and power. */
  direction: ShotDirection | null
  aim: ShotAim
  target: [number, number, number] | null
  slice: boolean
  charge01: number
  /** 自动出拍时限：准备时长 + 蓄力窗口，触屏另加宽限。人类杀球保持到松手。 */
  holdLimit: number
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
