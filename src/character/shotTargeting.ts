/** 基于现有羽球空气阻力积分的落点反解。 */

import {
  DEFAULT_SHUTTLECOCK,
  stepShuttlecock,
  type ShuttlecockConfig,
  type ShuttlecockState,
} from '../physics/shuttlecock'
import {
  placeShuttleForCorkCenter,
  type Vec3,
} from './racketKinematics'

export interface TargetedShotInput {
  corkCenter: Vec3
  elevationDeg: number
  maxSpeed: number
  spin: Vec3
  target: Vec3
}

export interface TargetedShotSolution {
  converged: boolean
  launchPoint: Vec3
  landingPoint: Vec3
  netClearance: number | null
  outgoingVel: Vec3
  speed: number
  targetError: number
}

interface FlightSample {
  landingPoint: Vec3
  netHeight: number | null
}

const FIXED_STEP = 1 / 120
const MAX_FLIGHT_STEPS = 1_200
const NET_HEIGHT = 1.524

/** @entry 在固定拍面仰角下反解所需初速，并用两次瞄准修正抵消 Magnus 横漂。 */
export function solveTargetedShot(
  input: TargetedShotInput,
  config: ShuttlecockConfig = DEFAULT_SHUTTLECOCK,
): TargetedShotSolution {
  let aimTarget: Vec3 = [...input.target]
  let solved = solveSpeed(input, aimTarget, config)

  for (let correction = 0; correction < 2; correction += 1) {
    const errorX = input.target[0] - solved.flight.landingPoint[0]
    const errorZ = input.target[2] - solved.flight.landingPoint[2]
    aimTarget = [aimTarget[0] + errorX * 0.86, 0, aimTarget[2] + errorZ * 0.86]
    solved = solveSpeed(input, aimTarget, config)
  }

  const landingPoint = solved.flight.landingPoint
  const targetError = Math.hypot(
    landingPoint[0] - input.target[0],
    landingPoint[2] - input.target[2],
  )
  return {
    converged: solved.hasRange && targetError <= 0.22,
    launchPoint: solved.launchPoint,
    landingPoint,
    netClearance: solved.flight.netHeight === null ? null : solved.flight.netHeight - NET_HEIGHT,
    outgoingVel: solved.velocity,
    speed: solved.speed,
    targetError,
  }
}

function solveSpeed(
  input: TargetedShotInput,
  aimTarget: Vec3,
  config: ShuttlecockConfig,
): {
  flight: FlightSample
  hasRange: boolean
  launchPoint: Vec3
  speed: number
  velocity: Vec3
} {
  const dx = aimTarget[0] - input.corkCenter[0]
  const dz = aimTarget[2] - input.corkCenter[2]
  const desiredRange = Math.max(Math.hypot(dx, dz), 0.01)
  const directionX = dx / desiredRange
  const directionZ = dz / desiredRange
  const elevation = input.elevationDeg * Math.PI / 180
  const cosElevation = Math.cos(elevation)
  const unitVelocity: Vec3 = [
    directionX * cosElevation,
    Math.sin(elevation),
    directionZ * cosElevation,
  ]
  const launchPoint = placeShuttleForCorkCenter(input.corkCenter, unitVelocity)
  const maxSpeed = Math.max(2.5, input.maxSpeed)
  let low = 1.2
  let high = maxSpeed
  let highFlight = simulateFlight(launchPoint, scale3(unitVelocity, high), input.spin, config)
  const highProgress = horizontalProgress(input.corkCenter, highFlight.landingPoint, directionX, directionZ)
  const hasRange = highProgress >= desiredRange

  if (hasRange) {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const speed = (low + high) / 2
      const flight = simulateFlight(launchPoint, scale3(unitVelocity, speed), input.spin, config)
      const progress = horizontalProgress(input.corkCenter, flight.landingPoint, directionX, directionZ)
      if (progress < desiredRange) low = speed
      else {
        high = speed
        highFlight = flight
      }
    }
  }

  const speed = hasRange ? high : maxSpeed
  const velocity = scale3(unitVelocity, speed)
  const flight = hasRange ? highFlight : simulateFlight(launchPoint, velocity, input.spin, config)
  return { flight, hasRange, launchPoint, speed, velocity }
}

function simulateFlight(
  launchPoint: Vec3,
  velocity: Vec3,
  spin: Vec3,
  config: ShuttlecockConfig,
): FlightSample {
  let state: ShuttlecockState = {
    pos: [...launchPoint],
    spin: [...spin],
    vel: [...velocity],
  }
  let previous = state
  let netHeight: number | null = null

  for (let step = 0; step < MAX_FLIGHT_STEPS && state.pos[1] > 0; step += 1) {
    previous = state
    state = stepShuttlecock(state, FIXED_STEP, config, 4)
    if (netHeight === null && crossedNet(previous.pos[0], state.pos[0])) {
      const alpha = -previous.pos[0] / (state.pos[0] - previous.pos[0])
      netHeight = previous.pos[1] + (state.pos[1] - previous.pos[1]) * alpha
    }
  }

  return {
    landingPoint: [state.pos[0], 0, state.pos[2]],
    netHeight,
  }
}

function crossedNet(previousX: number, currentX: number): boolean {
  return (previousX < 0 && currentX >= 0) || (previousX > 0 && currentX <= 0)
}

function horizontalProgress(origin: Vec3, landing: Vec3, directionX: number, directionZ: number): number {
  return (landing[0] - origin[0]) * directionX + (landing[2] - origin[2]) * directionZ
}

function scale3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar]
}
