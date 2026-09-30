/** Retargets the badminton skeleton to a glTF skin without changing its bind lengths. */
import * as THREE from 'three'
import { findHumanoidBones, normalizeHumanoidModel } from './humanoidModel'
import type { Limb, PlayerSkeleton } from './playerSkeleton'

interface Joint {
  node: THREE.Object3D
  rotation: THREE.Quaternion
  axis: THREE.Vector3
}

interface ModelLimb {
  upper: Joint
  lower: Joint
  end: Joint
  lengths: [number, number]
  source: Limb
}

function restJoint(node: THREE.Object3D, group: THREE.Group, child?: THREE.Object3D): Joint {
  const inverse = group.getWorldQuaternion(new THREE.Quaternion()).invert()
  const axis = child ? child.getWorldPosition(new THREE.Vector3()).sub(node.getWorldPosition(new THREE.Vector3()))
    .applyQuaternion(inverse).normalize() : new THREE.Vector3(0, 1, 0)
  return { node, rotation: node.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse), axis }
}

function rotate(joint: Joint, world: THREE.Quaternion): void {
  const parent = joint.node.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()
  joint.node.quaternion.copy(parent).multiply(world)
  joint.node.updateWorldMatrix(false, true)
}

function aim(joint: Joint, direction: THREE.Vector3, facing: THREE.Quaternion): void {
  const local = direction.normalize().applyQuaternion(facing.clone().invert())
  const rotation = new THREE.Quaternion().setFromUnitVectors(joint.axis, local)
    .multiply(joint.rotation).premultiply(facing)
  rotate(joint, rotation)
}

function retargetLimb(limb: ModelLimb, facing: THREE.Quaternion): void {
  const root = limb.upper.node.getWorldPosition(new THREE.Vector3())
  const target = limb.source.end.getWorldPosition(new THREE.Vector3())
  const direction = target.clone().sub(root)
  const [a, b] = limb.lengths
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + 1e-6, a + b - 1e-6)
  direction.normalize()
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  const bend = limb.source.joint.getWorldPosition(new THREE.Vector3()).sub(root)
  bend.addScaledVector(direction, -bend.dot(direction)).normalize()
  const elbow = direction.clone().multiplyScalar(along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
  aim(limb.upper, elbow.clone(), facing)
  aim(limb.lower, direction.multiplyScalar(distance).sub(elbow), facing)
  rotate(limb.end, limb.source.end.getWorldQuaternion(new THREE.Quaternion()).multiply(limb.end.rotation))
}

/** @entry Captures the skin's rest axes once; returns its per-frame pose consumer. */
export function bindHumanoidModel(rig: PlayerSkeleton, model: THREE.Group): () => void {
  const bones = findHumanoidBones(model)
  const required = ['hips', 'spine2', 'rightArm', 'rightForeArm', 'rightHand', 'leftArm', 'leftForeArm', 'leftHand',
    'rightUpLeg', 'rightLeg', 'rightFoot', 'leftUpLeg', 'leftLeg', 'leftFoot'] as const
  const missing = required.filter(key => !bones[key])
  if (missing.length) throw new Error(`缺少人形骨骼：${missing.join(', ')}`)
  normalizeHumanoidModel(model, 0)
  model.name = 'player-model'
  rig.group.add(model)
  model.updateWorldMatrix(true, true)
  const hips = restJoint(bones.hips!, rig.group)
  const chest = restJoint(bones.spine2!, rig.group)
  const head = bones.head ? restJoint(bones.head, rig.group) : null
  const limbs: ModelLimb[] = []
  for (const side of ['right', 'left'] as const) {
    for (const arm of [true, false]) {
      const upper = bones[`${side}${arm ? 'Arm' : 'UpLeg'}`]!
      const lower = bones[`${side}${arm ? 'ForeArm' : 'Leg'}`]!
      const end = bones[`${side}${arm ? 'Hand' : 'Foot'}`]!
      const a = upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()))
      const b = lower.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()))
      limbs.push({ upper: restJoint(upper, rig.group, lower), lower: restJoint(lower, rig.group, end),
        end: restJoint(end, rig.group), lengths: [a, b], source: rig[`${side}${arm ? 'Arm' : 'Leg'}`] })
    }
  }
  const racket = rig.racket.getObjectByName('player-racket')!
  bones.rightHand!.add(racket)
  model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true } })
  return () => {
    rig.group.updateWorldMatrix(true, true)
    const facing = rig.group.getWorldQuaternion(new THREE.Quaternion())
    hips.node.position.copy(hips.node.parent!.worldToLocal(rig.hips.getWorldPosition(new THREE.Vector3())))
    rotate(hips, rig.hips.getWorldQuaternion(new THREE.Quaternion()).multiply(hips.rotation))
    rotate(chest, rig.chest.getWorldQuaternion(new THREE.Quaternion()).multiply(chest.rotation))
    if (head) rotate(head, rig.head.getWorldQuaternion(new THREE.Quaternion()).multiply(head.rotation))
    limbs.forEach(limb => retargetLimb(limb, facing))
    racket.position.set(0, 0, 0)
    // glTF bones may use centimetres; attached equipment stays in court metres.
    racket.scale.copy(rig.group.getWorldScale(new THREE.Vector3()))
      .divide(bones.rightHand!.getWorldScale(new THREE.Vector3()))
    racket.quaternion.copy(bones.rightHand!.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(rig.racket.getWorldQuaternion(new THREE.Quaternion()))
    model.updateWorldMatrix(false, true)
  }
}
