import * as THREE from 'three'
import { RACKET_STRING_CENTER_DISTANCE as DOMAIN_STRING_CENTER_DISTANCE } from '../character/racketKinematics'

type Vec3 = [number, number, number]

/** SMPL/Mixamo neutral right-hand fingers are -X; palm normal is -Y. */
export const RACKET_IN_RIGHT_HAND = new THREE.Quaternion(0.5, -0.5, 0.5, 0.5)

const LOCAL_RACKET_FACE = new THREE.Vector3(0, 0, 1)
const RACKET_HEAD_DISTANCE = DOMAIN_STRING_CENTER_DISTANCE
export const RACKET_STRING_CENTER_DISTANCE = RACKET_HEAD_DISTANCE
const DEFAULT_RACKET_DIRECTION = new THREE.Vector3(0.55, 0.25, -0.05).normalize()
const DEFAULT_RACKET_FACE = new THREE.Vector3(1, 0.05, 0).normalize()
const RACKET_HAND = new THREE.Vector3()
const RACKET_FOREARM = new THREE.Vector3()
const RACKET_DIRECTION = new THREE.Vector3()
const RACKET_FACE = new THREE.Vector3()
const RACKET_X = new THREE.Vector3()
const RACKET_MATRIX = new THREE.Matrix4()
const RACKET_WORLD_QUATERNION = new THREE.Quaternion()

export function createSkeletalRacket(): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0xe7ecf4, metalness: 0.18, roughness: 0.34 })
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.08, roughness: 0.72 })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.16, 10), gripMaterial)
  group.add(handle)

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 8), material)
  shaft.position.y = 0.205
  group.add(shaft)

  const head = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.007, 8, 28), material)
  head.position.y = RACKET_HEAD_DISTANCE
  head.scale.x = 0.76
  group.add(head)

  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 24),
    new THREE.MeshBasicMaterial({ color: 0xdce6f5, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  )
  strings.position.y = RACKET_HEAD_DISTANCE
  strings.scale.x = 0.72
  group.add(strings)
  return group
}

export function syncRacketToHand(
  racket: THREE.Group,
  hand?: THREE.Object3D,
  direction?: Vec3,
  faceNormal?: Vec3,
  foreArm?: THREE.Object3D,
): void {
  if (!hand) return
  hand.getWorldPosition(RACKET_HAND)
  if (direction) {
    RACKET_DIRECTION.set(direction[0], direction[1], direction[2])
  } else if (foreArm) {
    foreArm.getWorldPosition(RACKET_FOREARM)
    RACKET_DIRECTION.copy(RACKET_HAND).sub(RACKET_FOREARM)
  } else {
    RACKET_DIRECTION.copy(DEFAULT_RACKET_DIRECTION)
  }
  if (faceNormal) RACKET_FACE.set(faceNormal[0], faceNormal[1], faceNormal[2])
  else RACKET_FACE.copy(DEFAULT_RACKET_FACE)
  syncRacketToGrip(racket, RACKET_HAND, RACKET_DIRECTION, RACKET_FACE)
}

export function syncRacketToGrip(
  racket: THREE.Group,
  grip: THREE.Vector3,
  direction: THREE.Vector3,
  faceNormal?: THREE.Vector3,
): void {
  RACKET_DIRECTION.copy(direction)
  if (RACKET_DIRECTION.lengthSq() < 0.000001) RACKET_DIRECTION.copy(DEFAULT_RACKET_DIRECTION)
  RACKET_DIRECTION.normalize()
  racket.position.copy(grip)
  RACKET_FACE.copy(faceNormal ?? DEFAULT_RACKET_FACE)
  RACKET_FACE.addScaledVector(RACKET_DIRECTION, -RACKET_FACE.dot(RACKET_DIRECTION))
  if (RACKET_FACE.lengthSq() < 0.000001) {
    RACKET_FACE.copy(Math.abs(RACKET_DIRECTION.y) < 0.9 ? DEFAULT_RACKET_FACE : LOCAL_RACKET_FACE)
    RACKET_FACE.addScaledVector(RACKET_DIRECTION, -RACKET_FACE.dot(RACKET_DIRECTION))
  }
  RACKET_FACE.normalize()
  RACKET_X.crossVectors(RACKET_DIRECTION, RACKET_FACE).normalize()
  RACKET_FACE.crossVectors(RACKET_X, RACKET_DIRECTION).normalize()
  RACKET_MATRIX.makeBasis(RACKET_X, RACKET_DIRECTION, RACKET_FACE)
  racket.quaternion.setFromRotationMatrix(RACKET_MATRIX)
}

export function getRacketStringCenterWorld(racket: THREE.Group, target: THREE.Vector3): void {
  target.set(0, RACKET_STRING_CENTER_DISTANCE, 0)
  racket.localToWorld(target)
}

export function getRacketGripWorld(racket: THREE.Group, target: THREE.Vector3): void {
  racket.getWorldPosition(target)
}

export function getRacketFaceNormalWorld(racket: THREE.Group, target: THREE.Vector3): void {
  target.copy(LOCAL_RACKET_FACE).applyQuaternion(racket.getWorldQuaternion(RACKET_WORLD_QUATERNION)).normalize()
}
