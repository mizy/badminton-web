/** HDM05/AMASS pose rotations → the shared, model-independent badminton skeleton. */
import * as THREE from 'three'
import { ARM_LENGTH } from '../character/racketKinematics'
import { RACKET_IN_RIGHT_HAND } from './skeletalRacket'
import { poseLimb, UPPER_ARM, type Limb, type PlayerSkeleton } from './playerSkeleton'
import { sampleHdm05Playback, type Hdm05Motion, type Hdm05PlaybackSample } from './hdm05BadmintonMocap'

// SMPL body hierarchy in its neutral Y-up T-pose. Actor shape offsets are absent
// from the supplied JSON, so use the shared athlete's proportions for retargeting.
const PARENTS = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19]
const OFFSETS = [
  [0, 0.94, 0], [0.105, 0, 0], [-0.105, 0, 0], [0, 0.11, 0],
  [0, -0.43, 0], [0, -0.43, 0], [0, 0.13, 0], [0, -0.43, 0], [0, -0.43, 0], [0, 0.18, 0],
  [0, 0, 0.12], [0, 0, 0.12], [0, 0.17, 0], [0.08, 0.1, 0.04], [-0.08, 0.1, 0.04], [0, 0.124, 0],
  [0.12, 0, 0], [-0.12, 0, 0], [UPPER_ARM, 0, 0], [-UPPER_ARM, 0, 0],
  [ARM_LENGTH - UPPER_ARM, 0, 0], [-(ARM_LENGTH - UPPER_ARM), 0, 0],
]
const Z_UP_TO_Y_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const UNIT_SCALE = new THREE.Vector3(1, 1, 1)

function rotation(row: number[], joint = 0): THREE.Quaternion {
  const vector = new THREE.Vector3(row[joint * 3], row[joint * 3 + 1], row[joint * 3 + 2])
  const angle = vector.length()
  return angle < 1e-8 ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(vector.divideScalar(angle), angle)
}

function sourcePose(motion: Hdm05Motion<string>, sample: Hdm05PlaybackSample): THREE.Matrix4[] {
  const { frame, nextFrame, alpha } = sample
  const matrices: THREE.Matrix4[] = []
  for (let joint = 0; joint < PARENTS.length; joint++) {
    const q = joint === 0 ? new THREE.Quaternion() : rotation(motion.poseBody[frame], joint - 1)
      .slerp(rotation(motion.poseBody[nextFrame], joint - 1), alpha)
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...OFFSETS[joint]), q, UNIT_SCALE)
    matrices.push(joint === 0 ? local : matrices[PARENTS[joint]].clone().multiply(local))
  }
  return matrices
}

function poseCapturedLimb(limb: Limb, parent: THREE.Bone, source: THREE.Matrix4[], indices: [number, number, number]): void {
  const inverse = parent.matrix.clone().invert()
  const [root, joint, end] = indices.map(index => new THREE.Vector3().setFromMatrixPosition(source[index]).applyMatrix4(inverse))
  limb.root.position.copy(root)
  poseLimb(limb, end, joint.sub(root))
  const desired = parent.quaternion.clone().invert().multiply(new THREE.Quaternion().setFromRotationMatrix(source[indices[2]]))
  limb.end.quaternion.copy(limb.root.quaternion).multiply(limb.joint.quaternion).invert().multiply(desired)
}

/** @entry Applies captured rotations at full amplitude; no skin, GameState mutation or synthetic gait. */
export function applyHdm05PlayerMotion(rig: PlayerSkeleton, motion: Hdm05Motion<string>, time: number): Hdm05PlaybackSample {
  const sample = sampleHdm05Playback(motion, time)
  const source = sourcePose(motion, sample)
  const root = new THREE.Vector3(...motion.root[sample.frame])
    .lerp(new THREE.Vector3(...motion.root[sample.nextFrame]), sample.alpha)
    .sub(new THREE.Vector3(motion.root[0][0], motion.root[0][1], 0))
  rig.body.position.copy(root.applyQuaternion(Z_UP_TO_Y_UP))
  rig.body.quaternion.copy(Z_UP_TO_Y_UP).multiply(rotation(motion.rootOrient[sample.frame])
    .slerp(rotation(motion.rootOrient[sample.nextFrame]), sample.alpha))
  rig.hips.position.set(0, 0.94, 0)
  rig.hips.quaternion.identity()
  rig.chest.quaternion.setFromRotationMatrix(source[9])
  rig.chest.position.setFromMatrixPosition(source[9]).sub(new THREE.Vector3(0, 1.36, 0).applyQuaternion(rig.chest.quaternion))
  rig.hips.updateMatrix()
  rig.chest.updateMatrix()
  poseCapturedLimb(rig.leftLeg, rig.hips, source, [1, 4, 7])
  poseCapturedLimb(rig.rightLeg, rig.hips, source, [2, 5, 8])
  poseCapturedLimb(rig.leftArm, rig.chest, source, [16, 18, 20])
  poseCapturedLimb(rig.rightArm, rig.chest, source, [17, 19, 21])
  rig.head.position.setFromMatrixPosition(source[15]).applyMatrix4(rig.chest.matrix.clone().invert())
  rig.head.quaternion.copy(rig.chest.quaternion).invert().multiply(new THREE.Quaternion().setFromRotationMatrix(source[15]))
  rig.racket.quaternion.copy(RACKET_IN_RIGHT_HAND)
  rig.group.updateWorldMatrix(true, true)
  return sample
}
