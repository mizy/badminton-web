/** 纯运动学接触几何：角色、游戏与渲染共享同一套拍弦/球塞定义。 */

export type Vec3 = [number, number, number]

export interface RacketContactPose {
  faceNormal: Vec3
  gripPoint: Vec3
  reachDistance: number
  reachable: boolean
  shaftDirection: Vec3
  stringCenter: Vec3
}

export interface ReachableRacketPoseInput {
  desiredContact: Vec3
  playerPos: Vec3
  playerSide: 0 | 1
  racketFaceDeg: number
}

export const PLAYER_HEIGHT = 1.78
export const SHOULDER_HEIGHT = 1.46
export const SHOULDER_HALF_WIDTH = 0.2
export const ARM_LENGTH = 0.66
export const RACKET_STRING_CENTER_DISTANCE = 0.46
export const SHUTTLE_CORK_RADIUS = 0.018
export const MAX_CONTACT_ERROR = 0.05

const MIN_REACH_DISTANCE = 0.1
const MAX_REACH_DISTANCE = RACKET_STRING_CENTER_DISTANCE + ARM_LENGTH - 0.02
export const MAX_CONTACT_HEIGHT = SHOULDER_HEIGHT + MAX_REACH_DISTANCE
const CONTACT_HEIGHT_RANGE = [0.32, MAX_CONTACT_HEIGHT] as const

/** @entry 用双球面 IK 求出可达手位；不可达时返回极限拍弦位置而不是伪造命中。 */
export function createReachableRacketPose(input: ReachableRacketPoseInput): RacketContactPose {
  const shoulder = getPlayerRightShoulder(input.playerPos, input.playerSide)
  const desiredOffset = subtract3(input.desiredContact, shoulder)
  const desiredDistance = length3(desiredOffset)
  const minHeight = input.playerPos[1] + CONTACT_HEIGHT_RANGE[0]
  const maxHeight = input.playerPos[1] + CONTACT_HEIGHT_RANGE[1]
  const heightReachable = input.desiredContact[1] >= minHeight && input.desiredContact[1] <= maxHeight
  const distanceReachable = desiredDistance >= MIN_REACH_DISTANCE && desiredDistance <= MAX_REACH_DISTANCE
  const reachable = heightReachable && distanceReachable
  const constrainedTarget: Vec3 = [
    input.desiredContact[0],
    clamp(input.desiredContact[1], minHeight, maxHeight),
    input.desiredContact[2],
  ]
  const constrainedOffset = subtract3(constrainedTarget, shoulder)
  const constrainedDirection = normalize3(
    constrainedOffset,
    input.playerSide === 0 ? [1, 0, 0] : [-1, 0, 0],
  )
  const constrainedDistance = clamp(length3(constrainedOffset), MIN_REACH_DISTANCE, MAX_REACH_DISTANCE)
  const stringCenter = reachable
    ? [...input.desiredContact] as Vec3
    : add3(shoulder, scale3(constrainedDirection, constrainedDistance))

  const gripPoint = solveGripPoint(shoulder, stringCenter, input.playerSide)
  const shaftDirection = normalize3(subtract3(stringCenter, gripPoint), constrainedDirection)
  const faceNormal = createFaceNormal(shaftDirection, input.playerSide, input.racketFaceDeg)

  return {
    faceNormal,
    gripPoint,
    reachDistance: desiredDistance,
    reachable,
    shaftDirection,
    stringCenter,
  }
}

export function createMeasuredRacketPose(
  gripPoint: Vec3,
  stringCenter: Vec3,
  faceNormal: Vec3,
  reachable = true,
): RacketContactPose {
  const shaftDirection = normalize3(subtract3(stringCenter, gripPoint), [0, 1, 0])
  return {
    faceNormal: orthogonalize(faceNormal, shaftDirection),
    gripPoint: [...gripPoint],
    reachDistance: distance3(gripPoint, stringCenter),
    reachable,
    shaftDirection,
    stringCenter: [...stringCenter],
  }
}

export function getShuttleCorkCenter(position: Vec3, velocity: Vec3): Vec3 {
  const direction = normalize3(velocity, [0, 1, 0])
  return add3(position, scale3(direction, SHUTTLE_CORK_RADIUS))
}

export function placeShuttleForCorkCenter(corkCenter: Vec3, velocity: Vec3): Vec3 {
  const direction = normalize3(velocity, [0, 1, 0])
  return subtract3(corkCenter, scale3(direction, SHUTTLE_CORK_RADIUS))
}

export function getShuttleCorkGroundClearance(position: Vec3, velocity: Vec3, groundY = 0): number {
  return getShuttleCorkCenter(position, velocity)[1] - SHUTTLE_CORK_RADIUS - groundY
}

export function hasShuttleCorkLanded(position: Vec3, velocity: Vec3, groundY = 0): boolean {
  return getShuttleCorkGroundClearance(position, velocity, groundY) <= 0
}

export function placeLandedShuttle(position: Vec3, velocity: Vec3, groundY = 0): Vec3 {
  const clearance = getShuttleCorkGroundClearance(position, velocity, groundY)
  return [position[0], position[1] - clearance, position[2]]
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function normalize3(value: Vec3, fallback: Vec3): Vec3 {
  const length = length3(value)
  if (length < 0.000001) return [...fallback]
  return [value[0] / length, value[1] / length, value[2] / length]
}

function solveGripPoint(shoulder: Vec3, stringCenter: Vec3, playerSide: 0 | 1): Vec3 {
  const between = subtract3(stringCenter, shoulder)
  const distance = Math.max(length3(between), 0.0001)
  const axis = normalize3(between, playerSide === 0 ? [1, 0, 0] : [-1, 0, 0])
  const armReach = Math.min(ARM_LENGTH, Math.max(0.38,
    distance - RACKET_STRING_CENTER_DISTANCE + 0.04, RACKET_STRING_CENTER_DISTANCE - distance + 0.04))
  const along = clamp(
    (armReach ** 2 - RACKET_STRING_CENTER_DISTANCE ** 2 + distance ** 2) / (2 * distance),
    -armReach,
    armReach,
  )
  const circleRadius = Math.sqrt(Math.max(0, armReach ** 2 - along ** 2))
  const pole: Vec3 = [0, -0.58, playerSide === 0 ? 0.82 : -0.82]
  const perpendicular = orthogonalize(pole, axis)
  return add3(add3(shoulder, scale3(axis, along)), scale3(perpendicular, circleRadius))
}

function createFaceNormal(shaftDirection: Vec3, playerSide: 0 | 1, faceDeg: number): Vec3 {
  const forward = playerSide === 0 ? 1 : -1
  const angle = faceDeg * Math.PI / 180
  return orthogonalize([forward * Math.cos(angle), Math.sin(angle), 0], shaftDirection)
}

function orthogonalize(value: Vec3, axis: Vec3): Vec3 {
  const projection = dot3(value, axis)
  const perpendicular = subtract3(value, scale3(axis, projection))
  if (length3(perpendicular) > 0.000001) return normalize3(perpendicular, [0, 0, 1])
  const fallback: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  return normalize3(cross3(axis, fallback), [0, 0, 1])
}

export function getPlayerRightShoulder(playerPos: Vec3, playerSide: 0 | 1): Vec3 {
  const forward = playerSide === 0 ? 1 : -1
  return [playerPos[0] + forward * 0.04, playerPos[1] + SHOULDER_HEIGHT, playerPos[2] + forward * SHOULDER_HALF_WIDTH]
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtract3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar]
}

function length3(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2])
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
