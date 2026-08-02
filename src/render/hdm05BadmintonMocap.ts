import * as THREE from 'three'
import type { HumanoidBones } from './skeletalBadminton'

export type Hdm05BadmintonAction = 'low_serve' | 'clear' | 'drop' | 'smash'

export interface Hdm05MotionSummary {
  action: Hdm05BadmintonAction
  actor: string
  duration: number
  frames: number
  id: string
  label: string
  path: string
  sourcePath: string
  take: string
}

export interface Hdm05Manifest {
  fps: number
  motions: Hdm05MotionSummary[]
  source: string
}

export interface Hdm05Motion {
  action: Hdm05BadmintonAction
  actor: string
  fps: number
  id: string
  label: string
  poseBody: number[][]
  root: number[][]
  rootOrient: number[][]
  sourceFps: number
  sourcePath: string
  take: string
}

export interface Hdm05PlaybackOptions {
  poseScale: number
  rootMotionScale: number
  rootRotationScale: number
}

export interface Hdm05PlaybackSample {
  alpha: number
  cycle: number
  frame: number
  frameValue: number
  loopBlend: boolean
  loopIndex: number
  nextFrame: number
  time: number
}

type BoneName = keyof HumanoidBones

interface BoneRest {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

const BODY_JOINTS: Array<[BoneName, number]> = [
  ['leftUpLeg', 0],
  ['rightUpLeg', 1],
  ['spine', 2],
  ['leftLeg', 3],
  ['rightLeg', 4],
  ['spine1', 5],
  ['leftFoot', 6],
  ['rightFoot', 7],
  ['spine2', 8],
  ['leftToe', 9],
  ['rightToe', 10],
  ['neck', 11],
  ['leftShoulder', 12],
  ['rightShoulder', 13],
  ['head', 14],
  ['leftArm', 15],
  ['rightArm', 16],
  ['leftForeArm', 17],
  ['rightForeArm', 18],
  ['leftHand', 19],
  ['rightHand', 20],
]

const REST_POSE = new WeakMap<THREE.Object3D, BoneRest>()
const AXIS = new THREE.Vector3()
const OFFSET = new THREE.Vector3()
const TEMP_QUAT = new THREE.Quaternion()
const PREVIEW_JOINTS = [16, 18, 20]
const LOOP_BLEND_SECONDS = 0.45

export function applyHdm05Motion(
  bones: HumanoidBones,
  motion: Hdm05Motion,
  time: number,
  options: Hdm05PlaybackOptions,
): Hdm05PlaybackSample {
  resetPose(bones)
  const sample = sampleHdm05Playback(motion, time)
  const { alpha, frame, nextFrame } = sample
  applyRoot(bones.hips, motion, frame, nextFrame, alpha, options)
  for (const [boneName, jointIndex] of BODY_JOINTS) {
    const bone = bones[boneName]
    if (!bone) continue
    const offset = axisAt(motion.poseBody, frame, nextFrame, alpha, jointIndex)
    setRotationVector(bone, offset, options.poseScale)
  }
  return sample
}

export function createDefaultPlaybackOptions(): Hdm05PlaybackOptions {
  return {
    poseScale: 0.68,
    rootMotionScale: 0.5,
    rootRotationScale: 0,
  }
}

export function findHdm05PreviewStartFrame(motion: Hdm05Motion): number {
  return Math.max(0, findHdm05StrikeFrame(motion) - Math.round(motion.fps * 1.2))
}

export function findHdm05StrikeFrame(motion: Hdm05Motion): number {
  let bestFrame = 1
  let bestScore = -Infinity
  for (let frame = 1; frame < motion.poseBody.length; frame++) {
    const score = motionEnergyAt(motion, frame)
    if (score > bestScore) {
      bestFrame = frame
      bestScore = score
    }
  }
  return bestFrame
}

/** @entry 原片段末尾通过平滑 blend 回首帧，禁止末帧直接插值制造虚假拍头高速。 */
export function sampleHdm05Playback(motion: Hdm05Motion, time: number): Hdm05PlaybackSample {
  const lastFrame = Math.max(0, motion.poseBody.length - 1)
  const activeDuration = lastFrame / motion.fps
  const blendDuration = Math.min(LOOP_BLEND_SECONDS, Math.max(activeDuration * 0.2, 0.12))
  const cycleDuration = Math.max(activeDuration + blendDuration, 1 / motion.fps)
  const loopIndex = Math.floor(Math.max(time, 0) / cycleDuration)
  const localTime = positiveModulo(time, cycleDuration)

  if (localTime <= activeDuration || lastFrame === 0) {
    const frameValue = Math.min(localTime * motion.fps, lastFrame)
    const frame = Math.min(Math.floor(frameValue), lastFrame)
    const nextFrame = Math.min(frame + 1, lastFrame)
    return {
      alpha: nextFrame === frame ? 0 : frameValue - frame,
      cycle: localTime / cycleDuration,
      frame,
      frameValue,
      loopBlend: false,
      loopIndex,
      nextFrame,
      time: localTime,
    }
  }

  const blend01 = smoothstep((localTime - activeDuration) / blendDuration)
  return {
    alpha: blend01,
    cycle: localTime / cycleDuration,
    frame: lastFrame,
    frameValue: lastFrame,
    loopBlend: true,
    loopIndex,
    nextFrame: 0,
    time: localTime,
  }
}

function motionEnergyAt(motion: Hdm05Motion, frame: number): number {
  let score = 0
  for (const joint of PREVIEW_JOINTS) {
    const start = joint * 3
    score += Math.abs(motion.poseBody[frame][start] - motion.poseBody[frame - 1][start])
    score += Math.abs(motion.poseBody[frame][start + 1] - motion.poseBody[frame - 1][start + 1])
    score += Math.abs(motion.poseBody[frame][start + 2] - motion.poseBody[frame - 1][start + 2])
  }
  return score
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}

function resetPose(bones: HumanoidBones): void {
  for (const bone of Object.values(bones)) {
    if (!bone) continue
    const rest = getRest(bone)
    bone.position.copy(rest.position)
    bone.quaternion.copy(rest.quaternion)
    bone.scale.copy(rest.scale)
  }
}

function applyRoot(
  hips: THREE.Object3D | undefined,
  motion: Hdm05Motion,
  frame: number,
  nextFrame: number,
  alpha: number,
  options: Hdm05PlaybackOptions,
): void {
  if (!hips) return
  const rest = getRest(hips)
  const root = lerpRow(motion.root, frame, nextFrame, alpha)
  const worldOffset = smplVectorToThree(root, options.rootMotionScale)
  hips.position.copy(rest.position).add(worldOffset)
  const rootOrient = axisAt(motion.rootOrient, frame, nextFrame, alpha, 0)
  setRotationVector(hips, rootOrient, options.rootRotationScale)
}

function setRotationVector(bone: THREE.Object3D, sourceVector: number[], scale: number): void {
  const rest = getRest(bone)
  const vector = smplVectorToThree(sourceVector, 1)
  const length = vector.length()
  if (length < 0.00001 || scale === 0) {
    bone.quaternion.copy(rest.quaternion)
    return
  }
  AXIS.copy(vector).multiplyScalar(1 / length)
  TEMP_QUAT.setFromAxisAngle(AXIS, length * scale)
  bone.quaternion.copy(rest.quaternion).multiply(TEMP_QUAT)
}

function axisAt(rows: number[][], frame: number, nextFrame: number, alpha: number, joint: number): number[] {
  const start = joint * 3
  return [
    THREE.MathUtils.lerp(rows[frame][start], rows[nextFrame][start], alpha),
    THREE.MathUtils.lerp(rows[frame][start + 1], rows[nextFrame][start + 1], alpha),
    THREE.MathUtils.lerp(rows[frame][start + 2], rows[nextFrame][start + 2], alpha),
  ]
}

function lerpRow(rows: number[][], frame: number, nextFrame: number, alpha: number): number[] {
  return [
    THREE.MathUtils.lerp(rows[frame][0], rows[nextFrame][0], alpha),
    THREE.MathUtils.lerp(rows[frame][1], rows[nextFrame][1], alpha),
    THREE.MathUtils.lerp(rows[frame][2], rows[nextFrame][2], alpha),
  ]
}

function smplVectorToThree(value: number[], scale: number): THREE.Vector3 {
  return OFFSET.set(value[0] * scale, value[2] * scale, -value[1] * scale)
}

function getRest(bone: THREE.Object3D): BoneRest {
  let rest = REST_POSE.get(bone)
  if (!rest) {
    rest = {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }
    REST_POSE.set(bone, rest)
  }
  return rest
}
