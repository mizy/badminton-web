import { createJevObservation, type JevCandidate, type JevCandidateId, type JevIntent, type JevObservation } from './jev'

export interface JevScenario {
  readonly id: string
  readonly observation: JevObservation
  readonly expectedIntent: JevIntent | null
  readonly expectedCandidateId: JevCandidateId | null
}

// Hand-authored legal options/effects, not physics predictions or provider call samples.
const clear: JevCandidate = {
  id: 'clear-deep',
  effects: { target: [6, 0, 0], contactHeight: 2, flightTimeMs: 2200, recoveryTimeMs: 500, staminaCost: 0.06, risk: 0.12 },
}
const drop: JevCandidate = {
  id: 'drop-front',
  effects: { target: [1.1, 0, 0], contactHeight: 2, flightTimeMs: 1100, recoveryTimeMs: 400, staminaCost: 0.04, risk: 0.16 },
}
const smashLeft: JevCandidate = {
  id: 'smash-left',
  effects: { target: [3, 0, -2.2], contactHeight: 2, flightTimeMs: 400, recoveryTimeMs: 700, staminaCost: 0.14, risk: 0.3 },
}
const smashRight: JevCandidate = { id: 'smash-right', effects: { ...smashLeft.effects, target: [3, 0, 2.2] } }
const lift: JevCandidate = {
  id: 'lift-safe',
  effects: { target: [5.5, 0, 0], contactHeight: 0.8, flightTimeMs: 2600, recoveryTimeMs: 400, staminaCost: 0.03, risk: 0.08 },
}
const net: JevCandidate = {
  id: 'net-tight',
  effects: { target: [0.6, 0, 0], contactHeight: 1.6, flightTimeMs: 550, recoveryTimeMs: 250, staminaCost: 0.04, risk: 0.14 },
}
const base: JevObservation = {
  rallyId: 'rally-1',
  decisionVersion: 1,
  self: { position: [-3, 0, 0], velocity: [0, 0, 0], stamina: 0.8 },
  opponent: { position: [3, 0, 0], velocity: [0, 0, 0] },
  shuttle: { position: [-2.3, 2, 0], velocity: [-2, -1, 0] },
  score: { points: [8, 7], games: [0, 0] },
  recentShots: [],
  legalCandidates: [clear, drop, smashLeft, smashRight],
}

/** Fixed B2 comparison fixtures. Each baseline is explicit and independently testable. */
export const JEV_SCENARIOS: readonly JevScenario[] = [
  {
    id: 'press-backcourt', observation: createJevObservation(base),
    expectedIntent: 'press-backcourt', expectedCandidateId: 'clear-deep',
  },
  {
    id: 'opponent-retreating',
    observation: createJevObservation({ ...base, opponent: { position: [4, 0, 0], velocity: [1.5, 0, 0] } }),
    expectedIntent: 'front-back', expectedCandidateId: 'drop-front',
  },
  {
    id: 'open-gap',
    observation: createJevObservation({ ...base, opponent: { position: [3, 0, 2], velocity: [0, 0, 0.5] } }),
    expectedIntent: 'attack-gap', expectedCandidateId: 'smash-left',
  },
  {
    id: 'low-passive',
    observation: createJevObservation({
      ...base,
      shuttle: { position: [-2.3, 0.7, 0], velocity: [-2, -2, 0] },
      legalCandidates: [{ ...lift, effects: { ...lift.effects, contactHeight: 0.7 } }],
    }),
    expectedIntent: 'defensive-transition', expectedCandidateId: 'lift-safe',
  },
  {
    id: 'fatigued',
    observation: createJevObservation({ ...base, self: { ...base.self, stamina: 0.18 },
      shuttle: { ...base.shuttle, position: [-2.3, 1.5, 0] },
      legalCandidates: [clear, drop, lift].map(candidate => ({ ...candidate, effects: { ...candidate.effects, contactHeight: 1.5 } })) }),
    expectedIntent: 'extend-rally', expectedCandidateId: 'lift-safe',
  },
  {
    id: 'net-unreachable',
    observation: createJevObservation({
      ...base,
      self: { ...base.self, position: [-4.8, 0, 0] },
      shuttle: { position: [-4.1, 1.5, 0], velocity: [-1, -1, 0] },
      legalCandidates: [clear, drop, lift].map(candidate => ({ ...candidate, effects: { ...candidate.effects, contactHeight: 1.5 } })),
    }),
    expectedIntent: 'press-backcourt', expectedCandidateId: 'clear-deep',
  },
  {
    id: 'empty-candidates', observation: createJevObservation({ ...base, legalCandidates: [] }),
    expectedIntent: null, expectedCandidateId: null,
  },
  {
    id: 'net-reachable',
    observation: createJevObservation({
      ...base,
      self: { ...base.self, position: [-1, 0, 0] },
      shuttle: { position: [-0.5, 1.6, 0], velocity: [-1, -0.5, 0] },
      legalCandidates: [net, clear, drop].map(candidate => ({ ...candidate, effects: { ...candidate.effects, contactHeight: 1.6 } })),
    }),
    expectedIntent: 'take-net', expectedCandidateId: 'net-tight',
  },
]
