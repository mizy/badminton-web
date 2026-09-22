import { gameReducer } from '../game/reducer'
import type { TickAIConfigs } from '../game/tickService'
import type { GameState } from '../game/types'

export const FIXED_STEP = 1 / 120
export interface SimulationClock { accumulator: number }

export function advanceSimulation(state: GameState, frameDt: number, clock: SimulationClock, configs?: TickAIConfigs): GameState {
  if (state.phase === 'paused' || state.phase === 'set_end' || state.phase === 'match_end') {
    clock.accumulator = 0
    return state
  }
  clock.accumulator += Math.max(0, Math.min(frameDt, 0.25))
  while (clock.accumulator + 1e-9 >= FIXED_STEP) {
    state = gameReducer(state, { type: 'TICK', dt: FIXED_STEP, aiConfigs: configs })
    clock.accumulator -= FIXED_STEP
  }
  return state
}
