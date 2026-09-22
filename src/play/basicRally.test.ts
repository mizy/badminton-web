import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoController } from '../demo/demoController'
import * as reducer from '../game/reducer'
import { SHORT_SERVICE_LINE, SINGLES_HALF_WIDTH } from '../game/match'
import type { GameState } from '../game/types'
import { createBasicRallyOptions, createBasicRallyState, stepBasicRally } from './basicRally'

function expectLegalService(game: GameState): void {
  const server = game.match!.server
  const player = game.players[server]!
  const receiver = game.players[server === 0 ? 1 : 0]!
  const serviceZ = (player.side === 0 ? 1 : -1) * (game.match!.serviceSide === 'left' ? -1 : 1)
  expect(Math.abs(player.pos[0])).toBeGreaterThanOrEqual(SHORT_SERVICE_LINE)
  expect(Math.abs(player.pos[0])).toBeLessThanOrEqual(6.7)
  expect(Math.abs(player.pos[2])).toBeLessThanOrEqual(SINGLES_HALF_WIDTH)
  expect(player.pos[2] * serviceZ).toBeGreaterThan(0)
  expect(receiver.pos[2] * serviceZ).toBeLessThan(0)
  expect(Math.sign(player.pos[0])).toBe(player.side === 0 ? -1 : 1)
  expect(Math.sign(receiver.pos[0])).toBe(receiver.side === 0 ? -1 : 1)
  expect(reducer.gameReducer(game, { type: 'SERVE', playerIndex: server }).phase).toBe('playing')
}

afterEach(() => vi.restoreAllMocks())

