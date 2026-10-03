/** Measured MultiSenseBadminton joint positions → the shared display skeleton. */
import * as THREE from 'three'
import { RACKET_IN_RIGHT_HAND } from './skeletalRacket'
import { ANKLE_HEIGHT, poseLimb, type Limb, type PlayerSkeleton } from './playerSkeleton'
import { SHOULDER_HEIGHT, type Vec3 } from '../character/racketKinematics'

/** Bundled PNS 21-joint capture, Y-up metres with original sample timestamps. */
export interface MultiSenseCapture {
  time: number[]
  globalPositions: Vec3[][]
}

function bodyRotation(left: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const x = left.clone().sub(right).normalize()
  const z = new THREE.Vector3().crossVectors(x, up).normalize()
  const y = new THREE.Vector3().crossVectors(z, x).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function capturedLimb(limb: Limb, parent: THREE.Bone, points: THREE.Vector3[], indices: [number, number, number]): void {
  const inverse = parent.matrix.clone().invert()
  const [root, joint, end] = indices.map(index => points[index].clone().applyMatrix4(inverse))
  limb.root.position.copy(root)
  poseLimb(limb, end, joint.sub(root))
}

/** @entry Retarget measured positions; gameplay contact timing remains separate. */
export function applyMultiSensePlayerMotion(rig: PlayerSkeleton, capture: MultiSenseCapture, time: number): void {
  const duration = capture.time.at(-1)!
  const elapsed = time % duration
  let frame = 0
  while (frame + 1 < capture.time.length && capture.time[frame + 1] <= elapsed) frame++
  const next = Math.min(frame + 1, capture.time.length - 1)
  const span = capture.time[next] - capture.time[frame]
  const alpha = span > 0 ? (elapsed - capture.time[frame]) / span : 0
  const initial = capture.globalPositions[0]
  const lateral = new THREE.Vector3(...initial[18]).sub(new THREE.Vector3(...initial[14]))
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(lateral.z, lateral.x))
  const origin = new THREE.Vector3(initial[0][0], 0, initial[0][2])
  const points = capture.globalPositions[frame].map((point, index) => new THREE.Vector3(...point)
    .lerp(new THREE.Vector3(...capture.globalPositions[next][index]), alpha).sub(origin).applyQuaternion(facing))
  rig.body.position.set(0, ANKLE_HEIGHT - Math.min(points[3].y, points[6].y), 0)
  rig.body.quaternion.identity()
  rig.hips.position.copy(points[0])
  rig.hips.quaternion.copy(bodyRotation(points[4], points[1], points[7].clone().sub(points[0])))
  rig.chest.quaternion.copy(bodyRotation(points[18], points[14], points[12].clone().sub(points[9])))
  rig.chest.position.copy(points[14]).add(points[18]).multiplyScalar(0.5)
    .sub(new THREE.Vector3(0, SHOULDER_HEIGHT, 0.04).applyQuaternion(rig.chest.quaternion))
  rig.hips.updateMatrix()
  rig.chest.updateMatrix()
  capturedLimb(rig.rightLeg, rig.hips, points, [1, 2, 3])
  capturedLimb(rig.leftLeg, rig.hips, points, [4, 5, 6])
  capturedLimb(rig.rightArm, rig.chest, points, [14, 15, 16])
  capturedLimb(rig.leftArm, rig.chest, points, [18, 19, 20])
  rig.head.position.copy(points[12]).applyMatrix4(rig.chest.matrix.clone().invert())
  rig.head.quaternion.identity()
  // The dataset records the body, not the racket; grip orientation is derived.
  rig.racket.quaternion.copy(RACKET_IN_RIGHT_HAND)
  rig.group.updateWorldMatrix(true, true)
}
