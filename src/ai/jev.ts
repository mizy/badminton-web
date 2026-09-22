/** Independent offline boundary: no GameState, physics, clock, randomness or service dependencies. */
export const JEV_INTENTS = [
  'press-backcourt', // 压后场
  'front-back', // 前后调动
  'attack-gap', // 攻击空档
  'take-net', // 抢网
  'defensive-transition', // 防守过渡
  'extend-rally', // 延长回合
] as const
export type JevIntent = typeof JEV_INTENTS[number]

export const JEV_CANDIDATE_IDS = [
  'clear-deep', 'drop-front', 'drive-left', 'drive-right',
  'smash-left', 'smash-right', 'net-tight', 'lift-safe',
] as const
export type JevCandidateId = typeof JEV_CANDIDATE_IDS[number]

/** Metres, [depth, height, lateral], normalized so self occupies negative depth. */
export type JevVector = readonly [number, number, number]
export interface JevMotion {
  readonly position: JevVector
  readonly velocity: JevVector // m/s, visible motion only
}
export interface JevCandidate {
  readonly id: JevCandidateId
  /** Caller-supplied predicted effects, not instructions or hidden player state. */
  readonly effects: {
    readonly target: JevVector
    readonly contactHeight: number
    readonly flightTimeMs: number
    readonly recoveryTimeMs: number
    readonly staminaCost: number // [0, 1]
    readonly risk: number // [0, 1]
  }
}
export interface JevRecentShot {
  readonly index: number // strictly increasing executed-shot index within the rally
  readonly actor: 'self' | 'opponent'
  readonly candidateId: JevCandidateId
  readonly target: JevVector
}
export interface JevObservation {
  readonly rallyId: string
  readonly decisionVersion: number // caller increments whenever the decision context changes
  readonly self: JevMotion & { readonly stamina: number }
  readonly opponent: JevMotion & { readonly staminaEstimate?: number }
  readonly shuttle: JevMotion
  readonly score: { readonly points: readonly [number, number]; readonly games: readonly [number, number] }
  readonly recentShots: readonly JevRecentShot[] // only the last six are serialized
  /** Already legal/reachable. The caller owns legality and must omit unreachable actions. */
  readonly legalCandidates: readonly JevCandidate[]
}

interface JevEnvelope {
  readonly rallyId: string
  readonly decisionVersion: number
}
/** The only external output shapes. Extra keys, including confidence, are rejected. */
export type JevOutput = JevEnvelope & (
  | { readonly type: 'intent'; readonly intent: JevIntent }
  | { readonly type: 'candidateId'; readonly candidateId: JevCandidateId }
  | { readonly type: 'unknown' }
)
export interface JevRequest {
  readonly observation: JevObservation
  readonly issuedAtMs: number
  readonly deadlineAtMs: number
}
export interface JevIntentState {
  readonly rallyId: string
  readonly intent: JevIntent
  readonly startedAtVersion: number
  readonly afterShotIndex: number
  readonly situationKey: string
  readonly initialDepth: 'front' | 'middle' | 'back'
  readonly gapSide: -1 | 1
}
export interface JevDecision {
  readonly output: JevOutput
  readonly intentState: JevIntentState | null
}
export type JevAcceptanceReason =
  | 'accepted' | 'invalid-output' | 'unknown' | 'invalid-timing' | 'timeout'
  | 'stale-rally' | 'stale-version' | 'candidate-invalidated' | 'intent-held'
export interface JevAcceptance extends JevDecision {
  readonly source: 'external' | 'rule'
  readonly reason: JevAcceptanceReason
}

function requireValue(condition: boolean, field: string): void {
  if (!condition) throw new TypeError(`Invalid JEV ${field}`)
}
function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function integer(value: unknown): value is number {
  return finiteNonnegative(value) && Number.isSafeInteger(value)
}
function unit(value: number, field: string): number {
  requireValue(finiteNonnegative(value) && value <= 1, field)
  return value
}
function nonnegative(value: number, field: string): number {
  requireValue(finiteNonnegative(value), field)
  return value
}
function vector(value: JevVector): JevVector {
  requireValue(Array.isArray(value) && value.length === 3
    && [value[0], value[1], value[2]].every(v => typeof v === 'number' && Number.isFinite(v)), 'vector')
  return [value[0], value[1], value[2]]
}
function motion(value: JevMotion): JevMotion {
  return { position: vector(value.position), velocity: vector(value.velocity) }
}
function pair(value: readonly [number, number]): readonly [number, number] {
  requireValue(Array.isArray(value) && value.length === 2 && integer(value[0]) && integer(value[1]), 'score')
  return [value[0], value[1]]
}
function isIntent(value: unknown): value is JevIntent {
  return typeof value === 'string' && (JEV_INTENTS as readonly string[]).includes(value)
}
function isCandidateId(value: unknown): value is JevCandidateId {
  return typeof value === 'string' && (JEV_CANDIDATE_IDS as readonly string[]).includes(value)
}

