import { describe, expect, it } from 'vitest'
import {
  createRallyContactState,
  stepRallyContact,
  type RallyContactConfig,
  type RallyContactState,
} from './rallyContact'

const defaultConfig: RallyContactConfig = {
  contactHeightCm: 0,
  contactReachCm: 0,
  contactSideCm: 0,
  incomingSpeed: 18,
  power: 0.78,
  racketFaceDeg: 0,
  swingOffsetMs: 0,
  targetZ: -0.35,
  technique: 'AUTO',
}

describe('rally contact play state', () => {
  it('lands the default AUTO drive inside the opponent court', () => {
    const state = runUntilTerminal(defaultConfig)

    expect(state.result?.outcome).toBe('hit')
    expect(state.result?.technique).toBe('DRIVE')
    expect(state.result?.contactError).toBeLessThan(0.001)
    expect(state.result?.netClearance).toBeGreaterThan(0)
    expect(state.landing).toBe('in')
  })

  it('keeps an unreachable shuttle as a visible miss rather than a hit', () => {
    const state = runUntilTerminal({ ...defaultConfig, contactReachCm: 200 })

    expect(state.phase).toBe('missed')
    expect(state.landing).toBe('miss')
    expect(state.result?.outcome).toBe('miss')
    expect(state.result?.reason).toBe('unreachable')
  })
})

function runUntilTerminal(config: RallyContactConfig): RallyContactState {
  let state = createRallyContactState(config)
  for (let frame = 0; frame < 600; frame += 1) {
    state = stepRallyContact(state, 1 / 120, config).state
    if (state.phase === 'landed' || state.phase === 'missed') return state
  }
  throw new Error('Rally contact scenario did not reach a terminal state')
}
