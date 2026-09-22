import { describe, expect, it } from 'vitest'
import {
  JEV_CANDIDATE_IDS,
  JEV_INTENTS,
  acceptJevOutput,
  createJevObservation,
  createJevRequest,
  decideJevRule,
  evaluateJevSamples,
  parseJevOutput,
  serializeJevObservation,
  updateJevIntent,
  type JevCallSample,
  type JevObservation,
} from './jev'
import { JEV_SCENARIOS } from './jevScenarios'

function scenario(id = 'press-backcourt'): JevObservation {
  const found = JEV_SCENARIOS.find(item => item.id === id)
  if (!found) throw new Error(`Missing scenario: ${id}`)
  return createJevObservation(found.observation)
}

function candidateOutput(observation: JevObservation, candidateId = 'clear-deep') {
  return {
    type: 'candidateId',
    rallyId: observation.rallyId,
    decisionVersion: observation.decisionVersion,
    candidateId,
  }
}

function intentOutput(observation: JevObservation, intent = 'press-backcourt') {
  return { type: 'intent', rallyId: observation.rallyId, decisionVersion: observation.decisionVersion, intent }
}

function unknownOutput(observation: JevObservation) {
  return { type: 'unknown', rallyId: observation.rallyId, decisionVersion: observation.decisionVersion }
}

describe('JEV offline rule baseline', () => {
  it('defines exactly six intentions and finite unique action IDs', () => {
    expect(JEV_INTENTS).toHaveLength(6)
    expect(new Set(JEV_CANDIDATE_IDS).size).toBe(JEV_CANDIDATE_IDS.length)
    expect(new Set(JEV_SCENARIOS.map(item => item.expectedIntent).filter(Boolean))).toEqual(new Set(JEV_INTENTS))
  })

  it.each(JEV_SCENARIOS)('$id selects its explicit baseline without randomness', fixture => {
    const observation = createJevObservation(fixture.observation)
    const before = serializeJevObservation(observation)
    const first = decideJevRule(observation)
    expect(first.intentState?.intent ?? null).toBe(fixture.expectedIntent)
    if (fixture.expectedCandidateId === null) {
      expect(first.output.type).toBe('unknown')
    } else {
      expect(first.output).toEqual(candidateOutput(observation, fixture.expectedCandidateId))
    }
    for (let i = 0; i < 10; i++) expect(decideJevRule(observation)).toEqual(first)
    expect(decideJevRule({ ...observation, legalCandidates: [...observation.legalCandidates].reverse() })).toEqual(first)
    expect(serializeJevObservation(observation)).toBe(before)
  })

  it('never invents an unreachable net action', () => {
    const observation = scenario('net-unreachable')
    expect(observation.legalCandidates.some(candidate => candidate.id === 'net-tight')).toBe(false)
    const result = acceptJevOutput(candidateOutput(observation, 'net-tight'), createJevRequest(observation, 0, 100), observation, 10)
    expect(result.reason).toBe('invalid-output')
    expect(result.output).toEqual(decideJevRule(observation).output)
  })
})

