import * as THREE from 'three'
import { solveTargetedShot } from '../character/shotTargeting'
import { placeShuttleForCorkCenter, type Vec3 } from '../character/racketKinematics'
import type { ShuttlecockState } from '../physics/shuttlecock'
import type {
  Hdm05BadmintonAction,
  Hdm05Motion,
  Hdm05PlaybackOptions,
} from './hdm05BadmintonMocap'
import { applyHdm05Motion } from './hdm05BadmintonMocap'
import { syncShuttlecockMesh } from './shuttlecockMesh'
import { getRacketStringCenterWorld, syncRacketToGrip, RACKET_IN_RIGHT_HAND } from './skeletalRacket'
import type { HumanoidBones } from './skeletalBadminton'

const RACKET_GRIP = new THREE.Vector3()
const RACKET_DIRECTION = new THREE.Vector3()
const RACKET_FACE = new THREE.Vector3()
const HAND_ROTATION = new THREE.Quaternion()
const INCOMING_CENTER = new THREE.Vector3()
const INCOMING_VELOCITY = new THREE.Vector3()
const STRIKE_HEAD = new THREE.Vector3()
const PREVIOUS_STRIKE_HEAD = new THREE.Vector3()
const HAND_POS = new THREE.Vector3()

/** @entry Racket axes follow the calibrated right hand throughout the captured stroke. */
export function syncHdm05Racket(bones: HumanoidBones, racket: THREE.Group): void {
  const hand = bones.rightHand
  if (!hand) return
  RACKET_GRIP.copy(hand.getWorldPosition(HAND_POS))
  HAND_ROTATION.copy(hand.getWorldQuaternion(HAND_ROTATION)).multiply(RACKET_IN_RIGHT_HAND)
  RACKET_DIRECTION.set(0, 1, 0).applyQuaternion(HAND_ROTATION)
  RACKET_FACE.set(0, 0, 1).applyQuaternion(HAND_ROTATION)
  syncRacketToGrip(racket, RACKET_GRIP, RACKET_DIRECTION, RACKET_FACE)
}

/** 从实际投影后的拍头速度与击球高度选事件帧，避免把原始轴角尖峰当成击球。 */
export function findHdm05VisualStrikeFrame(
  bones: HumanoidBones,
  racket: THREE.Group,
  motion: Hdm05Motion,
  options: Hdm05PlaybackOptions,
): number {
  let bestFrame = 1
  let bestScore = -Infinity
  const overhead = motion.action !== 'low_serve'

  for (let frame = 0; frame < motion.poseBody.length; frame += 1) {
    applyHdm05Motion(bones, motion, frame / motion.fps, options)
    syncHdm05Racket(bones, racket)
    getRacketStringCenterWorld(racket, STRIKE_HEAD)
    if (frame > 0) {
      const speed = Math.min(STRIKE_HEAD.distanceTo(PREVIOUS_STRIKE_HEAD) * motion.fps, 20)
      const heightFit = overhead
        ? clamp((STRIKE_HEAD.y - 1.58) / 0.62, 0, 1)
        : clamp(1 - Math.abs(STRIKE_HEAD.y - 0.86) / 0.58, 0, 1)
      const score = speed * heightFit
      if (score > bestScore) {
        bestFrame = frame
        bestScore = score
      }
    }
    PREVIOUS_STRIKE_HEAD.copy(STRIKE_HEAD)
  }
  return bestFrame
}

export function createIncomingHdm05Shuttle(
  start: THREE.Vector3,
  target: THREE.Vector3,
  progress: number,
): ShuttlecockState {
  const t = smoothstep(progress)
  INCOMING_CENTER.lerpVectors(start, target, t)
  INCOMING_VELOCITY.subVectors(target, start).multiplyScalar(1 / 0.52)
  const velocity = INCOMING_VELOCITY.toArray() as Vec3
  return {
    pos: placeShuttleForCorkCenter(INCOMING_CENTER.toArray() as Vec3, velocity),
    spin: [0, 24, 0],
    vel: velocity,
  }
}

export function solveHdm05Shot(action: Hdm05BadmintonAction, corkCenter: Vec3) {
  const profile = action === 'smash'
    ? { elevationDeg: -7, maxSpeed: 40, targetX: 4.6 }
    : action === 'drop'
      ? { elevationDeg: 27, maxSpeed: 14, targetX: 1.1 }
      : action === 'low_serve'
        ? { elevationDeg: 30, maxSpeed: 12, targetX: 3.8 }
        : { elevationDeg: 42, maxSpeed: 28, targetX: 5.8 }
  return solveTargetedShot({
    corkCenter,
    elevationDeg: profile.elevationDeg,
    maxSpeed: profile.maxSpeed,
    spin: [0, 36, -3],
    target: [profile.targetX, 0, Math.max(-2.4, Math.min(2.4, corkCenter[2] * 0.25))],
  })
}

export function syncHdm05Shuttle(shuttle: THREE.Group, state: ShuttlecockState | null): void {
  shuttle.visible = state !== null
  if (!state) return
  syncShuttlecockMesh(shuttle, state.pos, state.vel)
  shuttle.scale.setScalar(1)
}

export function syncHdm05ContactMarker(
  marker: THREE.Group,
  position: THREE.Vector3,
  impactAge: number,
): void {
  const pulse = Math.max(0, 1 - impactAge / 0.14)
  marker.visible = pulse > 0
  marker.position.copy(position)
  marker.scale.setScalar(0.8 + pulse * 2.4)
  const mesh = marker.children[0] as THREE.Mesh
  const material = mesh.material as THREE.MeshBasicMaterial
  material.opacity = 0.18 + pulse * 0.72
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
