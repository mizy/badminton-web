/** 羽毛球动作的纯时序/拍面/轨迹语义；骨架渲染只投影这些数据。 */

import { normalize3, type Vec3 } from './racketKinematics'

export const BADMINTON_ACTIONS = [
  'ready',
  'split_step',
  'serve',
  'forehand_clear',
  'backhand_clear',
  'forehand_drive',
  'backhand_drive',
  'smash',
  'drop',
  'net_shot',
  'net_kill',
  'lift',
  'defense_lunge',
  'block',
] as const

export type BadmintonAction = typeof BADMINTON_ACTIONS[number]
export type BadmintonMotionPhase = 'ready' | 'load' | 'contact' | 'follow_through' | 'recover'

export interface BadmintonMotionSample {
  action: BadmintonAction
  contactCue: boolean
  cycle: number
  faceNormal: Vec3
  label: string
  phase: BadmintonMotionPhase
  phaseLabel: string
  racketDirection: Vec3
}

export interface BadmintonShuttleSample {
  corkCenter: Vec3
  nextCorkCenter: Vec3
}

interface ActionSpec {
  arc: number
  contact: number
  contactDirection: Vec3
  duration: number
  faceNormal: Vec3
  incomingOffset: Vec3
  label: string
  outgoingOffset: Vec3
}

const NO_SHUTTLE = new Set<BadmintonAction>(['ready', 'split_step'])

const ACTION_SPECS: Record<BadmintonAction, ActionSpec> = {
  ready: spec('Ready stance', 1.4, 0.5, [-0.4, 0.1, 0], [0.4, 0.08, 0], 0.1, [0.55, 0.25, -0.05], [1, 0, 0]),
  split_step: spec('Split step', 1.05, 0.42, [-0.45, 0.1, -0.1], [0.35, 0.05, -0.05], 0.08, [0.58, 0.22, -0.08], [1, 0, 0]),
  serve: spec('Low serve', 1.9, 0.48, [-0.38, -0.1, -0.1], [2.57, -0.18, 0.03], 0.08, [0.82, -0.36, 0.12], [0.98, 0.18, 0.04]),
  forehand_clear: spec('Forehand clear', 1.85, 0.5, [-0.52, -0.17, -0.02], [6.18, 0.78, 0.28], 1, [0.48, 0.86, 0.12], [0.93, 0.36, 0.08]),
  backhand_clear: spec('Backhand clear', 1.95, 0.53, [-0.55, -0.25, 0.07], [5.75, 0.65, -0.13], 0.9, [0.35, 0.82, -0.42], [0.9, 0.36, -0.18]),
  forehand_drive: spec('Forehand drive', 1.35, 0.45, [-0.76, -0.1, 0.1], [5.04, -0.2, 0.08], 0.15, [0.94, 0.12, 0.25], [0.98, 0.04, 0.08]),
  backhand_drive: spec('Backhand drive', 1.35, 0.45, [-0.63, 0.02, -0.15], [4.87, -0.17, -0.07], 0.12, [0.88, 0.08, -0.38], [0.96, 0.04, -0.18]),
  smash: spec('Jump smash', 1.75, 0.52, [-0.63, -0.42, -0.06], [4.52, -2.04, 0.07], -0.15, [0.45, 0.88, 0.12], [0.98, -0.18, 0.04]),
  drop: spec('Drop shot', 1.75, 0.52, [-0.45, -0.16, -0.03], [2.52, -1.2, 0.37], 0.22, [0.5, 0.84, 0.12], [0.96, 0.16, 0.08]),
  net_shot: spec('Net shot', 1.45, 0.5, [-0.6, -0.2, -0.02], [1.95, -0.2, 0.14], 0.18, [0.9, -0.18, 0.25], [0.96, 0.2, 0.12]),
  net_kill: spec('Net kill', 1.35, 0.48, [-0.61, -0.03, -0.06], [1.82, -0.73, 0], -0.05, [0.88, 0.25, 0.2], [0.98, -0.2, 0.04]),
  lift: spec('Defensive lift', 1.65, 0.46, [-0.57, -0.16, -0.02], [5.23, 1.92, 0.41], 1.15, [0.72, -0.62, 0.2], [0.9, 0.42, 0.12]),
  defense_lunge: spec('Defensive lunge', 1.45, 0.46, [-0.58, 0.07, -0.13], [2.62, 0.2, -0.1], 0.15, [0.85, 0.08, -0.42], [0.98, 0.02, -0.18]),
  block: spec('Body block', 1.25, 0.44, [-0.73, 0.1, 0.02], [2.37, -0.07, 0.1], 0.04, [0.92, 0.08, -0.12], [0.99, 0.02, -0.06]),
}