describe('JEV visible observation boundary', () => {
  it('whitelists every nested field and removes hidden input/state and toJSON hooks', () => {
    const base = scenario()
    const dirty = {
      ...base,
      pendingPlayerInput: 'SECRET',
      randomSeed: 'SECRET',
      toJSON: () => ({ leaked: 'SECRET' }),
      self: { ...base.self, input: 'SECRET', toJSON: () => 'SECRET' },
      opponent: { ...base.opponent, stamina: 'SECRET', queuedShot: 'SECRET' },
      shuttle: { ...base.shuttle, spin: 'SECRET' },
      score: { ...base.score, internal: 'SECRET' },
      recentShots: [{ index: 1, actor: 'self' as const, candidateId: 'clear-deep' as const, target: [5, 0, 0] as const, input: 'SECRET' }],
      legalCandidates: base.legalCandidates.map(candidate => ({
        ...candidate,
        input: 'SECRET',
        effects: { ...candidate.effects, hiddenOpponentStamina: 'SECRET', toJSON: () => 'SECRET' },
      })),
    }
    const serialized = serializeJevObservation(dirty)
    expect(serialized).not.toContain('SECRET')
    expect(serialized).not.toContain('toJSON')
    expect(JSON.parse(serialized)).toEqual(createJevObservation(dirty))
    expect(JSON.parse(serialized).opponent.stamina).toBeUndefined()
    expect(serializeJevObservation({ ...base, opponent: { ...base.opponent, staminaEstimate: 0.4 } })).toContain('"staminaEstimate":0.4')
  })

  it('copies request snapshots, includes score, and retains only six executed shots', () => {
    const base = scenario()
    const position: [number, number, number] = [-3, 0, 0]
    const request = createJevRequest({
      ...base,
      self: { ...base.self, position },
      recentShots: Array.from({ length: 9 }, (_, index) => ({ index, actor: 'self' as const, candidateId: 'clear-deep' as const, target: [5, 0, 0] as const })),
    }, 10, 100)
    position[0] = -6
    expect(request.observation.self.position[0]).toBe(-3)
    expect(request.observation.recentShots.map(shot => shot.index)).toEqual([3, 4, 5, 6, 7, 8])
    expect(request.observation.score).toEqual(base.score)
    expect(request.deadlineAtMs).toBe(110)
  })

  it('rejects non-finite observations, invalid stamina, duplicate and unbounded candidate IDs', () => {
    const base = scenario()
    expect(() => createJevObservation({ ...base, self: { ...base.self, position: [NaN, 0, 0] } })).toThrow()
    expect(() => createJevObservation({ ...base, self: { ...base.self, position: new Array(3) as [number, number, number] } })).toThrow()
    expect(() => createJevObservation({ ...base, score: { ...base.score, points: new Array(2) as [number, number] } })).toThrow()
    expect(() => createJevObservation({ ...base, legalCandidates: new Array(1) as JevObservation['legalCandidates'] })).toThrow()
    expect(() => createJevObservation({ ...base, recentShots: new Array(1) as JevObservation['recentShots'] })).toThrow()
    expect(() => createJevObservation({ ...base, self: { ...base.self, stamina: 1.1 } })).toThrow()
    expect(() => createJevObservation({ ...base, legalCandidates: [base.legalCandidates[0], base.legalCandidates[0]] })).toThrow()
    expect(() => createJevObservation({ ...base, legalCandidates: [{ ...base.legalCandidates[0], id: 'free-form' as never }] })).toThrow()
    expect(() => createJevRequest(base, 0, Infinity)).toThrow()
  })
})

