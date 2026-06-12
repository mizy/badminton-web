/** AI 系统 — 统一入口 */

export type {
  AIConfig,
  AIDifficulty,
  AIEvaluation,
  TacticalDecision,
} from './types'

export { AI_DIFFICULTY_MAP } from './types'

export { decideTactical } from './tactical'

export { estimateReturnZone } from './prediction'
export type { OpponentProfile } from './prediction'

export {
  getAIConfig,
  shouldMakeError,
  applyReactionDelay,
} from './difficulty'
