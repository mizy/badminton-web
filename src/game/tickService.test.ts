import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { createFullGameState } from './types'
import { createPlayer } from './playerFactory'
import { getAIConfig } from '../ai/difficulty'
import { beginSwing, SHOT_ORDER } from '../character/stroke'
import { idealContactPoint } from '../character/contact'
import { placeShuttleForCorkCenter } from '../character/racketKinematics'
import { advanceBody, beginBodyAction } from '../character/body'

function session() {
  return gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)] })
}

describe('player ownership and service', () => {
  it('waits indefinitely for a human serve; only the server may serve', () => {
    let state = session()
    for (let i = 0; i < 600; i++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120, aiConfigs: { home: getAIConfig('hard'), away: getAIConfig('hard') } })
    expect(state.phase).toBe('idle')
    expect(gameReducer(state, { type: 'SERVE', playerIndex: 1 })).toBe(state)
    expect(gameReducer(state, { type: 'SERVE', playerIndex: 0 }).phase).toBe('playing')
  })
  it('allows movement while waiting to serve and preserves pause phase', () => {
    let state = gameReducer(session(), { type: 'MOVE', playerIndex: 0, dir: { x: 1, z: 0 } })
    state = gameReducer(state, { type: 'TICK', dt: 0.1 })
    expect(state.players[0]!.pos[0]).toBeGreaterThan(-3)
    state = gameReducer(state, { type: 'PAUSE', playerIndex: 0 })
    expect(gameReducer(state, { type: 'TICK', dt: 1 })).toBe(state)
    expect(gameReducer(state, { type: 'PAUSE', playerIndex: 0 }).phase).toBe('idle')
  })
  it('does not let an AI config take over a human player', () => {
    let state = gameReducer(session(), { type: 'SERVE', playerIndex: 0 })
    const pos = state.players[0]!.pos
    for (let i = 0; i < 120; i++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120, aiConfigs: { home: getAIConfig('hard'), away: getAIConfig('hard') } })
    expect(state.players[0]!.pos).toEqual(pos)
    expect(state.players[0]!.swing.phase).toBe('ready')
  })
})

describe('body and stroke combinations', () => {
  it('uses Space for service only when idle, and jumping during a rally', () => {
    const served = gameReducer(session(), { type: 'SERVE_OR_JUMP', playerIndex: 0 })
    expect(served.rallyId).toBe(1)
    const jump = gameReducer(served, { type: 'SERVE_OR_JUMP', playerIndex: 0 })
    expect(jump.rallyId).toBe(1)
    expect(jump.players[0]?.body.phase).toBe('loading')
    expect(gameReducer(jump, { type: 'TICK', dt: 0.2 }).players[0]!.pos[1]).toBeGreaterThan(0)
  })
  for (const action of ['jump', 'scissor'] as const) {
    it(`combines ${action} then smash through real elevated contact`, () => {
      let state = session()
      const home = createPlayer(0)
      home.pos = [-2.4, 0, 0]
      const airborne = advanceBody(beginBodyAction(home, action), 0.3)
      airborne.movement.currentVel = { x: 0, z: 0 }
      const incoming: [number, number, number] = [-2, 0, 0]
      const point = idealContactPoint(airborne.pos, 0, 'SMASH')
      state = { ...state, phase: 'playing', lastHitter: 1, players: [airborne, state.players[1]],
        shuttle: { pos: placeShuttleForCorkCenter(point, incoming), vel: incoming, spin: [0, 0, 0] } }
      state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'SMASH' })
      state = gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 })
      for (let i = 0; i < 25 && state.lastHitter !== 0; i++) state = gameReducer(state, { type: 'TICK', dt: 1 / 120 })
      expect(state.lastHitter).toBe(0)
      expect(state.players[0]?.feedback).toContain(action === 'jump' ? '跳杀' : '蹬转杀')
      expect(state.players[0]?.contactPose?.stringCenter[1]).toBeGreaterThan(2)
    })
  }
  it('locks the slice modifier at swing start', () => {
    let state = gameReducer(session(), { type: 'SERVE', playerIndex: 0 })
    state = gameReducer(state, { type: 'SWING_START', playerIndex: 0, shot: 'CLEAR', slice: true })
    expect(state.players[0]?.swing.slice).toBe(true)
    expect(gameReducer(state, { type: 'SWING_RELEASE', playerIndex: 0 }).players[0]?.swing.slice).toBe(true)
  })
})

