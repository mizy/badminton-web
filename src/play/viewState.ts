export const LOG_INTERVAL_MS = 3000
export const RECORD_DURATION_MS = 25_000

export interface PlayViewState {
  gameReadySignaled: boolean
  idleSince: number
  lastLogTime: number
  lastRallyHits: number
  lastTime: number
  phaseChangeCount: number
  pointScoredAt: number
  rallyHits: number
  recordingStartTime: number
}

export function createViewState(now: number = performance.now()): PlayViewState {
  return {
    gameReadySignaled: false,
    idleSince: now,
    lastLogTime: 0,
    lastRallyHits: 0,
    lastTime: now,
    phaseChangeCount: 0,
    pointScoredAt: 0,
    rallyHits: 0,
    recordingStartTime: 0,
  }
}
