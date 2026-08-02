/** 角色系统 — 统一入口 */

export type {
  PlayerState,
  MovementState,
  Gait,
  TimingWindow,
} from './types'

export { updateMovement } from './movement'
export type { MovementConfig } from './movement'

export {
  getAvailableShots,
  synthesizeShot,
} from './shotSynthesis'
export type {
  ShotType,
  ShotIntent,
  ShotResult,
  AvailableShot,
} from './shotSynthesis'

export { computeTimingWindow } from './timing'
export type { TimingConfig } from './timing'

export { evaluateContact, getTechniqueRacketFaceDeg, idealContactPoint } from './contact'
export type {
  ContactInput,
  ContactOutcome,
  ContactResult,
  ContactTechnique,
  ContactTiming,
} from './contact'

export {
  MAX_CONTACT_ERROR,
  RACKET_STRING_CENTER_DISTANCE,
  SHUTTLE_CORK_RADIUS,
  createMeasuredRacketPose,
  createReachableRacketPose,
  getShuttleCorkGroundClearance,
  getShuttleCorkCenter,
  hasShuttleCorkLanded,
  placeLandedShuttle,
  placeShuttleForCorkCenter,
} from './racketKinematics'
export type { RacketContactPose, ReachableRacketPoseInput, Vec3 } from './racketKinematics'

export { solveTargetedShot } from './shotTargeting'
export type { TargetedShotInput, TargetedShotSolution } from './shotTargeting'

export {
  ACTION_LABELS,
  BADMINTON_ACTIONS,
  canBadmintonActionContact,
  getBadmintonActionContactCycle,
  getBadmintonActionContactTime,
  sampleBadmintonMotion,
  sampleBadmintonShuttle,
} from './badmintonKinematics'
export type {
  BadmintonAction,
  BadmintonMotionPhase,
  BadmintonMotionSample,
  BadmintonShuttleSample,
} from './badmintonKinematics'