describe('ordered rally events', () => {
  it('stops a fast low shot at the net before landing and scores against the hitter', () => {
    let state = { ...session(), phase: 'playing' as const, lastHitter: 0 as const,
      shuttle: { pos: [-0.1, 1, 0] as [number, number, number], vel: [80, 0, 0] as [number, number, number], spin: [0, 0, 0] as [number, number, number] } }
    let next = gameReducer(state, { type: 'TICK', dt: 1 / 30 })
    expect(next.netTouched).toBe(true)
    expect(next.shuttle?.pos[0]).toBeLessThan(0)
    for (let i = 0; i < 120 && next.phase === 'playing'; i++) next = gameReducer(next, { type: 'TICK', dt: 1 / 120 })
    expect(next.lastPoint?.reason).toBe('net')
    expect(next.match?.points).toEqual([0, 1])
  })
  it('does not call an airborne shot out', () => {
    const state = { ...session(), phase: 'playing' as const, lastHitter: 0 as const,
      shuttle: { pos: [7, 3, 0] as [number, number, number], vel: [1, -1, 0] as [number, number, number], spin: [0, 0, 0] as [number, number, number] } }
    expect(gameReducer(state, { type: 'TICK', dt: 1 / 60 }).phase).toBe('playing')
  })
  for (const shot of SHOT_ORDER) {
    it(`executes intentional ${shot} once with shared racket contact`, () => {
      let state = session()
      let home = state.players[0]!
      home.pos = [shot === 'NET_DROP' ? -1.15 : -2.4, 0, 0]
      home.selectedShot = shot
      // 站立手臂几何够不到 ≥2.15m 的杀球触球高度，杀球必须起跳——与真实一致。
      if (shot === 'SMASH') home = advanceBody(beginBodyAction(home, 'jump'), 0.3)
      let player = beginSwing(home)
      player.swing = { ...player.swing, elapsed: 0.02, phase: 'swinging' }
      const point = idealContactPoint(home.pos, 0, shot)
      const velocity: [number, number, number] = [-7, -1, 0]
      state = { ...state, phase: 'playing', lastHitter: 1, players: [player, state.players[1]], shuttle: { pos: placeShuttleForCorkCenter(point, velocity), vel: velocity, spin: [0, 0, 0] } }
      const hit = gameReducer(state, { type: 'TICK', dt: 1 / 120 })
      expect(hit.lastHitter).toBe(0)
      expect(hit.rallyHits).toBe(1)
      expect(hit.players[0]?.contactPose).not.toBeNull()
      expect(hit.players[0]?.swing.phase).toBe('recovery')
      expect(hit.training.shots).toContain(shot)
      const again = gameReducer(hit, { type: 'TICK', dt: 1 / 120 })
      expect(again.rallyHits).toBe(1)
      let flight = again
      for (let frame = 0; frame < 600 && flight.phase === 'playing'; frame++) flight = gameReducer(flight, { type: 'TICK', dt: 1 / 120 })
      expect(flight.lastPoint?.reason).toBe('in')
      expect(flight.lastPoint?.winner).toBe(0)
    })
  }

  it('keeps contact open through the first 60ms of visual recovery', () => {
    const makeState = (elapsed: number) => {
      const state = session()
      const home = createPlayer(0)
      home.pos = [-2.4, 0, 0]
      home.swing = { ...beginSwing(home).swing, phase: 'recovery', elapsed, shot: 'DRIVE' }
      const velocity: [number, number, number] = [-7, -1, 0]
      const contact = idealContactPoint(home.pos, 0, 'DRIVE')
      return { ...state, phase: 'playing' as const, lastHitter: 1 as const,
        players: [home, state.players[1]] as typeof state.players,
        shuttle: { pos: placeShuttleForCorkCenter(contact, velocity), vel: velocity, spin: [0, 0, 0] as [number, number, number] } }
    }

    const lateEdge = gameReducer(makeState(0.18), { type: 'TICK', dt: 1 / 120 })
    expect(lateEdge.lastHitter).toBe(0)
    expect(lateEdge.players[0]?.feedback).toContain('偏晚')
    expect(gameReducer(makeState(0.225), { type: 'TICK', dt: 1 / 120 }).lastHitter).toBe(1)
  })

  it('accepts a racket-edge contact just outside the strict arm sphere', () => {
    const state = session()
    const home = createPlayer(0)
    home.pos = [-2.4, 0, 0]
    home.swing = { ...beginSwing(home).swing, phase: 'swinging', elapsed: 0.02, shot: 'DRIVE' }
    const velocity: [number, number, number] = [-7, -1, 0]
    const contact: [number, number, number] = [-1.64, 1.25, 1.084]
    const edge = { ...state, phase: 'playing' as const, lastHitter: 1 as const,
      players: [home, state.players[1]] as typeof state.players,
      shuttle: { pos: placeShuttleForCorkCenter(contact, velocity), vel: velocity, spin: [0, 0, 0] as [number, number, number] } }

    expect(gameReducer(edge, { type: 'TICK', dt: 1 / 120 }).lastHitter).toBe(0)
  })
})