describe('JEV strict external response acceptance', () => {
  it.each([
    null, undefined, true, 1, 'unknown', [], {},
    { type: 'move', rallyId: 'rally-1', decisionVersion: 1, target: [1, 2, 3] },
    { type: 'candidateId', rallyId: 'rally-1', decisionVersion: 1, candidateId: 'teleport' },
    { type: 'intent', rallyId: 'rally-1', decisionVersion: 1, intent: 'win' },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: 1, confidence: 1 },
    { type: 'unknown', rallyId: '', decisionVersion: 1 },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: NaN },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: -1 },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: 1.5 },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'unknown', rallyId: 'rally-1', decisionVersion: '1' },
  ])('rejects malformed external data %#', raw => {
    const observation = scenario()
    expect(parseJevOutput(raw)).toBeNull()
    const result = acceptJevOutput(raw, createJevRequest(observation, 0, 100), observation, 10)
    expect(result.source).toBe('rule')
    expect(result.reason).toBe('invalid-output')
    expect(result.output).toEqual(decideJevRule(observation).output)
  })

  it('rejects prototype fields, accessors, symbols, mixed variants and confidence without executing accessors', () => {
    const observation = scenario()
    const valid = candidateOutput(observation)
    let accessed = false
    const accessor = { ...valid }
    Object.defineProperty(accessor, 'candidateId', { get() { accessed = true; throw new Error('Do not execute') } })
    const hiddenExtra = { ...valid }
    Object.defineProperty(hiddenExtra, 'confidence', { value: 1 })
    for (const raw of [Object.create(valid), accessor, hiddenExtra, { ...valid, [Symbol('input')]: 1 }, { ...valid, intent: 'press-backcourt' }, { ...valid, confidence: 1 }]) {
      expect(parseJevOutput(raw)).toBeNull()
    }
    expect(accessed).toBe(false)
  })

  it('accepts candidate and intent variants, never a free-form action', () => {
    const observation = scenario()
    const request = createJevRequest(observation, 0, 100)
    for (const output of [candidateOutput(observation), intentOutput(observation)]) {
      expect(parseJevOutput(output)).toEqual(output)
      const accepted = acceptJevOutput(output, request, observation, 100)
      expect(accepted.source).toBe('external')
      expect(accepted.reason).toBe('accepted')
      expect(accepted.output).toEqual(candidateOutput(observation))
    }
  })

  it('treats explicit unknown and empty candidates as rule fallbacks', () => {
    for (const observation of [scenario(), scenario('empty-candidates')]) {
      const result = acceptJevOutput(unknownOutput(observation), createJevRequest(observation, 0, 100), observation, 10)
      expect(result.source).toBe('rule')
      expect(result.reason).toBe('unknown')
      expect(result.output).toEqual(decideJevRule(observation).output)
    }
  })

  it('rejects timeout, time before dispatch and invalid clocks', () => {
    const observation = scenario()
    const request = createJevRequest(observation, 10, 100)
    expect(acceptJevOutput(candidateOutput(observation), request, observation, 111).reason).toBe('timeout')
    for (const now of [9, NaN, Infinity]) {
      expect(acceptJevOutput(candidateOutput(observation), request, observation, now).reason).toBe('invalid-timing')
    }
  })

  it('rejects cross-point late responses and emits only current rally/version metadata', () => {
    const old = scenario()
    const current = { ...old, rallyId: 'rally-2', decisionVersion: 0 }
    const result = acceptJevOutput(candidateOutput(old), createJevRequest(old, 0, 100), current, 200)
    expect(result.reason).toBe('stale-rally')
    expect(result.source).toBe('rule')
    expect(result.output).toEqual(candidateOutput(current))
  })

  it('rejects mismatched response IDs and stale request versions, even if response matches current', () => {
    const observation = scenario()
    const request = createJevRequest(observation, 0, 100)
    expect(acceptJevOutput({ ...candidateOutput(observation), rallyId: 'other' }, request, observation, 10).reason).toBe('stale-rally')
    expect(acceptJevOutput({ ...candidateOutput(observation), decisionVersion: 2 }, request, observation, 10).reason).toBe('stale-version')
    const newer = { ...observation, decisionVersion: 2 }
    expect(acceptJevOutput(candidateOutput(newer), request, newer, 10).reason).toBe('stale-version')
  })

  it('revalidates removed candidates and intents against the current legal set', () => {
    const observation = scenario('net-reachable')
    const current = { ...observation, legalCandidates: observation.legalCandidates.filter(candidate => candidate.id !== 'net-tight') }
    const request = createJevRequest(observation, 0, 100)
    for (const output of [candidateOutput(observation, 'net-tight'), intentOutput(observation, 'take-net')]) {
      const result = acceptJevOutput(output, request, current, 10)
      expect(result.reason).toBe('candidate-invalidated')
      expect(result.output).toEqual(decideJevRule(current).output)
    }
    const empty = { ...observation, legalCandidates: [] }
    expect(acceptJevOutput(candidateOutput(observation, 'net-tight'), request, empty, 10).output.type).toBe('unknown')
  })

  it('does not accept newly introduced actions absent from the original request', () => {
    const observation = scenario('net-unreachable')
    const current = { ...observation, legalCandidates: scenario('net-reachable').legalCandidates }
    const result = acceptJevOutput(candidateOutput(observation, 'net-tight'), createJevRequest(observation, 0, 100), current, 10)
    expect(result.reason).toBe('invalid-output')
  })
})

