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
/**
 * T-pose 关节偏移（渲染坐标系）。整体已做 (x,y,z)→(z,y,x) 变换：
 * 使假人面朝 +x（球网在 x=0），数据右手落在假人视觉右侧（+z）。
 * 左/右标签与假人朝向一致：left* 在 -z 侧，right* 在 +z 侧。
 */
const OFFSETS: Array<[number, number, number]> = [
  [0, 0.95, 0],
  [0, -0.08, -0.09],
  [0, -0.08, 0.09],
  [0, 0.12, 0],
  [0.015, -0.43, 0],
  [0.015, -0.43, 0],
  [0, 0.18, 0],
  [-0.015, -0.43, 0],
  [-0.015, -0.43, 0],
  [0, 0.18, 0],
  [0.13, -0.06, 0],
  [0.13, -0.06, 0],
  [0, 0.16, 0],
  [0, 0.11, -0.08],
  [0, 0.11, 0.08],
  [0.02, 0.18, 0],
  [0, 0.02, -0.18],
  [0, 0.02, 0.18],
  [0, 0, -0.28],
  [0, 0, 0.28],
  [0, 0, -0.25],
  [0, 0, 0.25],
]

const BASE_POSITION = new THREE.Vector3(-2.2, 0, 0)
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
  // 轴角映射含镜像（行列式 -1），镜像共轭会使旋转方向反转，故角度取反
  return TEMP_QUAT.setFromAxisAngle(AXIS, -length * scale).clone()
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

/**
 * AMASS/HDM05 坐标系 → Three.js：
 * 数据实测为 z-up（垂直轴在数据 z 分量，root 位移的 z 全程恒定≈0），
 * Three.js 为 y-up。故 x→y、y→z、z→-x（等价于 (x,-z,y) 再镜像 x 并绕 Y 转 +90°）。
 * 这样假人面朝 +x（球网在 x=0），数据右手（SMPL 关节 20→骨架 21）落在假人视觉右手侧；
 * 若用 (x,-z,y)，假人面朝 +z，挥拍手会画到假人左侧（左右镜像错误）。
 * 垂直分量同为 -z，击球点高度语义不变（扣杀 2.1m、高远 2.1m、吊球 2.1m、低发 1.1m）。
 */
function smplVectorToThree(value: number[], scale: number): THREE.Vector3 {
  return new THREE.Vector3(value[1] * scale, -value[2] * scale, value[0] * scale)
}

function vectorFromOffset(value: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2])
}
