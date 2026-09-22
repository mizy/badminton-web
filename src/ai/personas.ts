import type { AIDifficulty, AIStyle } from './types'
import type { ServeType } from '../character/serve'

export type PersonaId = 'lei-meng' | 'chen-wen' | 'bai-hu' | 'xiao-man'

export interface AIPersona {
  id: PersonaId
  name: string
  tagline: string
  bio: string
  difficulty: AIDifficulty
  style: AIStyle
  /** 该人格惯用的发球（等待发球时使用）。 */
  serve: ServeType
}

/** 预制的具名 AI 对手：风格差异来自同一套身体/战术引擎，不另开特权。 */
export const PERSONAS: readonly AIPersona[] = [
  {
    id: 'lei-meng',
    name: '雷猛',
    tagline: '进攻型 · 高压打法',
    bio: '能跳杀绝不轻吊。发球爱用平射抢攻，一旦你回球偏高就起跳压头部。对付他要压低回球弧线，别把球挑起来。',
    difficulty: 'hard',
    style: 'attacker',
    serve: 'BACKHAND_FLICK',
  },
  {
    id: 'chen-wen',
    name: '陈稳',
    tagline: '相持型 · 拉吊消耗',
    bio: '不急不躁的高远球大师。用深度和连续性考验你的耐心与体力，等你先失误或回球变短。跟他拼稳定性，不如主动变节奏。',
    difficulty: 'medium',
    style: 'rally',
    serve: 'FOREHAND_HIGH',
  },
  {
    id: 'bai-hu',
    name: '白狐',
    tagline: '落点型 · 调动空档',
    bio: '每一步都有目的。发小球然后勾对角，专打你的回位慢半拍。盯住他的拍面方向，提前回中。',
    difficulty: 'hard',
    style: 'placement',
    serve: 'BACKHAND_SHORT',
  },
  {
    id: 'xiao-man',
    name: '小满',
    tagline: '陪练 · 温和稳定',
    bio: '把球回到你舒服的位置，帮你练连续多拍和球路。输赢不重要，找到手感才重要。',
    difficulty: 'easy',
    style: 'placement',
    serve: 'FOREHAND_SHORT',
  },
]

const BY_ID = new Map<PersonaId, AIPersona>(PERSONAS.map(persona => [persona.id, persona] as const))

export function getPersona(id: string | undefined): AIPersona {
  return (id ? BY_ID.get(id as PersonaId) : undefined) ?? PERSONAS[1]
}