describe('JEV persistent intent', () => {
  it('holds intent across versions, small motion and changed proposals without a time-to-live', () => {
    const observation = scenario()
    const memory = updateJevIntent(observation)
    expect(memory?.intent).toBe('press-backcourt')
    const next = { ...observation, decisionVersion: 100, opponent: { ...observation.opponent, position: [2.8, 0, 0.1] as const } }
    expect(updateJevIntent(next, memory, 'front-back')).toEqual(memory)
    const accepted = acceptJevOutput(intentOutput(next, 'front-back'), createJevRequest(next, 0, 100), next, 10, memory)
    expect(accepted.intentState).toEqual(memory)
    expect(accepted.reason).toBe('intent-held')
    const incompatible = acceptJevOutput(candidateOutput(next, 'drop-front'), createJevRequest(next, 0, 100), next, 10, memory)
    expect(incompatible.reason).toBe('intent-held')
    expect(incompatible.output).toEqual(candidateOutput(next))
  })

  it('updates after a completed goal, not merely after receiving a proposal', () => {
    const observation = scenario('open-gap')
    const memory = updateJevIntent(observation)
    const next = {
      ...observation,
      decisionVersion: 2,
      recentShots: [{ index: 1, actor: 'self' as const, candidateId: 'smash-left' as const, target: [3, 0, -2.2] as const }],
    }
    expect(updateJevIntent(next, memory, 'extend-rally')?.intent).toBe('extend-rally')
    expect(updateJevIntent({ ...observation, decisionVersion: 2 }, memory, 'extend-rally')).toEqual(memory)
  })

  it.each(JEV_INTENTS)('completes the visible %s goal without relying on a timeout', intent => {
    const fixtureId = {
      'press-backcourt': 'opponent-retreating',
      'front-back': 'opponent-retreating',
      'attack-gap': 'open-gap',
      'take-net': 'net-reachable',
      'defensive-transition': 'low-passive',
      'extend-rally': 'fatigued',
    }[intent]
    let observation = scenario(fixtureId)
    if (intent === 'press-backcourt') observation = { ...observation, opponent: { ...observation.opponent, position: [4.6, 0, 0] } }
    if (intent === 'front-back') observation = {
      ...observation,
      recentShots: [{ index: 0, actor: 'self', candidateId: 'clear-deep', target: [6, 0, 0] }],
    }
    const memory = updateJevIntent(observation, null, intent)
    let next: JevObservation = { ...observation, decisionVersion: 2 }
    if (intent === 'press-backcourt') next = { ...next, opponent: { ...next.opponent, position: [5, 0, 0] } }
    if (intent === 'front-back') next = { ...next, recentShots: [...next.recentShots, { index: 1, actor: 'self', candidateId: 'drop-front', target: [1, 0, 0] }] }
    if (intent === 'attack-gap') next = { ...next, recentShots: [{ index: 1, actor: 'self', candidateId: 'smash-left', target: [3, 0, -2] }] }
    if (intent === 'take-net') next = { ...next, recentShots: [{ index: 1, actor: 'self', candidateId: 'net-tight', target: [0.6, 0, 0] }] }
    if (intent === 'defensive-transition') next = {
      ...next,
      shuttle: { ...next.shuttle, position: [-1, 2, 0] },
      recentShots: [{ index: 1, actor: 'self', candidateId: 'lift-safe', target: [5.5, 0, 0] }],
    }
    if (intent === 'extend-rally') next = {
      ...next,
      recentShots: Array.from({ length: 6 }, (_, index) => ({
        index: index + 1, actor: index % 2 === 0 ? 'self' : 'opponent', candidateId: 'clear-deep', target: [5, 0, 0],
      })),
    }
    const proposed = intent === 'extend-rally' ? 'press-backcourt' : 'extend-rally'
    expect(updateJevIntent({ ...observation, decisionVersion: 2 }, memory, proposed)).toEqual(memory)
    expect(updateJevIntent({ ...next, decisionVersion: 1 }, memory, proposed)).toEqual(memory)
    expect(updateJevIntent(next, memory, proposed)?.intent).toBe(proposed)
    expect(updateJevIntent(next, memory, proposed)?.startedAtVersion).toBe(2)
  })

  it('ignores old executed shots and resets when the open gap changes sides', () => {
    const observation: JevObservation = {
      ...scenario('open-gap'),
      recentShots: [{ index: 1, actor: 'self', candidateId: 'smash-left', target: [3, 0, -2] }],
    }
    const memory = updateJevIntent(observation)
    expect(updateJevIntent({ ...observation, decisionVersion: 2 }, memory, 'extend-rally')).toEqual(memory)
    const switched = { ...observation, decisionVersion: 2, opponent: { ...observation.opponent, position: [3, 0, -2] as const } }
    expect(updateJevIntent(switched, memory)?.gapSide).toBe(1)
    expect(updateJevIntent(switched, memory)?.startedAtVersion).toBe(2)
  })

  it('updates for material pressure changes, invalidated choices, or a new rally', () => {
    const observation = scenario()
    const memory = updateJevIntent(observation)
    const passive = { ...scenario('low-passive'), decisionVersion: 2 }
    expect(updateJevIntent(passive, memory)?.intent).toBe('defensive-transition')
    const net = scenario('net-reachable')
    const netMemory = updateJevIntent(net)
    const unreachable = { ...net, decisionVersion: 2, legalCandidates: net.legalCandidates.filter(candidate => candidate.id !== 'net-tight') }
    expect(updateJevIntent(unreachable, netMemory)?.intent).not.toBe('take-net')
    const nextRally = { ...observation, rallyId: 'rally-2' }
    expect(updateJevIntent(nextRally, memory)?.rallyId).toBe('rally-2')
    expect(updateJevIntent({ ...observation, legalCandidates: [] }, memory)).toBeNull()
  })
})

