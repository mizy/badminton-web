/** AI vs AI 自动演示调度器 */

import type { GameState } from '../game/types'
import type { GameAction } from '../game/reducer'
import type { AIConfig } from '../ai/types'
import { decideTactical } from '../ai/tactical'

export class DemoController {
  private homeConfig: AIConfig
  private awayConfig: AIConfig
  private active = false

  constructor(homeConfig: AIConfig, awayConfig: AIConfig) {
    this.homeConfig = homeConfig
    this.awayConfig = awayConfig
  }

  toggle(): boolean {
    this.active = !this.active
    return this.active
  }

  isActive(): boolean {
    return this.active
  }

  /** 为双方生成 MOVE / STOP_MOVE 动作 */
  getActions(state: GameState): GameAction[] {
    if (!this.active || state.phase !== 'playing' || !state.shuttle) return []
    if (!state.players[0] || !state.players[1]) return []

    const actions: GameAction[] = []

    for (const i of [0, 1] as const) {
      const player = state.players[i]
      const opponent = state.players[i === 0 ? 1 : 0]
      if (!player || !opponent) continue

      const config = i === 0 ? this.homeConfig : this.awayConfig
      const decision = decideTactical(player, opponent, state.shuttle, config)

      const dx = decision.moveTarget[0] - player.pos[0]
      const dz = decision.moveTarget[2] - player.pos[2]
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist > 0.2) {
        actions.push({
          type: 'MOVE',
          playerIndex: i,
          dir: { x: dx / dist, z: dz / dist },
        })
      } else {
        actions.push({ type: 'STOP_MOVE', playerIndex: i })
      }
    }

    return actions
  }

  getAIConfigs(): { home: AIConfig; away: AIConfig } {
    return { home: this.homeConfig, away: this.awayConfig }
  }
}
