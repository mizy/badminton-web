export interface PlayViewState {
  lastTime: number
  accumulator: number
  lastHitCount: number
  lastRallyId: number
}

export function createViewState(now = performance.now()): PlayViewState {
  return { lastTime: now, accumulator: 0, lastHitCount: 0, lastRallyId: 0 }
}
