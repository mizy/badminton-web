/** Badminton motion on a skin-independent skeleton; local forward is +Z. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import {
  SHOULDER_HEIGHT,
  SHOULDER_HALF_WIDTH,
  createReachableRacketPose,
  getPlayerRightShoulder,
  type RacketContactPose,
  type Vec3,
} from '../character/racketKinematics'
import { idealContactPoint, getTechniqueRacketFaceDeg } from '../character/contact'
import { CONTACT_WINDOW_SECONDS, RACKETS } from '../character/stroke'
import { poseLimb, limbEnd, ANKLE_HEIGHT, type PlayerSkeleton } from './playerSkeleton'
import { createFootwork, updateFootwork, type FootworkMotion } from './playerFootwork'

const UP = new THREE.Vector3(0, 1, 0)
const RIGHT_SHOULDER = new THREE.Vector3(-SHOULDER_HALF_WIDTH, SHOULDER_HEIGHT, 0.04)
const SWING_DURATION = 0.16
const SIDE_ON_YAW = 0.18

interface ArmPose {
  grip: THREE.Vector3
  rotation: THREE.Quaternion
}

export interface PlayerMotion extends PlayerSkeleton {
  contact: { source: RacketContactPose; pose: ArmPose; elapsed: number } | null
  lastTime: number
  stride: number
  pace: number
  feet: FootworkMotion
  phase: PlayerState['swing']['phase']
  release: ArmPose | null
}

const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

/** @entry Owns transient animation history for a model-independent skeleton. */
export function createPlayerMotion(skeleton: PlayerSkeleton): PlayerMotion {
  const rig: PlayerMotion = { ...skeleton, contact: null, lastTime: 0, stride: 0, pace: 0,
    feet: createFootwork(), phase: 'ready', release: null }
  applyArmPose(rig, readyPose())
  poseLimb(rig.leftArm, new THREE.Vector3(0.26, 1.23, 0.24), new THREE.Vector3(1, -0.5, -0.25))
  poseLimb(rig.rightLeg, new THREE.Vector3(-0.14, ANKLE_HEIGHT - 0.94, 0), new THREE.Vector3(0, 0, 1))
  poseLimb(rig.leftLeg, new THREE.Vector3(0.14, ANKLE_HEIGHT - 0.94, 0), new THREE.Vector3(0, 0, 1))
  return rig
}