/** Explicit deep whitelist; never spread source objects or serialize their toJSON hooks. */
export function createJevObservation(input: JevObservation): JevObservation {
  requireValue(typeof input.rallyId === 'string' && input.rallyId.trim().length > 0, 'rallyId')
  requireValue(integer(input.decisionVersion), 'decisionVersion')
  requireValue(Array.isArray(input.legalCandidates) && input.legalCandidates.length <= JEV_CANDIDATE_IDS.length, 'legalCandidates')
  requireValue(Array.isArray(input.recentShots), 'recentShots')
  const ids = new Set<JevCandidateId>()
  const legalCandidates = Array.from(input.legalCandidates, candidate => {
    requireValue(isCandidateId(candidate.id) && !ids.has(candidate.id), 'candidateId')
    ids.add(candidate.id)
    const effects = candidate.effects
    return {
      id: candidate.id,
      effects: {
        target: vector(effects.target),
        contactHeight: nonnegative(effects.contactHeight, 'contactHeight'),
        flightTimeMs: nonnegative(effects.flightTimeMs, 'flightTimeMs'),
        recoveryTimeMs: nonnegative(effects.recoveryTimeMs, 'recoveryTimeMs'),
        staminaCost: unit(effects.staminaCost, 'staminaCost'),
        risk: unit(effects.risk, 'risk'),
      },
    }
  })
  let lastIndex = -1
  const recentShots = Array.from(input.recentShots, shot => {
    requireValue(integer(shot.index) && shot.index > lastIndex, 'shot index')
    requireValue(shot.actor === 'self' || shot.actor === 'opponent', 'shot actor')
    requireValue(isCandidateId(shot.candidateId), 'executed shot ID')
    lastIndex = shot.index
    return { index: shot.index, actor: shot.actor, candidateId: shot.candidateId, target: vector(shot.target) }
  }).slice(-6)
  const opponent = motion(input.opponent)
  return {
    rallyId: input.rallyId,
    decisionVersion: input.decisionVersion,
    self: { ...motion(input.self), stamina: unit(input.self.stamina, 'stamina') },
    opponent: input.opponent.staminaEstimate === undefined
      ? opponent
      : { ...opponent, staminaEstimate: unit(input.opponent.staminaEstimate, 'staminaEstimate') },
    shuttle: motion(input.shuttle),
    score: { points: pair(input.score.points), games: pair(input.score.games) },
    recentShots,
    legalCandidates,
  }
}

export function serializeJevObservation(input: JevObservation): string {
  return JSON.stringify(createJevObservation(input))
}

/** Both times use the caller's same monotonic clock. No network request is made. */
export function createJevRequest(observation: JevObservation, issuedAtMs: number, timeoutMs: number): JevRequest {
  requireValue(finiteNonnegative(issuedAtMs) && finiteNonnegative(timeoutMs) && Number.isFinite(issuedAtMs + timeoutMs), 'request timing')
  return { observation: createJevObservation(observation), issuedAtMs, deadlineAtMs: issuedAtMs + timeoutMs }
}

/** Accept parsed JSON objects only, not JSON strings, inherited fields or accessors. */
export function parseJevOutput(value: unknown): JevOutput | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    const keys = Reflect.ownKeys(value)
    for (const key of keys) {
      if (typeof key !== 'string') return null
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null
      fields[key] = descriptor.value as unknown
    }
    const { type, rallyId, decisionVersion } = fields
    if (typeof rallyId !== 'string' || !rallyId.trim() || !integer(decisionVersion)) return null
    const expected = type === 'intent' ? 'intent' : type === 'candidateId' ? 'candidateId' : null
    const allowed = ['type', 'rallyId', 'decisionVersion', ...(expected ? [expected] : [])]
    if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key as string))) return null
    if (type === 'intent' && isIntent(fields.intent)) return { type, rallyId, decisionVersion, intent: fields.intent }
    if (type === 'candidateId' && isCandidateId(fields.candidateId)) return { type, rallyId, decisionVersion, candidateId: fields.candidateId }
    if (type === 'unknown') return { type, rallyId, decisionVersion }
    return null
  } catch {
    // Revoked proxies and throwing traps are invalid data, not a reason to skip fallback.
    return null
  }
}

