import { describe, expect, it } from 'vitest'
import { checkPoint, getMatchPoint, handleSetEnd } from './match'
import type { MatchState } from './types'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { gameReducer } from './reducer'

function landing(x: number, z = 0, lastHitter: 0 | 1 = 0) {
  return {
    ...createFullGameState(), phase: 'playing' as const,
    players: [createPlayer(0), createPlayer(1)] as ReturnType<typeof createFullGameState>['players'],
    lastHitter, shuttle: { pos: [x, 0, z] as [number, number, number], vel: [0, -2, 0] as [number, number, number], spin: [0, 0, 0] as [number, number, number] },
  }
}

describe('singles rally scoring', () => {
  it('waits for ground contact even outside the court', () => {
    const state = landing(8)
    state.shuttle.pos[1] = 3
    expect(checkPoint(state)).toBe(state)
  })
  it('awards an in shot to the player opposite the landing half', () => {
    expect(checkPoint(landing(4)).match?.points).toEqual([1, 0])
  })
  it('awards every out shot against the last hitter, not its landing half', () => {
    expect(checkPoint(landing(8)).match?.points).toEqual([0, 1])
    expect(checkPoint(landing(-8)).match?.points).toEqual([0, 1])
    expect(checkPoint(landing(4, 2.7, 1)).match?.points).toEqual([1, 0])
  })
  it('includes singles lines and scores once only', () => {
    const scored = checkPoint(landing(6.7, 2.59))
    expect(scored.match?.points).toEqual([1, 0])
    expect(checkPoint(scored)).toBe(scored)
  })
  it('uses player sides after an end change', () => {
    const state = landing(-4)
    state.players = [createPlayer(1), createPlayer(0)]
    expect(checkPoint(state).match?.points).toEqual([1, 0])
  })
  it('checks diagonal service court and short service line', () => {
    const state = { ...landing(1.7, -1), serveInFlight: true, serviceCourtZ: -1 }
    expect(checkPoint(state).lastPoint?.reason).toBe('service')
    expect(checkPoint({ ...state, shuttle: { ...state.shuttle, pos: [4, 0, 1] } }).match?.points).toEqual([0, 1])
    expect(checkPoint({ ...state, shuttle: { ...state.shuttle, pos: [4, 0, -1] } }).match?.points).toEqual([1, 0])
  })
  it('does not give a wrong court serve a point when it crosses back to the server half', () => {
    const state = { ...landing(-4, -1), serveInFlight: true, serviceCourtZ: -1 }
    expect(checkPoint(state).lastPoint?.winner).toBe(1)
  })
  it('training records rallies without manufacturing points', () => {
    const state = { ...landing(4), mode: 'training' as const, rallyHits: 7 }
    const scored = checkPoint(state)
    expect(scored.match?.points).toEqual([0, 0])
    expect(scored.training.bestRally).toBe(7)
  })
})

describe('BWF match flow', () => {
  it('requires two clear points at deuce and caps at thirty', () => {
    const state = landing(4)
    state.match!.points = [20, 20]
    expect(checkPoint(state).phase).toBe('point_scored')
    state.match!.points = [21, 20]
    expect(checkPoint(state).phase).toBe('set_end')
    state.match!.points = [29, 29]
    expect(checkPoint(state).phase).toBe('set_end')
  })
  it('stores actual set scores immutably and retains the winner as next server', () => {
    const state = landing(4)
    state.match!.points = [20, 13]
    const scored = checkPoint(state)
    const before = JSON.stringify(scored.match)
    const next = handleSetEnd(scored.match!)
    expect(next.sets[0]).toEqual({ home: 21, away: 13 })
    expect(next.points).toEqual([0, 0])
    expect(next.server).toBe(0)
    expect(JSON.stringify(scored.match)).toBe(before)
    expect(gameReducer(scored, { type: 'RESOLVE_SET_END' }).players[0]?.side).toBe(1)
  })
  it('ends the match at two won games and preserves final points', () => {
    const state = landing(4)
    state.match!.currentSet = 1
    state.match!.sets[0] = { home: 21, away: 15 }
    state.match!.points = [20, 18]
    const end = checkPoint(state)
    expect(end.phase).toBe('match_end')
    expect(end.match?.points).toEqual([21, 18])
    expect(gameReducer(end, { type: 'TICK', dt: 20 }).phase).toBe('match_end')
  })
  it('changes ends once at eleven in the deciding game', () => {
    const state = landing(4)
    state.match!.currentSet = 2
    state.match!.sets = [{ home: 21, away: 10 }, { home: 12, away: 21 }, { home: 10, away: 8 }]
    state.match!.points = [10, 8]
    const next = gameReducer(checkPoint(state), { type: 'POINT_DELAY_ELAPSED' })
    expect(next.players[0]?.side).toBe(1)
    expect(next.match?.decidingEndsChanged).toBe(true)
  })
})

describe('局点 / 赛点判定', () => {
  const withPoints = (points: [number, number], sets: Array<{ home: number; away: number }> = [], currentSet = 0) => ({
    ...createFullGameState().match!,
    points,
    currentSet,
    sets: Array.from({ length: 3 }, (_, index) => sets[index] ?? { home: 0, away: 0 }) as MatchState['sets'],
  })

  it('等到 20 分且领先才亮局点', () => {
    expect(getMatchPoint(withPoints([19, 15]))).toBeNull()
    expect(getMatchPoint(withPoints([20, 15]))).toEqual({ side: 0, leaderPoints: 20, matchPoint: false })
    expect(getMatchPoint(withPoints([15, 20]))).toEqual({ side: 1, leaderPoints: 20, matchPoint: false })
  })

  it('20 平不算局点，两分领先才算', () => {
    expect(getMatchPoint(withPoints([20, 20]))).toBeNull()
    expect(getMatchPoint(withPoints([21, 20]))?.side).toBe(0)
    expect(getMatchPoint(withPoints([29, 29]))).toBeNull()
  })

  it('已经赢下一局时，再拿一分就是赛点', () => {
    const winningSet = [{ home: 21, away: 18 }]
    expect(getMatchPoint(withPoints([20, 17], winningSet, 1))).toEqual({ side: 0, leaderPoints: 20, matchPoint: true })
    expect(getMatchPoint(withPoints([20, 17], [{ home: 18, away: 21 }], 1))?.matchPoint).toBe(false)
  })
})
