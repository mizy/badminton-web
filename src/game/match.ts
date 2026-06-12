/** BWF 计分规则 — 三局两胜 21 分制 */

import type { GameState, MatchState, SetScore } from './types'

const POINTS_TO_WIN = 21
const DEUCE_THRESHOLD = 20
const MAX_DEUCE_POINTS = 30

export function checkPoint(state: GameState): GameState {
  if (!state.shuttle || !state.match) return state

  const [bx] = state.shuttle.pos
  const scorer: 0 | 1 = bx > 0 ? 0 : 1

  const newMatch = updateMatch(state.match, scorer)
  const phase = getPhase(newMatch)

  return {
    ...state,
    phase,
    match: newMatch,
    shuttle: null,
  }
}

function updateMatch(match: MatchState, scorer: 0 | 1): MatchState {
  const newPoints: [number, number] = [...match.points]
  newPoints[scorer]++

  const isDeuce = newPoints[0] >= DEUCE_THRESHOLD && newPoints[1] >= DEUCE_THRESHOLD

  return {
    ...match,
    points: newPoints,
    isDeuce,
    server: scorer,
    serviceSide: (newPoints[scorer] % 2 === 0) ? 'right' : 'left',
  }
}

function getPhase(match: MatchState): GameState['phase'] {
  const [a, b] = match.points

  if (a >= MAX_DEUCE_POINTS || b >= MAX_DEUCE_POINTS) return 'set_end'
  if ((a >= POINTS_TO_WIN || b >= POINTS_TO_WIN) && Math.abs(a - b) >= 2) return 'set_end'

  return 'playing'
}

export function handleSetEnd(match: MatchState): MatchState {
  const newSets = [...match.sets] as [SetScore, SetScore, SetScore]
  const setWinner: 0 | 1 = match.points[0] > match.points[1] ? 0 : 1

  const winnerScore = newSets[match.currentSet]
  if (setWinner === 0) winnerScore.home++
  else winnerScore.away++

  const homeWon = newSets.filter(s => s.home > s.away).length
  const awayWon = newSets.filter(s => s.away > s.home).length

  if (homeWon >= 2 || awayWon >= 2) {
    return { ...match, sets: newSets, points: [0, 0], isDeuce: false, serviceSide: 'right' }
  }

  return {
    ...match,
    sets: newSets,
    currentSet: match.currentSet + 1,
    points: [0, 0],
    isDeuce: false,
    serviceSide: 'right',
  }
}