const CANDIDATE_INTENTS: Readonly<Record<JevCandidateId, readonly JevIntent[]>> = {
  'clear-deep': ['press-backcourt', 'front-back', 'defensive-transition', 'extend-rally'],
  'drop-front': ['front-back', 'extend-rally'],
  'drive-left': ['attack-gap', 'extend-rally'],
  'drive-right': ['attack-gap', 'extend-rally'],
  'smash-left': ['attack-gap'],
  'smash-right': ['attack-gap'],
  'net-tight': ['take-net', 'front-back'],
  'lift-safe': ['press-backcourt', 'defensive-transition', 'extend-rally'],
}
function supports(candidate: JevCandidate, intent: JevIntent): boolean {
  return CANDIDATE_INTENTS[candidate.id].includes(intent)
}
function canFulfill(observation: JevObservation, intent: JevIntent): boolean {
  return observation.legalCandidates.some(candidate => supports(candidate, intent))
}
function gapSide(observation: JevObservation): -1 | 1 {
  return observation.opponent.position[2] + observation.opponent.velocity[2] * 0.25 >= 0 ? -1 : 1
}
function depth(target: JevVector): JevIntentState['initialDepth'] {
  return target[0] <= 2 ? 'front' : target[0] >= 4.5 ? 'back' : 'middle'
}
function lastSelfShot(observation: JevObservation): JevRecentShot | undefined {
  return [...observation.recentShots].reverse().find(shot => shot.actor === 'self')
}
function ruleIntent(observation: JevObservation): JevIntent | null {
  const choices: JevIntent[] = []
  const contactHeight = Math.max(0, ...observation.legalCandidates.map(candidate => candidate.effects.contactHeight))
  if (contactHeight < 1.15 || (observation.shuttle.position[1] < 1 && observation.shuttle.velocity[1] < 0)) choices.push('defensive-transition')
  if (observation.self.stamina < 0.3 || (observation.opponent.staminaEstimate ?? 1) < 0.25) choices.push('extend-rally')
  if (observation.self.position[0] >= -1.8 && observation.legalCandidates.some(candidate => candidate.id === 'net-tight' && candidate.effects.contactHeight >= 1.35)) choices.push('take-net')
  if (observation.opponent.position[0] >= 4.5 || observation.opponent.velocity[0] > 0.8) choices.push('front-back')
  if (Math.abs(observation.opponent.position[2]) >= 1.3 || Math.abs(observation.opponent.velocity[2]) >= 1) choices.push('attack-gap')
  choices.push('press-backcourt', 'extend-rally', ...JEV_INTENTS)
  return choices.find(intent => canFulfill(observation, intent)) ?? null
}
function situationKey(observation: JevObservation): string {
  const intent = ruleIntent(observation)
  return intent === 'attack-gap' ? `${intent}:${gapSide(observation)}` : String(intent)
}
function goalComplete(observation: JevObservation, state: JevIntentState): boolean {
  if (observation.decisionVersion <= state.startedAtVersion) return false
  const shots = observation.recentShots.filter(shot => shot.actor === 'self' && shot.index > state.afterShotIndex)
  switch (state.intent) {
    case 'press-backcourt': return observation.opponent.position[0] >= 4.8
    case 'front-back': {
      const depths = new Set([state.initialDepth, ...shots.map(shot => depth(shot.target))])
      return depths.has('front') && depths.has('back')
    }
    case 'attack-gap': return shots.some(shot => shot.target[2] * state.gapSide >= 1.3)
    case 'take-net': return observation.self.position[0] >= -1.8 && shots.some(shot => shot.candidateId === 'net-tight')
    case 'defensive-transition': return shots.some(shot => shot.candidateId === 'clear-deep' || shot.candidateId === 'lift-safe')
      && observation.shuttle.position[1] >= 1.5 && Math.abs(observation.self.position[2]) <= 1
      && observation.self.position[0] >= -4.5 && observation.self.position[0] <= -2
    case 'extend-rally': return shots.length >= 3
  }
}

