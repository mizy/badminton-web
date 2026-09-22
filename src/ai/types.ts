/** AI 决策类型定义 — 纯逻辑，无 Three.js 依赖 */

import type { ShotType } from '../character/shotSynthesis'

export type AIDifficulty = 'easy' | 'medium' | 'hard'
export type AIStyle = 'attacker' | 'rally' | 'placement'

export interface AIConfig {
  difficulty: AIDifficulty
  style?: AIStyle
  cooperative?: boolean
  reactionDelay: number
  accuracy: number
  aggressiveness: number
  errorRate: number
}

export const AI_DIFFICULTY_MAP: Record<AIDifficulty, AIConfig> = {
  easy: { difficulty: 'easy', reactionDelay: 0.3, accuracy: 0.4, aggressiveness: 0.2, errorRate: 0.3 },
  medium: { difficulty: 'medium', reactionDelay: 0.15, accuracy: 0.65, aggressiveness: 0.5, errorRate: 0.15 },
  hard: { difficulty: 'hard', reactionDelay: 0.05, accuracy: 0.9, aggressiveness: 0.7, errorRate: 0.05 },
}

export interface AIEvaluation {
  canReach: boolean
  bestShotType: ShotType | null
  targetZone: [number, number, number]
  confidence: number
}

export interface TacticalDecision {
  moveTarget: [number, number, number]
  shotType: ShotType | null
  power: number
  target: [number, number, number]
  risk: number
}

export interface InterceptionPrediction {
  /** 自己半场内的站位，不是球的落点。 */
  moveTarget: [number, number, number]
  /** 从当前状态起的秒数 / 球塞接触高度（米）；不可达时均为 null。 */
  contactTime: number | null
  contactHeight: number | null
  /** 仅为共享移动/身体模型的预测，不保证实际挥拍命中。 */
  reachable: boolean
}