describe('basic rally orchestration', () => {
  it('starts a dual-AI match with legal diagonal service positions', () => {
    const rally = createBasicRallyState()

    expect(rally.game.phase).toBe('idle')
    expect(rally.game.mode).toBe('match')
    expect(rally.game.controls).toEqual(['ai', 'ai'])
    expect(rally.game.players[0]?.side).toBe(0)
    expect(rally.game.players[1]?.side).toBe(1)
    expect(rally.game.shuttle).toBeNull()
    expect(rally.stats.serveCount).toBe(0)
    expectLegalService(rally.game)
  })

  it('auto-serves and advances through the reducer without render dependencies', () => {
    const options = createBasicRallyOptions('medium')
    let rally = createBasicRallyState()
    let served = false
    let sawPlaying = false

    for (let frame = 0; frame < 60; frame++) {
      const result = stepBasicRally(rally, 1 / 60, options)
      served ||= result.events.served
      sawPlaying ||= result.rally.game.phase === 'playing'
      rally = result.rally
    }

    expect(served).toBe(true)
    expect(sawPlaying).toBe(true)
    expect(rally.stats.serveCount).toBeGreaterThan(0)
  })

  it('continues through repeated point delays and match restarts', () => {
    const options = createBasicRallyOptions('medium')
    options.autoServeDelaySeconds = 0
    options.pointPauseSeconds = 0
    let rally = createBasicRallyState()

    rally = {
      ...rally,
      game: {
        ...rally.game,
        phase: 'point_scored',
        shuttle: null,
        rallyHits: 3,
      },
      stats: {
        ...rally.stats,
        hitCount: 3,
      },
    }

    const afterPoint = stepBasicRally(rally, 1 / 60, options).rally
    expect(afterPoint.game.phase).toBe('idle')
    expect(afterPoint.stats.lastRallyHits).toBe(3)

    const afterServe = stepBasicRally(afterPoint, 1 / 60, options)
    expect(afterServe.events.served).toBe(true)
    expect(afterServe.rally.game.phase).toBe('playing')
    expect(afterServe.rally.stats.serveCount).toBe(1)

    const restarted = stepBasicRally({
      ...afterServe.rally,
      game: {
        ...afterServe.rally.game,
        phase: 'match_end',
        shuttle: null,
      },
    }, 1 / 60, options)

    expect(restarted.events.restarted).toBe(true)
    expect(restarted.rally.game.phase).toBe('idle')
    expect(restarted.rally.stats.serveCount).toBe(0)
    expect(restarted.rally.game.controls).toEqual(['ai', 'ai'])
    expectLegalService(restarted.rally.game)
  })

  it('honors demo delays even when they exceed the main tick defaults', () => {
    const options = createBasicRallyOptions()
    options.autoServeDelaySeconds = 1.5
    options.pointPauseSeconds = 1.5
    let rally = createBasicRallyState()
    for (let i = 0; i < 75; i++) rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.phase).toBe('idle')
    for (let i = 0; i < 20; i++) rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.stats.serveCount).toBe(1)

    rally = { ...rally, game: { ...rally.game, phase: 'point_scored', phaseTime: 0, shuttle: null, rallyHits: 7 } }
    for (let i = 0; i < 75; i++) rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.phase).toBe('point_scored')
    expect(rally.stats.lastRallyHits).toBe(7)
    for (let i = 0; i < 20; i++) rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.phase).toBe('idle')
    expectLegalService(rally.game)
  })

  it.each([
    { name: 'counts all contacts without a velocity change', hits: 6, ended: false, reverse: false },
    { name: 'retains a final contact when the shuttle is removed on scoring', hits: 5, ended: true, reverse: false },
    { name: 'does not count a velocity reversal without contact', hits: 4, ended: false, reverse: true },
  ])('$name', ({ hits, ended, reverse }) => {
    const options = createBasicRallyOptions()
    const rally = createBasicRallyState()
    rally.game = {
      ...rally.game, phase: 'playing', rallyHits: 4,
      shuttle: { pos: [-3, 2, 1], vel: [10, 2, 0], spin: [0, 0, 0] },
    }
    rally.stats.hitCount = 4
    const nextGame: GameState = {
      ...rally.game,
      rallyHits: hits,
      phase: ended ? 'point_scored' : 'playing',
      shuttle: ended ? null : { ...rally.game.shuttle!, vel: reverse ? [-10, -2, 0] : [10, 2, 0] },
    }
    const realReducer = reducer.gameReducer
    const dispatch = vi.spyOn(reducer, 'gameReducer').mockImplementation((game, action) =>
      action.type === 'TICK' ? nextGame : realReducer(game, action))

    const result = stepBasicRally(rally, 1 / 60, options)
    expect(result.events.hit).toBe(hits > 4)
    expect(result.events.pointEnded).toBe(ended)
    expect(result.rally.stats.hitCount).toBe(hits)
    if (ended) expect(result.rally.stats.lastRallyHits).toBe(hits)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(rally.game, {
      type: 'TICK', dt: 1 / 60, aiConfigs: { home: options.homeAI, away: options.awayAI },
    })
  })

  it('preserves player identity and scores by identity after changing ends between sets', () => {
    const options = createBasicRallyOptions()
    options.autoServeDelaySeconds = 10
    options.pointPauseSeconds = 0
    let rally = createBasicRallyState()
    rally.game = reducer.gameReducer(rally.game, {
      type: 'SET_PLAYERS',
      players: [
        { ...rally.game.players[0]!, loadout: 'power', selectedShot: 'SMASH', stamina: 63 },
        { ...rally.game.players[1]!, loadout: 'control', selectedShot: 'DROP', stamina: 71 },
      ],
    })
    rally.game = {
      ...rally.game, phase: 'set_end', rallyHits: 5,
      match: { ...rally.game.match!, points: [21, 18], sets: [{ home: 21, away: 18 }, { home: 0, away: 0 }, { home: 0, away: 0 }] },
    }
    rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.match?.currentSet).toBe(1)
    expect(rally.game.players.map(p => p?.side)).toEqual([1, 0])
    expect(rally.stats.lastRallyHits).toBe(5)
    expectLegalService(rally.game)

    options.autoServeDelaySeconds = 0
    const serve = stepBasicRally(rally, 1 / 60, options)
    expect(serve.events.served).toBe(true)
    expect(serve.rally.stats.hitCount).toBe(0)
    rally = serve.rally
    rally.game = {
      ...rally.game, lastHitter: 0, serveInFlight: false, rallyHits: 2,
      shuttle: { pos: [-4, 0.001, 1], vel: [0, -1, 0], spin: [0, 0, 0] },
    }
    const scored = stepBasicRally(rally, 1 / 60, options)
    expect(scored.events.pointEnded).toBe(true)
    expect(scored.rally.game.lastPoint?.winner).toBe(0)
    expect(scored.rally.game.match?.points).toEqual([1, 0])
    rally = stepBasicRally(scored.rally, 1 / 60, options).rally
    expect(rally.game.players.map(p => p?.side)).toEqual([1, 0])
    expect(rally.game.players.map(p => p?.loadout)).toEqual(['power', 'control'])
    expect(rally.game.players.map(p => p?.selectedShot)).toEqual(['SMASH', 'DROP'])
    expect(rally.game.players[0]!.stamina).toBeLessThan(100)
    expect(rally.game.match?.server).toBe(0)
    expect(rally.game.match?.serviceSide).toBe('left')
    expectLegalService(rally.game)
  })

  it('keeps the deciding-set end change through subsequent point delays', () => {
    const options = createBasicRallyOptions()
    options.pointPauseSeconds = 0
    let rally = createBasicRallyState()
    rally.game = {
      ...rally.game, phase: 'point_scored',
      match: { ...rally.game.match!, currentSet: 2, points: [7, 11], server: 1, serviceSide: 'left' },
    }
    rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.match?.decidingEndsChanged).toBe(true)
    expect(rally.game.players.map(p => p?.side)).toEqual([1, 0])
    expectLegalService(rally.game)

    rally.game = { ...rally.game, phase: 'point_scored' }
    rally = stepBasicRally(rally, 1 / 60, options).rally
    expect(rally.game.players.map(p => p?.side)).toEqual([1, 0])
    expectLegalService(rally.game)
  })
})

describe('demo AI configuration', () => {
  it('provides no AI overrides while inactive, including after toggling off', () => {
    const options = createBasicRallyOptions()
    const demo = new DemoController(options.homeAI, options.awayAI)
    expect(demo.getAIConfigs()).toEqual({})
    expect(demo.toggle()).toBe(true)
    expect(demo.getAIConfigs()).toEqual({ home: options.homeAI, away: options.awayAI })
    expect(demo.toggle()).toBe(false)
    expect(demo.getAIConfigs()).toEqual({})
  })
})
