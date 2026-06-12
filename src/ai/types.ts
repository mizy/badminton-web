/** AI 决策类型定义 — 纯逻辑，无 Three.js 依赖 */

import type { ShotType } from '../character/shotSynthesis'

export type AIDifficulty = 'easy' | 'medium' | 'hard'

export interface AIConfig {
  difficulty: AIDifficulty
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
