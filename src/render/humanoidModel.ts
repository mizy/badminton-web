/** glTF humanoid discovery and sizing; independent of badminton motion. */
import * as THREE from 'three'

const BONE_KEYS = [
  'head', 'hips', 'leftArm', 'leftFoot', 'leftForeArm', 'leftHand', 'leftLeg', 'leftShoulder',
  'leftToe', 'leftUpLeg', 'neck', 'rightArm', 'rightFoot', 'rightForeArm', 'rightHand',
  'rightLeg', 'rightShoulder', 'rightToe', 'rightUpLeg', 'spine', 'spine1', 'spine2',
] as const

export type BoneName = typeof BONE_KEYS[number]
export type HumanoidBones = Partial<Record<BoneName, THREE.Object3D>>

const NODE_TO_BONE: Record<string, BoneName> = {
  Chest: 'spine1', Head: 'head', Hips: 'hips', LeftArm: 'leftArm', LeftFoot: 'leftFoot',
  LeftForeArm: 'leftForeArm', LeftHand: 'leftHand', LeftLeg: 'leftLeg',
  LeftShoulder: 'leftShoulder', LeftToeBase: 'leftToe', LeftUpLeg: 'leftUpLeg',
  Neck: 'neck', RightArm: 'rightArm', RightFoot: 'rightFoot', RightForeArm: 'rightForeArm',
  RightHand: 'rightHand', RightLeg: 'rightLeg', RightShoulder: 'rightShoulder',
  RightToeBase: 'rightToe', RightToes: 'rightToe', RightUpLeg: 'rightUpLeg', Spine: 'spine',
  Spine1: 'spine1', Spine2: 'spine2', UpperChest: 'spine2', LeftToes: 'leftToe',
}

export function findHumanoidBones(root: THREE.Object3D): HumanoidBones {
  const bones: HumanoidBones = {}
  root.traverse((object) => {
    const key = NODE_TO_BONE[object.name.replace(/^mixamorig:?/, '')]
    if (key) bones[key] = object
  })
  return bones
}

export function normalizeHumanoidModel(model: THREE.Object3D, yaw = Math.PI / 2): void {
  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  box.getSize(size)
  const scale = size.y > 0 ? 1.78 / size.y : 1
  model.scale.multiplyScalar(scale)
  const nextBox = new THREE.Box3().setFromObject(model)
  model.position.y -= nextBox.min.y
  model.rotation.y = yaw
}
