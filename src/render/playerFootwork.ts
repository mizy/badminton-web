/** World-space foot plants and continuous swing trajectories, independent of a skin. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import { ANKLE_HEIGHT, poseLimb, type PlayerSkeleton, type Limb } from './playerSkeleton'

interface Foot {
  position: THREE.Vector3
  from: THREE.Vector3
  to: THREE.Vector3
  offset: THREE.Vector3
  elapsed: number
  duration: number
  lift: number
  rotation: THREE.Quaternion
  landingRotation: THREE.Quaternion
}

export interface FootworkMotion {
  feet: [Foot, Foot]
  next: 0 | 1
  initialized: boolean
  origin: THREE.Vector3
  moving: boolean
}

export function createFootwork(): FootworkMotion {
  const foot = (): Foot => ({ position: new THREE.Vector3(), from: new THREE.Vector3(),
    to: new THREE.Vector3(), offset: new THREE.Vector3(), elapsed: 0, duration: 0, lift: 0,
    rotation: new THREE.Quaternion(), landingRotation: new THREE.Quaternion() })
  return { feet: [foot(), foot()], next: 0, initialized: false, origin: new THREE.Vector3(), moving: false }
}

function landingOffset(player: PlayerState, direction: THREE.Vector3, sign: number, speed: number): THREE.Vector3 {
  const depth = player.movement.footworkPoint?.split('-')[0]
  const lateral = direction.x < 0 ? 1 : -1
  const offset = new THREE.Vector3(-sign * 0.15, 0, sign === 1 ? -0.08 : 0.08)
  if (player.movement.footwork === 'ready') return offset
  if (player.movement.footwork === 'start') return offset.add(new THREE.Vector3(-sign * 0.08, 0, sign * 0.04))
  if (player.movement.footwork === 'recover') return offset
  if (player.movement.footwork === 'lunge' && speed < 2.8) {
    return offset.addScaledVector(direction, sign === 1 ? 0.48 : -0.72)
  }
  if (depth === 'back' && Math.abs(direction.x) > 0.3) {
    offset.x += sign === -lateral ? -lateral * 0.42 : lateral * 0.02
    offset.z -= sign === -lateral ? 0.22 : 0.04
  } else if (depth === 'mid' || player.movement.footwork === 'chasse') {
    const side = direction.x < 0 ? 1 : -1
    offset.x -= side * (sign === side ? 0.20 : 0.025)
  }
  return offset
}

function groundTarget(rig: PlayerSkeleton, player: PlayerState, sign: number, speed: number, lead = 0): THREE.Vector3 {
  // Feet follow the hip stance; the chest can wind up independently above them.
  const rotation = rig.hips.getWorldQuaternion(new THREE.Quaternion())
  const direction = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z)
  if (direction.lengthSq() < 0.01) direction.set(player.movement.targetDir.x, 0, player.movement.targetDir.z)
  direction.applyQuaternion(rotation.clone().invert())
  if (direction.lengthSq() < 0.01) direction.set(0, 0, 1)
  direction.normalize()
  const target = landingOffset(player, direction, sign, speed).applyQuaternion(rotation)
    .add(rig.hips.getWorldPosition(new THREE.Vector3()))
  if (speed > 0.1) {
    target.x += player.movement.currentVel.x * lead
    target.z += player.movement.currentVel.z * lead
  }
  target.y = ANKLE_HEIGHT
  return target
}

function reachable(chain: Limb, target: THREE.Vector3, travel = new THREE.Vector3()): void {
  const hip = chain.root.getWorldPosition(new THREE.Vector3())
  hip.add(travel)
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
  const rotation = rig.hips.getWorldQuaternion(new THREE.Quaternion())
  const direction = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z)
  if (direction.lengthSq() < 0.01) direction.set(player.movement.targetDir.x, 0, player.movement.targetDir.z)
  if (player.movement.footwork === 'lunge' && direction.lengthSq() > 0.01) {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z))
  }
  if (player.body.phase === 'airborne') {
    airborneFeet(rig, motion, player)
    motion.initialized = false
    return
  }
  // Step towards reachable plants, so a deep lunge does not repeatedly chase
  // an unreachable rear-foot target after reaching its visible limit.
  targets.forEach((target, i) => reachable(i === 0 ? rig.rightLeg : rig.leftLeg, target))
  if (reset) {
    motion.feet.forEach((foot, i) => {
      foot.position.copy(targets[i]); foot.duration = 0; foot.rotation.copy(rotation)
    })
    motion.initialized = true
    motion.moving = false
  }
  if (speed > 0.1 && !motion.moving) {
    motion.next = targets[0].clone().sub(targets[1]).dot(direction) >= 0 ? 0 : 1
    if (!reset && dt > 0 && player.movement.footwork === 'start') {
      // A small split-step widens the base before the directional push-off.
      motion.feet.forEach((foot, i) => {
        foot.from.copy(foot.position)
        foot.to.copy(targets[i])
        foot.offset.copy(foot.to).sub(rig.hips.getWorldPosition(new THREE.Vector3()))
        foot.offset.y = 0
        foot.elapsed = 0
        foot.duration = 0.10
        foot.lift = 0.045
        foot.landingRotation.copy(rotation)
      })
    }
  }
  motion.moving = speed > 0.1
  advanceFeet(rig, motion, player, targets, rotation, speed, Math.min(dt, 0.05))
  // Let the pelvis yield slightly over a planted support instead of dragging
  // that foot to keep a fixed hip height. The racket shoulder stays independent.
  const drop = Math.max(0, ...[rig.rightLeg, rig.leftLeg].map((chain, i) => {
    const hip = chain.root.getWorldPosition(new THREE.Vector3())
    const foot = motion.feet[i].position
    const length = chain.lengths[0] + chain.lengths[1] - 0.015
    const horizontal = (hip.x - foot.x) ** 2 + (hip.z - foot.z) ** 2
    return hip.y - foot.y - Math.sqrt(Math.max(0, length * length - horizontal))
  }))
  rig.hips.position.y -= Math.min(drop, 0.13)
  rig.hips.updateWorldMatrix(true, true)
  const knee = player.movement.footwork === 'lunge'
    ? new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z)
      .applyQuaternion(rig.hips.getWorldQuaternion(new THREE.Quaternion()).invert())
    : new THREE.Vector3(0, 0, 1)
  if (knee.lengthSq() < 0.01 && player.movement.footwork === 'lunge') {
    knee.set(player.movement.targetDir.x, 0, player.movement.targetDir.z)
      .applyQuaternion(rig.hips.getWorldQuaternion(new THREE.Quaternion()).invert())
  }
  if (knee.lengthSq() < 0.01) knee.set(0, 0, 1)
  for (const [i, chain] of [rig.rightLeg, rig.leftLeg].entries()) {
    // IK may constrain the visible pose, but must never drag the stored plant.
    const foot = motion.feet[i]
    const target = foot.position.clone()
    reachable(chain, target)
    poseLimb(chain, rig.hips.worldToLocal(target), knee)
    chain.end.quaternion.copy(chain.end.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(foot.rotation)
  }
}

function advanceFeet(rig: PlayerSkeleton, motion: FootworkMotion, player: PlayerState, targets: THREE.Vector3[], rotation: THREE.Quaternion, speed: number, dt: number): void {
  for (const [index, foot] of motion.feet.entries()) {
    if (!foot.duration) continue
    foot.elapsed = Math.min(foot.elapsed + dt, foot.duration)
    // Simulation ticks can leave microseconds at touchdown. Finish that plant
    // now so a visually grounded foot cannot chase its target for another frame.
    if (foot.duration - foot.elapsed < 0.0001) foot.elapsed = foot.duration
    const remaining = foot.duration - foot.elapsed
    // Braking or changing direction retargets the upcoming touchdown, without
    // moving an already planted foot or restarting the visible swing.
    const landing = rig.hips.getWorldPosition(new THREE.Vector3()).add(foot.offset)
    landing.x += player.movement.currentVel.x * remaining
    landing.z += player.movement.currentVel.z * remaining
    landing.y = ANKLE_HEIGHT
    const travel = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z).multiplyScalar(remaining)
    reachable(index === 0 ? rig.rightLeg : rig.leftLeg, landing, travel)
    foot.to.lerp(landing, 1 - Math.exp(-dt * 18))
    const t = foot.elapsed / foot.duration
    // Zero velocity at both plants, without a sharp mid-step speed peak.
    const eased = t * t * (3 - 2 * t)
    foot.position.copy(foot.from).lerp(foot.to, eased)
    // Lift early, pass the support foot with a bent knee, then settle the heel.
    foot.position.y += Math.sin(Math.PI * t) ** 2 * foot.lift
    if (dt > 0) foot.rotation.slerp(foot.landingRotation, eased)
    if (t === 1) foot.duration = 0
  }
  if (dt === 0) return
  const threshold = speed > 0.1 ? 0.16 : 0.04
  let index = motion.next
  if (motion.feet[index].duration || motion.feet[index].position.distanceTo(targets[index]) < threshold) index = index === 0 ? 1 : 0
  const foot = motion.feet[index]
  if (foot.duration) return
  const distance = foot.position.distanceTo(targets[index])
  if (distance < threshold) return
  const other = motion.feet[index === 0 ? 1 : 0]
  // Slow steps retain a planted support. Faster chasse/cross steps can overlap
  // near touchdown, so the support does not slide while chasing a moving hip.
  const chain = index === 0 ? rig.rightLeg : rig.leftLeg
  const supportHip = chain.root.getWorldPosition(new THREE.Vector3())
  supportHip.x += player.movement.currentVel.x * 0.04
  supportHip.z += player.movement.currentVel.z * 0.04
  supportHip.y -= 0.13
  const reach = chain.lengths[0] + chain.lengths[1] - 0.015
  const urgent = supportHip.distanceTo(foot.position) > reach
  if (other.duration && (speed < 3.5 || (!urgent && other.elapsed / other.duration < 0.65))) return
  // A long catch-up step after a turn needs time proportional to its length.
  // Include the hip's travel during that time, so increasing duration does not
  // silently increase the peak foot speed again through touchdown prediction.
  const swingSpeed = Math.max(9, speed * 2.5)
  foot.duration = Math.max(THREE.MathUtils.clamp(0.23 - speed * 0.02, 0.11, 0.23),
    1.5 * distance / (swingSpeed - 1.5 * speed))
  foot.from.copy(foot.position)
  foot.to.copy(groundTarget(rig, player, index === 0 ? 1 : -1, speed, foot.duration))
  const travel = new THREE.Vector3(player.movement.currentVel.x, 0, player.movement.currentVel.z).multiplyScalar(foot.duration)
  reachable(index === 0 ? rig.rightLeg : rig.leftLeg, foot.to, travel)
  foot.offset.copy(foot.to).sub(rig.hips.getWorldPosition(new THREE.Vector3())).sub(travel)
  foot.offset.y = 0
  foot.lift = player.movement.footwork === 'cross' ? 0.20 : player.movement.footwork === 'chasse' ? 0.13 : 0.16
  foot.landingRotation.copy(rotation)
  foot.elapsed = 0
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
