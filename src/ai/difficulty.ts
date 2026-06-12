/** 难度调节 — 反应时间、到位度、失误率 */

import type { AIConfig, AIDifficulty } from './types'
import { AI_DIFFICULTY_MAP } from './types'

export function getAIConfig(difficulty: AIDifficulty): AIConfig {
  return { ...AI_DIFFICULTY_MAP[difficulty] }
}

export function shouldMakeError(config: AIConfig): boolean {
  return Math.random() < config.errorRate
}

export function applyReactionDelay(config: AIConfig): number {
  return config.reactionDelay + (Math.random() - 0.5) * config.reactionDelay * 0.5
}