describe('JEV offline call-sample metrics (synthetic, not provider measurements)', () => {
  it('reports null rates, percentiles and costs without call samples', () => {
    expect(evaluateJevSamples([])).toEqual({
      sampleCount: 0,
      legalRate: null,
      unknownRate: null,
      timeoutRate: null,
      staleRate: null,
      fallbackRate: null,
      latencyMs: { sampleCount: 0, p50: null, p95: null },
      costUsd: { sampleCount: 0, total: null, mean: null },
    })
  })

  it('computes rates, nearest-rank p50/p95 and explicit costs without counting fallback as external legality', () => {
    const observation = scenario()
    const request = createJevRequest(observation, 0, 100)
    const calls: JevCallSample[] = [
      { request, currentObservation: observation, response: candidateOutput(observation), receivedAtMs: 10, costUsd: 0.01 },
      { request, currentObservation: observation, response: unknownOutput(observation), receivedAtMs: 20, costUsd: 0.01 },
      { request, currentObservation: observation, response: candidateOutput(observation), receivedAtMs: 101, costUsd: 0.01 },
      { request, currentObservation: { ...observation, rallyId: 'rally-2' }, response: candidateOutput(observation), receivedAtMs: 40, costUsd: 0.01 },
      { request, currentObservation: observation, response: { ...candidateOutput(observation), confidence: 1 }, receivedAtMs: 50, costUsd: 0.01 },
    ]
    const metrics = evaluateJevSamples(calls)
    expect(metrics).toMatchObject({ sampleCount: 5, legalRate: 0.2, unknownRate: 0.2, timeoutRate: 0.2, staleRate: 0.2, fallbackRate: 0.8 })
    expect(metrics.latencyMs).toEqual({ sampleCount: 5, p50: 40, p95: 101 })
    expect(metrics.costUsd.total).toBeCloseTo(0.05)
    expect(metrics.costUsd.mean).toBeCloseTo(0.01)
  })

  it('counts timeout and staleness independently and leaves missing/invalid cost unknown', () => {
    const observation = scenario()
    const request = createJevRequest(observation, 0, 100)
    const sample: JevCallSample = { request, currentObservation: { ...observation, decisionVersion: 2 }, response: unknownOutput(observation), receivedAtMs: 101 }
    expect(evaluateJevSamples([sample])).toMatchObject({ legalRate: 0, unknownRate: 1, timeoutRate: 1, staleRate: 1, costUsd: { sampleCount: 0, total: null, mean: null } })
    const mixed = evaluateJevSamples([sample, { ...sample, costUsd: 0 }])
    expect(mixed.costUsd).toEqual({ sampleCount: 1, total: null, mean: 0 })
    const invalid = evaluateJevSamples([{ ...sample, receivedAtMs: NaN, costUsd: -1 }, { ...sample, receivedAtMs: -1, costUsd: Infinity }])
    expect(invalid.latencyMs).toEqual({ sampleCount: 0, p50: null, p95: null })
    expect(invalid.costUsd).toEqual({ sampleCount: 0, total: null, mean: null })
  })
})
