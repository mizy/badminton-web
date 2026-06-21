/** AI vs AI 自动演示调度器 */

import type { GameState } from '../game/types'
import type { GameAction } from '../game/reducer'
import type { AIConfig } from '../ai/types'
import { createAIMoveActions } from '../play/aiMoveActions'

export class DemoController {
  private homeConfig: AIConfig
  private awayConfig: AIConfig
  private active: boolean

  constructor(homeConfig: AIConfig, awayConfig: AIConfig, active: boolean = false) {
    this.homeConfig = homeConfig
    this.awayConfig = awayConfig
    this.active = active
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
    if (!this.active) return []
    return createAIMoveActions(state, {
      away: this.awayConfig,
      home: this.homeConfig,
    })
  }

  getAIConfigs(): { home: AIConfig; away: AIConfig } {
    return { home: this.homeConfig, away: this.awayConfig }
  }
}
