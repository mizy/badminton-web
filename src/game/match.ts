import type { GameState, MatchState, PointReason } from './types'

/** 21 分制、两分领先、30 分封顶；三局两胜。getPhase 与 HUD 的局点/赛点提示共用这一组规则。 */
export const POINTS_TO_WIN = 21
export const POINT_CAP = 30
export const SETS_TO_WIN = 2

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
    isDeuce: points[0] >= POINTS_TO_WIN - 1 && points[1] >= POINTS_TO_WIN - 1,
    server: scorer,
    serviceSide: points[scorer] % 2 === 0 ? 'right' : 'left',
  }
}

function getPhase(match: MatchState): GameState['phase'] {
  const [a, b] = match.points
  if (Math.max(a, b) < POINT_CAP && (Math.max(a, b) < POINTS_TO_WIN || Math.abs(a - b) < 2)) return 'point_scored'
  const completed = match.sets.slice(0, match.currentSet + 1)
  const homeWins = completed.filter(s => s.home > s.away).length
  const awayWins = completed.filter(s => s.away > s.home).length
  return homeWins >= SETS_TO_WIN || awayWins >= SETS_TO_WIN ? 'match_end' : 'set_end'
}

/**
 * 局点 / 赛点判定：领先至少一分且已到 20 分（20-20 平要两分领先，所以平局不算局点）。
 * matchPoint = 这一分拿下就直接赢下整场。HUD 徽标只读这里的结论，不自己算分。
 */
export function getMatchPoint(match: MatchState): { side: 0 | 1; leaderPoints: number; matchPoint: boolean } | null {
  const [home, away] = match.points
  const side: 0 | 1 = home >= away ? 0 : 1
  const leaderPoints = side === 0 ? home : away
  if (leaderPoints < POINTS_TO_WIN - 1 || Math.abs(home - away) < 1) return null
  const completed = match.sets.slice(0, match.currentSet)
  const setsWon = completed.filter(set => (side === 0 ? set.home > set.away : set.away > set.home)).length
  return { side, leaderPoints, matchPoint: setsWon >= SETS_TO_WIN - 1 }
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
