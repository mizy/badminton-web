import * as THREE from 'three'
import {
  sampleHdm05Playback,
  type Hdm05Motion,
  type Hdm05PlaybackOptions,
  type Hdm05PlaybackSample,
} from './hdm05BadmintonMocap'

export interface Hdm05SourceSkeleton {
  dispose: () => void
  group: THREE.Group
  jointPositions: THREE.Vector3[]
}

const PARENTS = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19]
const BONES = PARENTS.map((parent, joint) => [parent, joint]).filter(([parent]) => parent >= 0)
const OFFSETS: Array<[number, number, number]> = [
  [0, 0.95, 0],
  [-0.09, -0.08, 0],
  [0.09, -0.08, 0],
  [0, 0.12, 0],
  [0, -0.43, 0.015],
  [0, -0.43, 0.015],
  [0, 0.18, 0],
  [0, -0.43, -0.015],
  [0, -0.43, -0.015],
  [0, 0.18, 0],
  [0, -0.06, 0.13],
  [0, -0.06, 0.13],
  [0, 0.16, 0],
  [-0.08, 0.11, 0],
  [0.08, 0.11, 0],
  [0, 0.18, 0.02],
  [-0.18, 0.02, 0],
  [0.18, 0.02, 0],
  [-0.28, 0, 0],
  [0.28, 0, 0],
  [-0.25, 0, 0],
  [0.25, 0, 0],
]

const BASE_POSITION = new THREE.Vector3(-2.2, 0, -0.15)
const AXIS = new THREE.Vector3()
const ROOT_OFFSET = new THREE.Vector3()
const TEMP_QUAT = new THREE.Quaternion()
const TEMP_OFFSET = new THREE.Vector3()

export function createHdm05SourceSkeleton(): Hdm05SourceSkeleton {
  const group = new THREE.Group()
  const jointPositions = OFFSETS.map(() => new THREE.Vector3())
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(BONES.length * 2 * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x7be7ff, transparent: true, opacity: 0.95 }),
  )
  group.add(line)

  const jointGeometry = new THREE.SphereGeometry(0.035, 10, 8)
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xffc08a, roughness: 0.55 })
  for (const position of jointPositions) {
    const joint = new THREE.Mesh(jointGeometry, jointMaterial)
    joint.position.copy(position)
    group.add(joint)
  }

  return {
    dispose: () => {
      geometry.dispose()
      ;(line.material as THREE.Material).dispose()
      jointGeometry.dispose()
      jointMaterial.dispose()
    },
    group,
    jointPositions,
  }
}

export function applyHdm05SourceSkeleton(
  rig: Hdm05SourceSkeleton,
  motion: Hdm05Motion,
  time: number,
  options: Hdm05PlaybackOptions,
): Hdm05PlaybackSample {
  const sample = sampleHdm05Playback(motion, time)
  const { alpha, frame, nextFrame } = sample
  const worldRotations = OFFSETS.map(() => new THREE.Quaternion())

  ROOT_OFFSET.copy(smplVectorToThree(lerpRow(motion.root, frame, nextFrame, alpha), options.rootMotionScale))
  rig.jointPositions[0].copy(BASE_POSITION).add(ROOT_OFFSET).add(vectorFromOffset(OFFSETS[0]))
  worldRotations[0].copy(rotationFromVector(lerpRow(motion.rootOrient, frame, nextFrame, alpha), options.rootRotationScale))

  for (let joint = 1; joint < OFFSETS.length; joint++) {
    const parent = PARENTS[joint]
    const localRotation = rotationAt(motion.poseBody, frame, nextFrame, alpha, joint - 1, options.poseScale)
    worldRotations[joint].copy(worldRotations[parent]).multiply(localRotation)
    TEMP_OFFSET.copy(vectorFromOffset(OFFSETS[joint])).applyQuaternion(worldRotations[parent])
    rig.jointPositions[joint].copy(rig.jointPositions[parent]).add(TEMP_OFFSET)
  }
  syncMeshes(rig)
  return sample
}

function syncMeshes(rig: Hdm05SourceSkeleton): void {
  const line = rig.group.children[0] as THREE.LineSegments
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
  const array = attr.array as Float32Array
  for (let index = 0; index < BONES.length; index++) {
    const [parent, joint] = BONES[index]
    rig.jointPositions[parent].toArray(array, index * 6)
    rig.jointPositions[joint].toArray(array, index * 6 + 3)
  }
  attr.needsUpdate = true
  for (let joint = 0; joint < rig.jointPositions.length; joint++) {
    rig.group.children[joint + 1].position.copy(rig.jointPositions[joint])
  }
}

function rotationAt(
  rows: number[][],
  frame: number,
  nextFrame: number,
  alpha: number,
  joint: number,
  scale: number,
): THREE.Quaternion {
  return rotationFromVector(axisAt(rows, frame, nextFrame, alpha, joint), scale)
}

function rotationFromVector(sourceVector: number[], scale: number): THREE.Quaternion {
  const axis = smplVectorToThree(sourceVector, 1)
  const length = axis.length()
  if (length < 0.00001 || scale === 0) return TEMP_QUAT.identity().clone()
  AXIS.copy(axis).multiplyScalar(1 / length)
  return TEMP_QUAT.setFromAxisAngle(AXIS, length * scale).clone()
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
  return new THREE.Vector3(value[0] * scale, value[2] * scale, -value[1] * scale)
}

function vectorFromOffset(value: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2])
}
