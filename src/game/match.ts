import type { GameState, MatchState, PointReason } from './types'

export const SINGLES_HALF_WIDTH = 2.59
export const COURT_HALF_LENGTH = 6.7
export const SHORT_SERVICE_LINE = 1.98

export function checkPoint(state: GameState): GameState {
  if (state.phase !== 'playing' || !state.shuttle || state.shuttle.pos[1] > 0) return state
  const [x, , z] = state.shuttle.pos
  const lastHitter = state.lastHitter ?? state.currentPlayer
  const receiver = lastHitter === 0 ? 1 : 0
  const landingSide = x < 0 ? 0 : 1
  const landedOn = state.players[0]?.side === landingSide ? 0 : 1
  const out = Math.abs(x) > COURT_HALF_LENGTH + 1e-6 || Math.abs(z) > SINGLES_HALF_WIDTH + 1e-6
  const serviceFault = state.serveInFlight && (landedOn === lastHitter
    || Math.abs(x) < SHORT_SERVICE_LINE || z * state.serviceCourtZ < 0)
  const reason: PointReason = state.netTouched ? 'net' : out ? 'out' : serviceFault ? 'service' : 'in'
  const winner: 0 | 1 = out || serviceFault || state.netTouched ? receiver : landedOn === 0 ? 1 : 0
  const match = state.match && state.mode === 'match' ? updateMatch(state.match, winner) : state.match
  const phase = match && state.mode === 'match' ? getPhase(match) : 'point_scored'

  return {
    ...state,
    phase,
    phaseTime: 0,
    match,
    shuttle: null,
    lastPoint: { winner, reason, landing: [x, 0, z] },
    training: { ...state.training, bestRally: Math.max(state.training.bestRally, state.rallyHits) },
  }
}

function updateMatch(match: MatchState, scorer: 0 | 1): MatchState {
  const points: [number, number] = [...match.points]
  points[scorer]++
  const sets = match.sets.map((set, i) => i === match.currentSet
    ? { home: points[0], away: points[1] } : { ...set }) as MatchState['sets']
  return {
    ...match, points, sets,
    isDeuce: points[0] >= 20 && points[1] >= 20,
    server: scorer,
    serviceSide: points[scorer] % 2 === 0 ? 'right' : 'left',
  }
}

function getPhase(match: MatchState): GameState['phase'] {
  const [a, b] = match.points
  if (Math.max(a, b) < 30 && (Math.max(a, b) < 21 || Math.abs(a - b) < 2)) return 'point_scored'
  const completed = match.sets.slice(0, match.currentSet + 1)
  const homeWins = completed.filter(s => s.home > s.away).length
  const awayWins = completed.filter(s => s.away > s.home).length
  return homeWins >= 2 || awayWins >= 2 ? 'match_end' : 'set_end'
}

export function handleSetEnd(match: MatchState): MatchState {
  return {
    ...match,
    sets: match.sets.map((set, i) => i === match.currentSet
      ? { home: match.points[0], away: match.points[1] } : { ...set }) as MatchState['sets'],
    currentSet: match.currentSet + 1,
    points: [0, 0],
    isDeuce: false,
    serviceSide: 'right',
  }
}