function racketRotation(shaft: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const y = shaft.clone().normalize()
  const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize()
  if (z.lengthSq() < 1e-8) z.crossVectors(y, Math.abs(y.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  z.crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function armPose(grip: Vec3, shaft: Vec3): ArmPose {
  return { grip: new THREE.Vector3(...grip), rotation: racketRotation(new THREE.Vector3(...shaft), new THREE.Vector3(0, 0, 1)) }
}

function readyPose(): ArmPose {
  return armPose([-0.29, 1.18, 0.28], [0.08, 0.94, 0.33])
}

function strokePoses(shot: ShotType, backhand = false): { preparation: ArmPose; follow: ArmPose } {
  if (backhand) {
    if (shot === 'LIFT' || shot === 'NET_DROP') {
      return { preparation: armPose([0.18, 1.02, 0.16], [0.60, -0.65, 0.46]), follow: armPose([0.15, 1.30, 0.43], [0.28, 0.80, 0.53]) }
    }
    if (shot === 'DRIVE') {
      return { preparation: armPose([0.12, 1.28, 0.18], [0.80, 0.32, -0.50]), follow: armPose([0.16, 1.22, 0.45], [0.32, 0.12, 0.94]) }
    }
    // High backhand: racket folds across the opposite shoulder, elbow leads,
    // then the forearm extends above the backhand side rather than behind the head.
    return { preparation: armPose([0.13, 1.50, 0.10], [0.66, 0.52, -0.54]), follow: armPose([0.20, 1.32, 0.42], [0.55, -0.25, 0.80]) }
  }
  if (shot === 'LIFT' || shot === 'NET_DROP') {
    return { preparation: armPose([-0.35, 1.01, 0.12], [0.12, -0.82, 0.56]), follow: armPose([-0.28, 1.34, 0.40], [0.05, 0.84, 0.54]) }
  }
  if (shot === 'DRIVE') {
    return { preparation: armPose([-0.43, 1.24, 0.12], [-0.3, 0.8, 0.45]), follow: armPose([-0.04, 1.13, 0.42], [0.35, 0.15, 0.92]) }
  }
  return { preparation: armPose([-0.36, 1.65, -0.12], [-0.32, 0.6, -0.73]), follow: armPose([0.10, 1.06, 0.29], [0.32, -0.82, 0.47]) }
}

function blendPose(from: ArmPose, to: ArmPose, progress: number): ArmPose {
  const t = smooth(progress)
  return { grip: from.grip.clone().lerp(to.grip, t), rotation: from.rotation.clone().slerp(to.rotation, t) }
}

function localContactPose(parent: THREE.Object3D, pose: RacketContactPose): ArmPose {
  const grip = parent.worldToLocal(new THREE.Vector3(...pose.gripPoint))
  const center = parent.worldToLocal(new THREE.Vector3(...pose.stringCenter))
  const inverse = parent.getWorldQuaternion(new THREE.Quaternion()).invert()
  const normal = new THREE.Vector3(...pose.faceNormal).applyQuaternion(inverse)
  return { grip, rotation: racketRotation(center.sub(grip), normal) }
}

function applyArmPose(rig: PlayerMotion, pose: ArmPose, backhand = false): void {
  const elbow = backhand ? new THREE.Vector3(0.35, -0.55, 0.85)
    : new THREE.Vector3(-1, pose.grip.y > 1.5 ? 0.3 : -0.6, -0.35)
  poseLimb(rig.rightArm, pose.grip, elbow)
  // The racket is a wrist child: hand, grip and string bed turn together.
  rig.rightArm.end.quaternion.copy(rig.rightArm.root.quaternion).multiply(rig.rightArm.joint.quaternion).invert().multiply(pose.rotation)
  rig.racket.quaternion.identity()
}

function bodyCrouch(player: PlayerState, speed: number): number {
  if (player.body.phase === 'loading') return 0.12 * smooth(player.body.elapsed / (player.body.action === 'scissor' ? 0.075 : 0.1))
  if (player.body.phase === 'landing') return 0.12 * (1 - smooth(player.body.elapsed / (player.body.action === 'scissor' ? 0.18 : 0.24)))
  if (player.body.phase === 'airborne') return 0
  const base = Math.min(speed / 5, 1) * 0.12 + (player.movement.footwork === 'start' ? 0.035 : 0)
  const depth = player.movement.footworkPoint?.split('-')[0]
  // 前场跨步把重心压得更低；中场并步和后场交叉步只是轻微降重心，避免像蹲跑。
  const posture = player.movement.footwork === 'lunge' && speed < 2.8 ? 0.28 : depth === 'front' ? 0.10 : depth === 'back' ? 0.07 : depth === 'mid' ? 0.05 : 0
  return Math.max(base, posture)
}

/** 非持拍辅助手：准备时抬在胸前，前场上网向后展开配平，后场 / 击球时上举指向来球。 */
function leftArmTarget(player: PlayerState, cycle: number, speed: number): THREE.Vector3 {
  if (player.body.phase === 'airborne') return new THREE.Vector3(0.40, 1.54, 0.08)
  const depth = player.movement.footworkPoint?.split('-')[0]
  if (depth === 'front') return new THREE.Vector3(0.40, 1.22, -0.48)
  if (player.grip === 'backhand' && (player.swing.phase === 'preparing' || player.swing.phase === 'queued' || depth === 'back')) {
    return new THREE.Vector3(0.38, 1.20, -0.14)
  }
  if (player.swing.phase === 'preparing' || player.swing.phase === 'queued' || depth === 'back') return new THREE.Vector3(0.28, 1.66, 0.30)
  if (player.swing.phase === 'swinging' || player.swing.phase === 'recovery') return new THREE.Vector3(0.34, 1.13, 0.20)
  const sway = Math.sin(cycle) * Math.min(speed / 5, 1) * 0.12
  return new THREE.Vector3(0.26, 1.23, 0.24 + sway)
}

/** @entry GameState drives continuous footwork and the finite swing/contact cycle. */
export function updatePlayerMotion(rig: PlayerMotion, player: PlayerState, elapsed: number): void {
  const group = rig.group
  if (elapsed < rig.lastTime) {
    rig.feet.initialized = false
    rig.stride = 0
    rig.pace = 0
    rig.contact = null
    rig.release = null
    rig.phase = 'ready'
  }
  const dt = Math.max(0, elapsed - rig.lastTime)
  rig.lastTime = elapsed
  group.position.set(...player.pos)
  group.rotation.y = player.side === 0 ? Math.PI / 2 : -Math.PI / 2
  const timing = RACKETS[player.loadout]
  const active = player.swing.phase === 'swinging' || player.swing.phase === 'recovery'
  if (!active || !player.contactPose) rig.contact = null
  const newContact = active && player.contactPose !== null && rig.contact?.source !== player.contactPose
    && player.swing.elapsed <= CONTACT_WINDOW_SECONDS
  const contactAge = rig.contact ? Math.max(0, player.swing.elapsed - rig.contact.elapsed) : Infinity
  const speed = Math.hypot(player.movement.currentVel.x, player.movement.currentVel.z)
  const blend = dt > 0 && dt < 0.1 ? 1 - Math.exp(-dt * 18) : 1
  rig.pace = THREE.MathUtils.lerp(rig.pace, Math.min(speed / 5, 1), blend)
  rig.stride += Math.min(dt, 0.05) * speed / (0.3 + speed * 0.09) * Math.PI
  const crouch = newContact ? 0 : THREE.MathUtils.lerp(-rig.body.position.y,
    bodyCrouch(player, speed) * smooth(contactAge / 0.12), blend)
  let turn = 0
  if (player.body.action === 'scissor') {
    if (player.body.phase === 'loading') turn = -0.5 * smooth(player.body.elapsed / 0.075)
    if (player.body.phase === 'airborne') turn = -0.5 + smooth(player.body.elapsed / 0.43)
    if (player.body.phase === 'landing') turn = 0.5 * (1 - smooth(player.body.elapsed / 0.18))
  }
  const depth = player.movement.footworkPoint?.split('-')[0]
  const phase = player.swing.phase
  const pointSide = player.movement.footworkPoint?.endsWith('right') ? -1
    : player.movement.footworkPoint?.endsWith('left') ? 1 : 0
  const gripSide = player.grip === 'backhand' ? 1 : -1
  const postureSide = pointSide || gripSide
  // 六点步点先决定侧身方向，后场交叉步比中场并步转得更多；引拍继续沿正/反手侧加深。
  const windup = phase === 'queued' ? 1 : phase === 'preparing' ? smooth(player.swing.elapsed / timing.preparation)
    : phase === 'swinging' ? 1 - smooth(player.swing.elapsed / SWING_DURATION) : 0
  const shot = phase === 'ready' ? player.selectedShot : player.swing.shot
  const overhead = shot === 'CLEAR' || shot === 'DROP' || shot === 'SMASH'
  const footworkYaw = depth === 'back' ? 0.95 : depth === 'front' ? 0.48 : depth === 'mid' ? 0.28 : SIDE_ON_YAW
  const stanceYaw = postureSide * Math.min(1.18, footworkYaw + windup * (overhead && depth !== 'front' ? 0.9 : 0.25))
  // 尚未分类到步点的启动帧，先按横向输入轻转；明确步点后由上面的稳定角度接管。
  const targetLength = Math.hypot(player.movement.targetDir.x, player.movement.targetDir.z)
  const anatomicalLateral = targetLength > 0.01
    ? player.movement.targetDir.z / targetLength * (player.side === 0 ? 1 : -1)
    : 0
  const movementYaw = pointSide === 0 ? -anatomicalLateral * 0.1 : 0
  const hipYaw = THREE.MathUtils.clamp(turn + stanceYaw + movementYaw, -1.25, 1.25)
  // 髋先转、肩后转：引拍逐帧加大分离，出拍时髋先回正、肩带再释放。
  // 各阶段首尾取值相接（0.08 → 0.32 → -0.22 → 0.08），球拍不会在阶段切换时瞬跳。
  const recoveryDuration = Math.max(SWING_DURATION + 1e-6, timing.recovery)
  let separationAngle = 0.08
  if (phase === 'queued') separationAngle = 0.32
  else if (phase === 'preparing') separationAngle = 0.08 + 0.24 * THREE.MathUtils.clamp(player.swing.elapsed / timing.preparation, 0, 1)
  else if (phase === 'swinging') separationAngle = 0.32 - 0.54 * THREE.MathUtils.clamp(player.swing.elapsed / SWING_DURATION, 0, 1)
  else if (phase === 'recovery') separationAngle = -0.22 + 0.30 * THREE.MathUtils.clamp((player.swing.elapsed - SWING_DURATION) / (recoveryDuration - SWING_DURATION), 0, 1)
  const shoulderSeparation = turn * 0.35 + postureSide * separationAngle
  rig.body.rotation.y = 0
  rig.hips.rotation.y = THREE.MathUtils.lerp(rig.hips.rotation.y, hipYaw, blend)
  rig.hips.position.y = 0.94 - (player.body.phase === 'airborne' ? 0 : 0.055) + Math.sin(rig.stride * 2) * rig.pace * 0.014
  // 肩带角度 = 髋的实际朝向 + 肩髋分离角。
  const chestYaw = THREE.MathUtils.clamp(hipYaw + shoulderSeparation, -1.48, 1.48)
  rig.chest.rotation.y = THREE.MathUtils.lerp(rig.chest.rotation.y, chestYaw, blend)
  rig.head.rotation.y = -rig.chest.rotation.y * 0.75
  const visualPos: Vec3 = [player.pos[0], player.pos[1] - crouch, player.pos[2]]
  // group 已经承担世界位置与朝网旋转；body 只是局部锚点，重复塞入世界坐标会二次变换。
  rig.body.position.set(0, visualPos[1] - player.pos[1], 0)
  group.updateWorldMatrix(true, true)
  // 上身可以相对髋转，但持拍肩必须仍锚在物理肩点，保证拍面接触几何不漂移。
  const desiredShoulder = new THREE.Vector3(...getPlayerRightShoulder(visualPos, player.side))
  const shoulderLocal = rig.body.worldToLocal(desiredShoulder.clone())
  const shoulderOffset = RIGHT_SHOULDER.clone().applyQuaternion(rig.chest.quaternion)
  rig.chest.position.copy(shoulderLocal).sub(shoulderOffset)
  group.updateWorldMatrix(true, true)
  updateFootwork(rig, rig.feet, player, dt)
  const offHand = limbEnd(rig.leftArm)
  offHand.lerp(leftArmTarget(player, rig.stride, speed), blend)
  poseLimb(rig.leftArm, offHand, new THREE.Vector3(1, -0.5, -0.25))

  poseSwing(rig, player, visualPos, newContact)
}

function poseSwing(rig: PlayerMotion, player: PlayerState, visualPos: Vec3, newContact: boolean): void {
  const timing = RACKETS[player.loadout]
  const phase = player.swing.phase
  const active = phase === 'swinging' || phase === 'recovery'
  const ready = readyPose()
  const shot = player.swing.phase === 'ready' ? player.selectedShot : player.swing.shot
  const backhand = player.grip === 'backhand'
  const { preparation, follow } = strokePoses(shot, backhand)
  if (rig.phase !== phase && phase === 'swinging') {
    // 短按也从上一帧实际引拍位置出发，避免松手瞬间跳到完整背弓姿态。
    rig.release = {
      grip: limbEnd(rig.rightArm),
      rotation: rig.rightArm.root.quaternion.clone().multiply(rig.rightArm.joint.quaternion).multiply(rig.rightArm.end.quaternion),
    }
  }
  if (phase === 'ready') rig.release = null
  rig.phase = phase
  if (newContact) {
    rig.contact = { source: player.contactPose!, pose: localContactPose(rig.chest, player.contactPose!), elapsed: player.swing.elapsed }
  }
  let pose = ready
  if (rig.contact && active) {
    const age = Math.max(0, player.swing.elapsed - rig.contact.elapsed)
    const duration = Math.max(0.12, timing.recovery - rig.contact.elapsed)
    const followDuration = Math.min(0.12, duration * 0.45)
    pose = age < followDuration ? blendPose(rig.contact.pose, follow, age / followDuration)
      : blendPose(follow, ready, (age - followDuration) / (duration - followDuration))
  } else if (player.swing.phase === 'preparing' || player.swing.phase === 'queued') {
    // 按住蓄力：在引拍位保持，不随按住时长继续位移。
    pose = blendPose(ready, preparation, player.swing.phase === 'queued' ? 1 : THREE.MathUtils.clamp(player.swing.elapsed / timing.preparation, 0, 1))
  } else if (player.swing.phase === 'swinging') {
    const desiredContact = idealContactPoint(visualPos, player.side, shot)
    if (backhand) desiredContact[2] -= (player.side === 0 ? 1 : -1) * 0.40
    const shared = createReachableRacketPose({
      desiredContact,
      playerPos: visualPos, playerSide: player.side, racketFaceDeg: getTechniqueRacketFaceDeg(shot),
    })
    const strike = localContactPose(rig.chest, shared)
    const t = THREE.MathUtils.clamp(player.swing.elapsed / SWING_DURATION, 0, 1)
    pose = t < 0.45 ? blendPose(rig.release ?? preparation, strike, t / 0.45) : blendPose(strike, follow, (t - 0.45) / 0.55)
  } else if (player.swing.phase === 'recovery') {
    const start = SWING_DURATION
    pose = blendPose(follow, ready, (player.swing.elapsed - start) / (timing.recovery - start))
  }
  applyArmPose(rig, pose, backhand)
}

/** Legacy stories animate the same wrist/arm rig; no detached decorative racket. */
export function updateRacketMotion(rig: PlayerMotion, swing01: number): void {
  const t = THREE.MathUtils.clamp(swing01, 0, 1)
  const ready = readyPose()
  const { preparation, follow } = strokePoses('CLEAR')
  const pose = t < 0.3 ? blendPose(ready, preparation, t / 0.3)
    : t < 0.65 ? blendPose(preparation, follow, (t - 0.3) / 0.35)
      : blendPose(follow, ready, (t - 0.65) / 0.35)
  applyArmPose(rig, pose)
}
