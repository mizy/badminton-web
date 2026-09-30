/** World-space foot plants and continuous swing trajectories, independent of a skin. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import { ANKLE_HEIGHT, poseLimb, type PlayerSkeleton, type Limb } from './playerSkeleton'

interface Foot {
  position: THREE.Vector3
  from: THREE.Vector3
  to: THREE.Vector3
  elapsed: number
  duration: number
}

export interface FootworkMotion {
  feet: [Foot, Foot]
  next: 0 | 1
  initialized: boolean
  origin: THREE.Vector3
}

export function createFootwork(): FootworkMotion {
  const foot = (): Foot => ({ position: new THREE.Vector3(), from: new THREE.Vector3(),
    to: new THREE.Vector3(), elapsed: 0, duration: 0 })
  return { feet: [foot(), foot()], next: 0, initialized: false, origin: new THREE.Vector3() }
}

function landingOffset(player: PlayerState, direction: THREE.Vector3, sign: number): THREE.Vector3 {
  const depth = player.movement.footworkPoint?.split('-')[0]
  const lateral = player.movement.footworkPoint?.endsWith('right') ? 1 : -1
  const offset = new THREE.Vector3(-sign * 0.15, 0, sign === 1 ? -0.08 : 0.08)
  if (player.movement.footwork === 'ready') return offset
  if (player.movement.footwork === 'start') return offset.add(new THREE.Vector3(-sign * 0.08, 0, sign * 0.04))
  if (depth === 'front' || player.movement.footwork === 'lunge') {
    return offset.addScaledVector(direction, sign === 1 ? 0.26 : -0.14)
  }
  if (depth === 'back' && player.movement.footwork === 'cross') {
    offset.x += sign === -lateral ? -lateral * 0.22 : lateral * 0.02
    offset.z -= 0.10
  } else if (depth === 'mid' || player.movement.footwork === 'chasse') {
    const side = direction.x < 0 ? 1 : -1
    offset.x -= side * (sign === side ? 0.10 : 0.025)
  }
  return offset
}

function groundTarget(rig: PlayerSkeleton, player: PlayerState, sign: number, speed: number): THREE.Vector3 {
  const rotation = rig.hips.getWorldQuaternion(new THREE.Quaternion())
  const direction = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z)
    .applyQuaternion(rotation.clone().invert())
  if (direction.lengthSq() < 0.01) direction.set(0, 0, 1)
  direction.normalize()
  const target = landingOffset(player, direction, sign).applyQuaternion(rotation)
    .add(rig.hips.getWorldPosition(new THREE.Vector3()))
  if (speed > 0.1) {
    const lead = Math.min(0.07, 0.26 / speed)
    target.x += player.movement.currentVel.x * lead
    target.z += player.movement.currentVel.z * lead
  }
  target.y = ANKLE_HEIGHT
  return target
}

function reachable(chain: Limb, target: THREE.Vector3): void {
  const hip = chain.root.getWorldPosition(new THREE.Vector3())
  const length = chain.lengths[0] + chain.lengths[1] - 0.015
  const horizontal = new THREE.Vector2(target.x - hip.x, target.z - hip.z)
  const reach = Math.sqrt(Math.max(0, length * length - (hip.y - target.y) ** 2))
  if (horizontal.length() > reach) horizontal.setLength(reach)
  target.x = hip.x + horizontal.x
  target.z = hip.z + horizontal.y
}

/** @entry A planted foot stays in world space; each new step starts at its visible position. */
export function updateFootwork(rig: PlayerSkeleton, motion: FootworkMotion, player: PlayerState, dt: number): void {
  const speed = Math.hypot(player.movement.currentVel.x, player.movement.currentVel.z)
  const origin = new THREE.Vector3(...player.pos)
  const reset = !motion.initialized || dt > 0.1 || origin.distanceTo(motion.origin) > 0.7
  motion.origin.copy(origin)
  const targets = [groundTarget(rig, player, 1, speed), groundTarget(rig, player, -1, speed)]
  if (player.body.phase === 'airborne') {
    airborneFeet(rig, motion, player)
    motion.initialized = false
    return
  }
  if (reset) {
    motion.feet.forEach((foot, i) => { foot.position.copy(targets[i]); foot.duration = 0 })
    motion.initialized = true
  }
  advanceFeet(motion, targets, speed, Math.min(dt, 0.05))
  for (const [i, chain] of [rig.rightLeg, rig.leftLeg].entries()) {
    reachable(chain, motion.feet[i].position)
    poseLimb(chain, rig.hips.worldToLocal(motion.feet[i].position.clone()), new THREE.Vector3(0, 0, 1))
  }
}

function advanceFeet(motion: FootworkMotion, targets: THREE.Vector3[], speed: number, dt: number): void {
  const active = motion.feet.find(foot => foot.duration > 0)
  if (active) {
    active.elapsed = Math.min(active.elapsed + dt, active.duration)
    const t = active.elapsed / active.duration
    // Minimum-jerk interpolation has zero velocity and acceleration at both plants.
    const eased = t * t * t * (10 + t * (-15 + t * 6))
    active.position.copy(active.from).lerp(active.to, eased)
    active.position.y += Math.sin(Math.PI * t) ** 2 * (0.045 + Math.min(speed / 6, 1) * 0.065)
    if (t === 1) active.duration = 0
    return
  }
  const threshold = speed > 0.1 ? 0.07 : 0.04
  let index = motion.next
  if (motion.feet[index].position.distanceTo(targets[index]) < threshold) index = index === 0 ? 1 : 0
  const foot = motion.feet[index]
  const distance = foot.position.distanceTo(targets[index])
  if (distance < threshold || dt === 0) return
  foot.from.copy(foot.position)
  foot.to.copy(targets[index])
  foot.elapsed = 0
  foot.duration = THREE.MathUtils.clamp(0.23 - speed * 0.018, 0.12, 0.23)
  motion.next = index === 0 ? 1 : 0
}

function airborneFeet(rig: PlayerSkeleton, motion: FootworkMotion, player: PlayerState): void {
  const tuck = Math.sin(Math.PI * THREE.MathUtils.clamp(player.body.elapsed / 0.65, 0, 1))
  for (const [i, chain] of [rig.rightLeg, rig.leftLeg].entries()) {
    const sign = i === 0 ? 1 : -1
    const z = player.body.action === 'scissor'
      ? Math.cos(Math.PI * Math.min(player.body.elapsed / 0.43, 1)) * 0.27 * sign : sign * 0.09
    const ankle = rig.hips.localToWorld(new THREE.Vector3(-sign * 0.14, 0, z))
    ankle.y = player.pos[1] + ANKLE_HEIGHT + 0.05 + 0.16 * tuck
    motion.feet[i].position.copy(ankle)
    poseLimb(chain, rig.hips.worldToLocal(ankle), new THREE.Vector3(0, 0, 1))
  }
}
