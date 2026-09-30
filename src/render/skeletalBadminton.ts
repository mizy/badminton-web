import * as THREE from 'three'
import {
  ACTION_LABELS,
  BADMINTON_ACTIONS,
  sampleBadmintonMotion,
  type BadmintonAction,
  type BadmintonMotionSample,
} from '../character/badmintonKinematics'
import type { Vec3 } from '../character/racketKinematics'

export {
  ACTION_LABELS,
  BADMINTON_ACTIONS,
  sampleBadmintonMotion,
}
export type { BadmintonAction, BadmintonMotionSample }

import type { HumanoidBones, BoneName } from './humanoidModel'
export { findHumanoidBones, normalizeHumanoidModel } from './humanoidModel'
export type { HumanoidBones } from './humanoidModel'

interface PoseFrame {
  at: number
  positions?: Partial<Record<BoneName, Vec3>>
  rotations?: Partial<Record<BoneName, Vec3>>
}

interface BoneRest {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

const REST_POSE = new WeakMap<THREE.Object3D, BoneRest>()
const ZERO: Vec3 = [0, 0, 0]

export {
  createSkeletalRacket,
  getRacketFaceNormalWorld,
  getRacketGripWorld,
  getRacketStringCenterWorld,
  syncRacketToGrip,
  syncRacketToHand,
} from './skeletalRacket'

const BASE_READY_ROTATIONS: Partial<Record<BoneName, Vec3>> = {
  spine: [0.08, 0, 0],
  spine1: [0.06, 0, 0],
  spine2: [0.04, 0, 0],
  neck: [-0.02, 0, 0],
  head: [-0.03, 0, 0],
  rightShoulder: [0, -0.05, 0.12],
  rightArm: [-0.26, -0.1, 0.18],
  rightForeArm: [-0.26, 0.04, 0.48],
  leftShoulder: [0, 0.05, -0.12],
  leftArm: [-0.16, 0.1, -0.28],
  leftForeArm: [-0.08, -0.04, -0.24],
  rightUpLeg: [-0.24, 0.04, 0.05],
  leftUpLeg: [-0.22, -0.04, -0.05],
  rightLeg: [0.34, 0, 0],
  leftLeg: [0.32, 0, 0],
  rightFoot: [-0.12, 0, 0],
  leftFoot: [-0.11, 0, 0],
}

const ACTION_FRAMES: Record<BadmintonAction, PoseFrame[]> = {
  ready: frames(
    f(0, BASE_READY_ROTATIONS, { hips: [0, 0.01, 0] }),
    f(0.5, { ...BASE_READY_ROTATIONS, rightForeArm: [-0.18, 0.08, -0.82] }, { hips: [0, -0.018, 0] }),
    f(1, BASE_READY_ROTATIONS, { hips: [0, 0.01, 0] }),
  ),
  split_step: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.18, { ...BASE_READY_ROTATIONS, rightLeg: [0.14, 0, 0], leftLeg: [0.14, 0, 0] }, { hips: [0, 0.1, 0] }),
    f(0.42, readyWithLegs(0.86, { rightArm: [-0.22, -0.14, 0.28], leftArm: [-0.2, 0.14, -0.3] }), { hips: [0, -0.1, 0] }),
    f(0.74, readyWithLegs(0.55), { hips: [0, -0.04, 0] }),
    f(1, BASE_READY_ROTATIONS),
  ),
  serve: frames(
    f(0, readyWithLegs(0.44, { leftArm: [0.48, 0.32, 0.5], rightArm: [0.74, -0.28, -0.22], rightForeArm: [0.62, 0.04, -0.16] })),
    f(0.28, readyWithLegs(0.52, { spine2: [0.1, 0.12, 0.04], leftArm: [0.56, 0.36, 0.54], rightArm: [0.92, -0.32, -0.34], rightForeArm: [0.72, 0.06, -0.24] })),
    f(0.48, readyWithLegs(0.48, { rightArm: [0.22, -0.24, 0.38], rightForeArm: [-0.12, 0.03, 0.34], leftArm: [0.44, 0.32, 0.42] })),
    f(0.72, readyWithLegs(0.44, { rightArm: [-0.1, -0.18, 0.62], rightForeArm: [-0.08, 0.06, 0.2] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  forehand_clear: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.24, overheadLoad(-0.5, 0.18)),
    f(0.5, overheadContact(-0.08, 0.22)),
    f(0.7, overheadFollow(0.42)),
    f(1, BASE_READY_ROTATIONS),
  ),
  backhand_clear: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.26, readyWithLegs(0.54, { hips: [0.08, 0.35, 0.08], spine2: [-0.08, 0.54, 0.1], rightArm: [-0.88, 0.56, 0.92], rightForeArm: [-0.62, -0.36, 0.58], leftArm: [0.28, -0.16, -0.5] })),
    f(0.53, readyWithLegs(0.48, { spine2: [-0.16, -0.1, 0.04], rightArm: [-1.56, 0.08, -0.24], rightForeArm: [-0.3, -0.28, -0.48], leftArm: [0.3, -0.1, -0.36] })),
    f(0.72, readyWithLegs(0.55, { spine2: [0.06, -0.22, -0.05], rightArm: [-0.36, -0.22, -0.74], rightForeArm: [-0.12, 0.06, -0.66] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  forehand_drive: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.22, readyWithLegs(0.5, { spine2: [0, -0.32, -0.04], rightArm: [-0.18, -0.2, -1.0], rightForeArm: [-0.28, 0.12, -0.82], leftArm: [-0.16, 0.2, 0.72] })),
    f(0.45, readyWithLegs(0.48, { spine2: [0.02, 0.08, -0.04], rightArm: [-0.04, -0.06, 0.22], rightForeArm: [-0.24, 0.1, 0.22], leftArm: [-0.18, 0.08, 0.38] })),
    f(0.68, readyWithLegs(0.5, { spine2: [0, 0.24, 0.03], rightArm: [-0.08, 0.2, 0.64], rightForeArm: [-0.12, 0.04, 0.28] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  backhand_drive: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.22, readyWithLegs(0.5, { spine2: [0.02, 0.42, 0.04], rightArm: [-0.12, 0.72, 1.16], rightForeArm: [-0.48, -0.34, 0.62], leftArm: [0.3, -0.12, -0.36] })),
    f(0.45, readyWithLegs(0.48, { spine2: [0, -0.08, 0.02], rightArm: [-0.1, 0.12, -0.18], rightForeArm: [-0.28, -0.16, -0.42] })),
    f(0.68, readyWithLegs(0.5, { spine2: [0, -0.24, -0.02], rightArm: [-0.2, -0.18, -0.64], rightForeArm: [-0.12, 0.02, -0.4] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  smash: frames(
    f(0, readyWithLegs(0.62), { hips: [0, -0.05, 0] }),
    f(0.24, readyWithLegs(0.82, { spine2: [-0.16, -0.42, -0.12], rightArm: [-1.72, -0.34, -0.92], rightForeArm: [-0.72, 0.12, -0.38], leftArm: [0.62, 0.2, 0.95] }), { hips: [0, -0.12, 0] }),
    f(0.52, readyWithLegs(0.35, { spine2: [-0.28, -0.06, -0.14], rightArm: [-0.32, -0.12, 0.86], rightForeArm: [0.22, 0.08, 0.54], leftArm: [0.22, 0.1, 0.42] }), { hips: [0, 0.22, -0.06] }),
    f(0.72, readyWithLegs(0.9, { spine2: [0.2, 0.28, 0.12], rightArm: [0.3, 0.22, 1.12], rightForeArm: [0.18, 0.06, 0.42] }), { hips: [0, -0.12, 0.08] }),
    f(1, BASE_READY_ROTATIONS),
  ),
  drop: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.26, overheadLoad(-0.24, 0.1)),
    f(0.52, readyWithLegs(0.46, { spine2: [-0.06, -0.06, -0.05], rightArm: [-0.78, -0.12, 0.08], rightForeArm: [-0.26, 0.04, -0.16], leftArm: [0.28, 0.12, 0.58] })),
    f(0.7, readyWithLegs(0.5, { spine2: [0.08, 0.14, 0.02], rightArm: [-0.42, 0.08, 0.44], rightForeArm: [-0.18, 0.02, 0.02] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  net_shot: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.28, frontLunge(0.58, { rightArm: [-0.28, -0.14, -0.42], rightForeArm: [-0.2, 0, -0.18] }), { hips: [0.08, -0.04, 0.04] }),
    f(0.5, frontLunge(0.74, { spine2: [0.18, -0.08, -0.04], rightArm: [-0.14, -0.08, 0.24], rightForeArm: [-0.18, 0.02, 0.04], leftArm: [-0.1, 0.2, 0.4] }), { hips: [0.16, -0.07, 0.08] }),
    f(0.72, frontLunge(0.58, { rightArm: [-0.22, 0.02, 0.34], rightForeArm: [-0.16, 0, 0.08] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  net_kill: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.26, frontLunge(0.62, { rightArm: [-0.44, -0.12, -0.46], rightForeArm: [-0.28, 0, -0.22] }), { hips: [0.08, -0.05, 0.02] }),
    f(0.48, frontLunge(0.82, { spine2: [0.2, -0.12, -0.08], rightArm: [-0.08, -0.1, 0.72], rightForeArm: [0.02, 0, 0.34], leftArm: [-0.04, 0.18, 0.32] }), { hips: [0.18, -0.09, 0.08] }),
    f(0.7, frontLunge(0.66, { rightArm: [0.1, 0.04, 0.88], rightForeArm: [0.02, 0, 0.26] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  lift: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.24, frontLunge(0.7, { spine2: [0.28, -0.1, 0.04], rightArm: [0.54, -0.2, -0.34], rightForeArm: [0.46, 0.06, -0.22] }), { hips: [0.12, -0.08, 0.08] }),
    f(0.46, frontLunge(0.8, { spine2: [0.1, 0.02, 0.02], rightArm: [-0.42, -0.1, 0.54], rightForeArm: [-0.26, 0.04, 0.34] }), { hips: [0.18, -0.06, 0.08] }),
    f(0.72, frontLunge(0.56, { rightArm: [-0.74, 0.08, 0.78], rightForeArm: [-0.18, 0.04, 0.28] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  defense_lunge: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.24, sideLunge(0.55, { rightArm: [-0.26, 0.42, 0.7], rightForeArm: [-0.18, -0.28, 0.34] }), { hips: [0, -0.05, -0.08] }),
    f(0.46, sideLunge(0.86, { spine2: [0.14, 0.3, 0.18], rightArm: [-0.18, 0.38, 0.22], rightForeArm: [-0.12, -0.22, 0.04], leftArm: [-0.04, -0.16, -0.34] }), { hips: [0, -0.12, -0.18] }),
    f(0.76, sideLunge(0.62, { rightArm: [-0.18, 0.2, 0.38], rightForeArm: [-0.12, -0.1, 0.12] })),
    f(1, BASE_READY_ROTATIONS),
  ),
  block: frames(
    f(0, BASE_READY_ROTATIONS),
    f(0.22, readyWithLegs(0.64, { spine2: [0.06, 0.05, 0.02], rightArm: [-0.18, 0.12, 0.48], rightForeArm: [-0.08, -0.06, 0.2], leftArm: [-0.12, -0.1, -0.16] }), { hips: [0, -0.08, 0] }),
    f(0.44, readyWithLegs(0.74, { spine2: [0.1, 0.02, 0.02], rightArm: [-0.08, 0.14, 0.1], rightForeArm: [-0.06, -0.04, -0.06], leftArm: [-0.08, -0.08, -0.12] }), { hips: [0, -0.1, 0] }),
    f(0.72, readyWithLegs(0.58, { rightArm: [-0.18, 0.12, 0.3], rightForeArm: [-0.08, -0.04, 0.04] })),
    f(1, BASE_READY_ROTATIONS),
  ),
}

export function applyBadmintonPose(
  bones: HumanoidBones,
  action: BadmintonAction,
  time: number,
): BadmintonMotionSample {
  const sample = sampleBadmintonMotion(action, time)
  resetPose(bones)
  applyPoseFrames(bones, ACTION_FRAMES[action], sample.cycle)
  return sample
}

function frames(...items: PoseFrame[]): PoseFrame[] { return items }

function f(
  at: number,
  rotations: Partial<Record<BoneName, Vec3>>,
  positions: Partial<Record<BoneName, Vec3>> = {},
): PoseFrame {
  return { at, positions, rotations }
}

function readyWithLegs(amount: number, extra: Partial<Record<BoneName, Vec3>> = {}): Partial<Record<BoneName, Vec3>> {
  return {
    ...BASE_READY_ROTATIONS,
    rightUpLeg: [-amount * 0.55, 0.04, 0.05],
    leftUpLeg: [-amount * 0.48, -0.04, -0.05],
    rightLeg: [amount * 0.75, 0, 0],
    leftLeg: [amount * 0.72, 0, 0],
    rightFoot: [-amount * 0.26, 0, 0],
    leftFoot: [-amount * 0.24, 0, 0],
    ...extra,
  }
}

function overheadLoad(turn: number, side: number): Partial<Record<BoneName, Vec3>> {
  return readyWithLegs(0.58, {
    spine2: [-0.1, turn, -0.08],
    rightArm: [-1.42, -0.32, -1.08],
    rightForeArm: [-0.64, 0.1, -0.58],
    leftArm: [0.36, side, 0.86],
    leftForeArm: [0.12, 0, 0.34],
  })
}

function overheadContact(turn: number, side: number): Partial<Record<BoneName, Vec3>> {
  return readyWithLegs(0.42, {
    spine2: [-0.16, turn, -0.1],
    rightArm: [-1.08, -0.08, 0.64],
    rightForeArm: [-0.18, 0.08, 0.34],
    leftArm: [0.1, side, 0.5],
  })
}

function overheadFollow(turn: number): Partial<Record<BoneName, Vec3>> {
  return readyWithLegs(0.55, {
    spine2: [0.14, turn, 0.08],
    rightArm: [0.24, 0.18, 0.98],
    rightForeArm: [0.08, 0.04, 0.42],
    leftArm: [-0.14, 0.02, 0.26],
  })
}

function frontLunge(amount: number, extra: Partial<Record<BoneName, Vec3>> = {}): Partial<Record<BoneName, Vec3>> {
  return {
    ...readyWithLegs(0.45),
    hips: [0.08, 0, 0],
    rightUpLeg: [-0.78 * amount, -0.08, 0],
    rightLeg: [1.18 * amount, 0, 0],
    leftUpLeg: [0.38 * amount, 0.06, 0],
    leftLeg: [0.22 * amount, 0, 0],
    ...extra,
  }
}

function sideLunge(amount: number, extra: Partial<Record<BoneName, Vec3>> = {}): Partial<Record<BoneName, Vec3>> {
  return {
    ...readyWithLegs(0.42),
    hips: [0.08, 0.18 * amount, -0.12 * amount],
    rightUpLeg: [-0.62 * amount, -0.4 * amount, 0.16 * amount],
    rightLeg: [1.08 * amount, 0, 0],
    leftUpLeg: [0.28 * amount, 0.28 * amount, -0.12 * amount],
    leftLeg: [0.22 * amount, 0, 0],
    ...extra,
  }
}

function resetPose(bones: HumanoidBones): void {
  for (const bone of Object.values(bones)) {
    if (!bone) continue
    const rest = getRest(bone)
    bone.position.copy(rest.position)
    bone.rotation.copy(rest.rotation)
    bone.scale.copy(rest.scale)
  }
}

function applyPoseFrames(bones: HumanoidBones, frames: PoseFrame[], cycle: number): void {
  const [from, to, alpha] = framePair(frames, cycle)
  const rotationKeys = poseKeys(from.rotations, to.rotations)
  const positionKeys = poseKeys(from.positions, to.positions)
  for (const key of rotationKeys) {
    setRotation(bones[key], lerpVec(from.rotations?.[key] ?? ZERO, to.rotations?.[key] ?? ZERO, alpha))
  }
  for (const key of positionKeys) {
    setPositionOffset(bones[key], lerpVec(from.positions?.[key] ?? ZERO, to.positions?.[key] ?? ZERO, alpha))
  }
}

function framePair(frames: PoseFrame[], cycle: number): [PoseFrame, PoseFrame, number] {
  let from = frames[0]
  let to = frames[frames.length - 1]
  for (let index = 0; index < frames.length - 1; index++) {
    if (cycle < frames[index].at || cycle > frames[index + 1].at) continue
    from = frames[index]
    to = frames[index + 1]
    break
  }
  const span = Math.max(to.at - from.at, 0.0001)
  return [from, to, smoothstep((cycle - from.at) / span)]
}

function poseKeys(
  a: Partial<Record<BoneName, Vec3>> = {},
  b: Partial<Record<BoneName, Vec3>> = {},
): BoneName[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as BoneName[]
}

function setRotation(bone: THREE.Object3D | undefined, offset: Vec3): void {
  if (!bone) return
  const rest = getRest(bone)
  bone.rotation.set(rest.rotation.x + offset[0], rest.rotation.y + offset[1], rest.rotation.z + offset[2])
}

function setPositionOffset(bone: THREE.Object3D | undefined, offset: Vec3): void {
  if (!bone) return
  const rest = getRest(bone)
  bone.position.set(rest.position.x + offset[0], rest.position.y + offset[1], rest.position.z + offset[2])
}

function getRest(bone: THREE.Object3D): BoneRest {
  let rest = REST_POSE.get(bone)
  if (!rest) {
    rest = {
      position: bone.position.clone(),
      rotation: bone.rotation.clone(),
      scale: bone.scale.clone(),
    }
    REST_POSE.set(bone, rest)
  }
  return rest
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ]
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}