/** No TTL: retain plans until a visible goal, material situation change or loss of legal support. */
export function updateJevIntent(
  observation: JevObservation,
  previous: JevIntentState | null = null,
  proposed?: JevIntent,
): JevIntentState | null {
  const baseline = ruleIntent(observation)
  if (baseline === null) return null
  const key = situationKey(observation)
  if (previous && previous.rallyId === observation.rallyId
    && previous.startedAtVersion <= observation.decisionVersion
    && previous.situationKey === key && canFulfill(observation, previous.intent)
    && !goalComplete(observation, previous)) return previous
  const lastShot = lastSelfShot(observation)
  return {
    rallyId: observation.rallyId,
    intent: proposed && canFulfill(observation, proposed) ? proposed : baseline,
    startedAtVersion: observation.decisionVersion,
    afterShotIndex: observation.recentShots.at(-1)?.index ?? -1,
    situationKey: key,
    initialDepth: lastShot ? depth(lastShot.target) : 'middle',
    gapSide: gapSide(observation),
  }
}

function candidateScore(observation: JevObservation, candidate: JevCandidate, intent: JevIntent): number {
  const e = candidate.effects
  switch (intent) {
    case 'press-backcourt': return e.target[0] - e.risk * 3 - e.staminaCost * 2
    case 'front-back': {
      const last = lastSelfShot(observation)
      const front = last ? depth(last.target) === 'back'
        : observation.opponent.position[0] >= 3.35 || observation.opponent.velocity[0] > 0.8
      return (front ? -e.target[0] : e.target[0]) - e.risk * 2 - e.staminaCost
    }
    case 'attack-gap': return Math.abs(e.target[2] - observation.opponent.position[2] - observation.opponent.velocity[2] * 0.25) * 2
      + (candidate.id.startsWith('smash-') ? 0.5 : 0) - e.risk * 3 - e.staminaCost
    case 'take-net': return -e.target[0] - e.risk * 3 - e.staminaCost
    case 'defensive-transition': return (e.flightTimeMs - e.recoveryTimeMs) / 1000 - e.risk * 4 - e.staminaCost * 2
    case 'extend-rally': return Math.min(e.flightTimeMs / 1000, 3) - e.recoveryTimeMs / 1000 - e.risk * 8 - e.staminaCost * 5
  }
}
function pickCandidate(observation: JevObservation, intent: JevIntent): JevCandidate | undefined {
  return observation.legalCandidates.filter(candidate => supports(candidate, intent)).sort((a, b) =>
    candidateScore(observation, b, intent) - candidateScore(observation, a, intent)
    || JEV_CANDIDATE_IDS.indexOf(a.id) - JEV_CANDIDATE_IDS.indexOf(b.id),
  )[0]
}
function outputFor(observation: JevObservation, candidate?: JevCandidate): JevOutput {
  const envelope = { rallyId: observation.rallyId, decisionVersion: observation.decisionVersion }
  return candidate ? { ...envelope, type: 'candidateId', candidateId: candidate.id } : { ...envelope, type: 'unknown' }
}

/** Selectable offline rule baseline; never manufactures an action for an empty legal set. */
export function decideJevRule(observation: JevObservation, previous: JevIntentState | null = null): JevDecision {
  const intentState = updateJevIntent(observation, previous)
  return { output: outputFor(observation, intentState ? pickCandidate(observation, intentState.intent) : undefined), intentState }
}

