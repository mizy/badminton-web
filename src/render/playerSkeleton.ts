/** Model-independent badminton rig. Local forward is +Z, anatomical right is -X. */
import * as THREE from 'three'
import { ARM_LENGTH, PLAYER_HEIGHT, SHOULDER_HEIGHT, SHOULDER_HALF_WIDTH } from '../character/racketKinematics'

export const UPPER_ARM = 0.34
export const ANKLE_HEIGHT = 0.09
const DOWN = new THREE.Vector3(0, -1, 0)

export interface Limb {
  root: THREE.Bone
  joint: THREE.Bone
  end: THREE.Bone
  lengths: [number, number]
}

export interface PlayerSkeleton {
  group: THREE.Group
  body: THREE.Bone
  hips: THREE.Bone
  chest: THREE.Bone
  head: THREE.Bone
  rightArm: Limb
  leftArm: Limb
  rightLeg: Limb
  leftLeg: Limb
  racket: THREE.Bone
}

function bone(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Bone {
  const node = new THREE.Bone()
  node.name = name
  node.position.set(x, y, z)
  parent.add(node)
  return node
}

function limb(parent: THREE.Bone, side: 'right' | 'left', arm: boolean): Limb {
  const sign = side === 'right' ? -1 : 1
  const lengths: [number, number] = arm ? [UPPER_ARM, ARM_LENGTH - UPPER_ARM] : [0.43, 0.43]
  const root = bone(parent, `${side}-${arm ? 'shoulder' : 'hip'}`,
    sign * (arm ? SHOULDER_HALF_WIDTH : 0.105), arm ? SHOULDER_HEIGHT : 0, arm ? 0.04 : 0)
  const joint = bone(root, `${side}-${arm ? 'elbow' : 'knee'}`, 0, -lengths[0])
  const end = bone(joint, `${side}-${arm ? 'wrist' : 'ankle'}`, 0, -lengths[1])
  return { root, joint, end, lengths }
}

/** @entry Creates joints only; skins attach separately and never own motion state. */
export function createPlayerSkeleton(): PlayerSkeleton {
  const group = new THREE.Group()
  group.name = 'player'
  const body = bone(group, 'player-body')
  const hips = bone(body, 'player-hips', 0, 0.94)
  const chest = bone(body, 'player-chest')
  const head = bone(chest, 'head-joint', 0, PLAYER_HEIGHT - 0.126, 0.007)
  const rightArm = limb(chest, 'right', true)
  const leftArm = limb(chest, 'left', true)
  const rightLeg = limb(hips, 'right', false)
  const leftLeg = limb(hips, 'left', false)
  const racket = bone(rightArm.end, 'racket-socket')
  return { group, body, hips, chest, head, rightArm, leftArm, rightLeg, leftLeg, racket }
}

/** Two-bone IK changes rotations; bind translations and limb lengths stay fixed. */
export function poseLimb(chain: Limb, target: THREE.Vector3, pole: THREE.Vector3): void {
  const [a, b] = chain.lengths
  const direction = target.clone().sub(chain.root.position)
  const requested = direction.length()
  if (requested < 1e-8) direction.copy(DOWN)
  else direction.divideScalar(requested)
  const distance = THREE.MathUtils.clamp(requested, Math.abs(a - b) + 1e-6, a + b)
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  const height = Math.sqrt(Math.max(0, a * a - along * along))
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction))
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(direction, -direction.z)
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0)
  const elbow = direction.clone().multiplyScalar(along).addScaledVector(bend.normalize(), height)
  const lower = direction.multiplyScalar(distance).sub(elbow).normalize()
  chain.root.quaternion.setFromUnitVectors(DOWN, elbow.normalize())
  const inverse = chain.root.quaternion.clone().invert()
  chain.joint.quaternion.copy(inverse).multiply(new THREE.Quaternion().setFromUnitVectors(DOWN, lower))
  chain.end.quaternion.copy(chain.joint.quaternion).premultiply(chain.root.quaternion).invert()
}

export function limbEnd(chain: Limb): THREE.Vector3 {
  chain.root.updateWorldMatrix(true, true)
  return chain.root.parent!.worldToLocal(chain.end.getWorldPosition(new THREE.Vector3()))
}
