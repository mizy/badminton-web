import { decideTactical } from '../ai/tactical'
import type { AIConfig } from '../ai/types'
import type { GameAction } from '../game/reducer'
import type { GameState } from '../game/types'

export interface AIMoveActionConfigs {
  away: AIConfig
  home: AIConfig
}

const STOP_DISTANCE = 0.2
const NET_READY_DISTANCE = 1.1

export function createAIMoveActions(
  state: GameState,
  configs: AIMoveActionConfigs,
): GameAction[] {
  if (state.phase !== 'playing' || !state.shuttle) return []
  if (!state.players[0] || !state.players[1]) return []

  const actions: GameAction[] = []
  for (const playerIndex of [0, 1] as const) {
    const player = state.players[playerIndex]
    const opponent = state.players[playerIndex === 0 ? 1 : 0]
    if (!player || !opponent) continue

    const config = playerIndex === 0 ? configs.home : configs.away
    const decision = decideTactical(player, opponent, state.shuttle, config)
    const targetX = clampToReadyHalf(decision.moveTarget[0], playerIndex)
    const dx = targetX - player.pos[0]
    const dz = decision.moveTarget[2] - player.pos[2]
    const distance = Math.hypot(dx, dz)

    actions.push(
      distance > STOP_DISTANCE
        ? {
            type: 'MOVE',
            playerIndex,
            dir: { x: dx / distance, z: dz / distance },
          }
        : { type: 'STOP_MOVE', playerIndex },
    )
  }

  return actions
}

function clampToReadyHalf(x: number, playerIndex: 0 | 1): number {
  return playerIndex === 0
    ? Math.min(x, -NET_READY_DISTANCE)
    : Math.max(x, NET_READY_DISTANCE)
}