/** Request identity, clock and current legality are authoritative, regardless of external confidence. */
export function acceptJevOutput(
  value: unknown,
  request: JevRequest,
  current: JevObservation,
  receivedAtMs: number,
  previous: JevIntentState | null = null,
): JevAcceptance {
  const fallback = (reason: JevAcceptanceReason): JevAcceptance => ({ ...decideJevRule(current, previous), source: 'rule', reason })
  if (request.observation.rallyId !== current.rallyId) return fallback('stale-rally')
  if (request.observation.decisionVersion !== current.decisionVersion) return fallback('stale-version')
  if (!finiteNonnegative(receivedAtMs) || !finiteNonnegative(request.issuedAtMs)
    || !finiteNonnegative(request.deadlineAtMs) || request.deadlineAtMs < request.issuedAtMs
    || receivedAtMs < request.issuedAtMs) return fallback('invalid-timing')
  if (receivedAtMs > request.deadlineAtMs) return fallback('timeout')
  const output = parseJevOutput(value)
  if (!output) return fallback('invalid-output')
  if (output.rallyId !== request.observation.rallyId) return fallback('stale-rally')
  if (output.decisionVersion !== request.observation.decisionVersion) return fallback('stale-version')
  if (output.type === 'unknown') return fallback('unknown')
  const offered = request.observation.legalCandidates
  if (output.type === 'candidateId') {
    if (!offered.some(candidate => candidate.id === output.candidateId)) return fallback('invalid-output')
    const candidate = current.legalCandidates.find(item => item.id === output.candidateId)
    if (!candidate) return fallback('candidate-invalidated')
    const baseline = ruleIntent(current)
    const proposed = baseline && supports(candidate, baseline) ? baseline : CANDIDATE_INTENTS[candidate.id][0]
    const intentState = updateJevIntent(current, previous, proposed)
    if (!intentState || !supports(candidate, intentState.intent)) return fallback('intent-held')
    return { source: 'external', reason: 'accepted', output: outputFor(current, candidate), intentState }
  }
  if (!canFulfill(request.observation, output.intent)) return fallback('invalid-output')
  const stillOffered = { ...current, legalCandidates: current.legalCandidates.filter(candidate => offered.some(item => item.id === candidate.id)) }
  if (!canFulfill(stillOffered, output.intent)) return fallback('candidate-invalidated')
  const intentState = updateJevIntent(current, previous, output.intent)
  if (!intentState || intentState.intent !== output.intent) return fallback('intent-held')
  return { source: 'external', reason: 'accepted', output: outputFor(current, pickCandidate(stillOffered, output.intent)), intentState }
}

/** Caller-provided call records only; fixture/rule evaluation does not create provider measurements. */
export interface JevCallSample {
  readonly request: JevRequest
  readonly currentObservation: JevObservation
  readonly response: unknown
  readonly receivedAtMs: number
  readonly costUsd?: number | null // explicit provider/billing cost; absent is not zero
  readonly previousIntent?: JevIntentState | null
}
export interface JevMetrics {
  readonly sampleCount: number
  /** Strict usable external response rate; fallback actions never inflate this metric. */
  readonly legalRate: number | null
  readonly unknownRate: number | null
  readonly timeoutRate: number | null
  readonly staleRate: number | null
  readonly fallbackRate: number | null
  readonly latencyMs: { readonly sampleCount: number; readonly p50: number | null; readonly p95: number | null }
  /** Total is null when any cost is missing; mean uses recorded costs only. */
  readonly costUsd: { readonly sampleCount: number; readonly total: number | null; readonly mean: number | null }
}

/** Nearest-rank percentiles. Unknown, timeout and stale counts are independent and may overlap. */
export function evaluateJevSamples(samples: readonly JevCallSample[]): JevMetrics {
  let legal = 0
  let unknown = 0
  let timeout = 0
  let stale = 0
  const latencies: number[] = []
  const costs: number[] = []
  for (const sample of samples) {
    const { request, currentObservation: current, receivedAtMs } = sample
    const accepted = acceptJevOutput(sample.response, request, current, receivedAtMs, sample.previousIntent)
    if (accepted.source === 'external') legal++
    const output = parseJevOutput(sample.response)
    if (output?.type === 'unknown') unknown++
    if (finiteNonnegative(receivedAtMs) && receivedAtMs > request.deadlineAtMs) timeout++
    if (request.observation.rallyId !== current.rallyId || request.observation.decisionVersion !== current.decisionVersion
      || (output && (output.rallyId !== request.observation.rallyId || output.decisionVersion !== request.observation.decisionVersion))) stale++
    const latency = receivedAtMs - request.issuedAtMs
    if (finiteNonnegative(receivedAtMs) && finiteNonnegative(request.issuedAtMs) && finiteNonnegative(latency)) latencies.push(latency)
    if (finiteNonnegative(sample.costUsd)) costs.push(sample.costUsd)
  }
  latencies.sort((a, b) => a - b)
  const percentile = (p: number): number | null => latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null
  const rate = (count: number): number | null => samples.length ? count / samples.length : null
  const total = costs.reduce((sum, cost) => sum + cost, 0)
  return {
    sampleCount: samples.length,
    legalRate: rate(legal),
    unknownRate: rate(unknown),
    timeoutRate: rate(timeout),
    staleRate: rate(stale),
    fallbackRate: rate(samples.length - legal),
    latencyMs: { sampleCount: latencies.length, p50: percentile(0.5), p95: percentile(0.95) },
    costUsd: { sampleCount: costs.length, total: costs.length > 0 && costs.length === samples.length ? total : null, mean: costs.length ? total / costs.length : null },
  }
}