export const ACTION_LABELS = Object.fromEntries(
  BADMINTON_ACTIONS.map((action) => [action, ACTION_SPECS[action].label]),
) as Record<BadmintonAction, string>

/** @entry 采样动作时序与手腕拍面语义，不包含任何 Three.js 或世界硬编码接触点。 */
export function sampleBadmintonMotion(action: BadmintonAction, time: number): BadmintonMotionSample {
  const spec = ACTION_SPECS[action]
  const cycle = loop01(time / spec.duration)
  const phase = action === 'ready' ? 'ready' : phaseFromCycle(cycle, spec.contact)
  return {
    action,
    contactCue: !NO_SHUTTLE.has(action) && Math.abs(cycle - spec.contact) < 0.035,
    cycle,
    faceNormal: [...spec.faceNormal],
    label: spec.label,
    phase,
    phaseLabel: phase === 'follow_through' ? 'follow-through' : phase,
    racketDirection: racketDirectionAt(spec, cycle),
  }
}

export function sampleBadmintonShuttle(
  action: BadmintonAction,
  cycle: number,
  contactCenter: Vec3,
): BadmintonShuttleSample | null {
  if (NO_SHUTTLE.has(action)) return null
  const spec = ACTION_SPECS[action]
  return {
    corkCenter: shuttleAt(spec, cycle, contactCenter),
    nextCorkCenter: shuttleAt(spec, Math.min(cycle + 0.018, 1), contactCenter),
  }
}

export function getBadmintonActionContactCycle(action: BadmintonAction): number {
  return ACTION_SPECS[action].contact
}

export function getBadmintonActionContactTime(action: BadmintonAction): number {
  const spec = ACTION_SPECS[action]
  return spec.duration * spec.contact
}

/** 动作完整时长（秒）— 播放完一整个挥拍循环所需时间。 */
export function getBadmintonActionDuration(action: BadmintonAction): number {
  return ACTION_SPECS[action].duration
}

export function canBadmintonActionContact(action: BadmintonAction): boolean {
  return !NO_SHUTTLE.has(action)
}

function spec(
  label: string,
  duration: number,
  contact: number,
  incomingOffset: Vec3,
  outgoingOffset: Vec3,
  arc: number,
  contactDirection: Vec3,
  faceNormal: Vec3,
): ActionSpec {
  return {
    arc,
    contact,
    contactDirection: normalize3(contactDirection, [0, 1, 0]),
    duration,
    faceNormal: normalize3(faceNormal, [1, 0, 0]),
    incomingOffset,
    label,
    outgoingOffset,
  }
}

function racketDirectionAt(spec: ActionSpec, cycle: number): Vec3 {
  const relative = cycle - spec.contact
  const before = Math.max(-1, Math.min(0, relative / Math.max(spec.contact, 0.001)))
  const after = Math.max(0, Math.min(1, relative / Math.max(1 - spec.contact, 0.001)))
  return normalize3([
    spec.contactDirection[0] - before * 0.18 - after * 0.08,
    spec.contactDirection[1] - before * 0.14 - after * 0.32,
    spec.contactDirection[2] + before * 0.34 - after * 0.28,
  ], spec.contactDirection)
}

function shuttleAt(spec: ActionSpec, cycle: number, contactCenter: Vec3): Vec3 {
  if (cycle < spec.contact) {
    return add3(contactCenter, lerp3(spec.incomingOffset, [0, 0, 0], smoothstep(cycle / spec.contact)))
  }
  const t = smoothstep((cycle - spec.contact) / Math.max(1 - spec.contact, 0.001))
  const point = add3(contactCenter, lerp3([0, 0, 0], spec.outgoingOffset, t))
  point[1] += Math.sin(t * Math.PI) * spec.arc
  return point
}

function phaseFromCycle(cycle: number, contact: number): BadmintonMotionPhase {
  if (cycle < 0.1) return 'ready'
  if (cycle < contact - 0.04) return 'load'
  if (cycle < contact + 0.06) return 'contact'
  if (cycle < 0.78) return 'follow_through'
  return 'recover'
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}

function loop01(value: number): number {
  return value - Math.floor(value)
}
