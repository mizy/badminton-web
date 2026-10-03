/** Retargets the badminton skeleton to a glTF skin without changing its bind lengths. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import { findHumanoidBones, normalizeHumanoidModel } from './humanoidModel'
import { ANKLE_HEIGHT, type Limb, type PlayerSkeleton } from './playerSkeleton'
import { RACKET_IN_RIGHT_HAND } from './skeletalRacket'

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

/** @entry Captures the skin's rest axes once; returns its per-frame pose consumer. */
export function bindHumanoidModel(rig: PlayerSkeleton, model: THREE.Group, clips: THREE.AnimationClip[] = []): (player?: PlayerState, elapsed?: number) => void {
  const bones = findHumanoidBones(model)
  const required = ['hips', 'spine2', 'rightArm', 'rightForeArm', 'rightHand', 'leftArm', 'leftForeArm', 'leftHand',
    'rightUpLeg', 'rightLeg', 'rightFoot', 'leftUpLeg', 'leftLeg', 'leftFoot'] as const
  const missing = required.filter(key => !bones[key])
  if (missing.length) throw new Error(`缺少人形骨骼：${missing.join(', ')}`)
  normalizeHumanoidModel(model, 0)
  model.name = 'player-model'
  rig.group.add(model)
  model.updateWorldMatrix(true, true)
  // Some inverse-bind matrices are captured before our metre normalization.
  // Bind again only after the model has its gameplay parent, so later world
  // movement cancels cleanly in attached-skin space. glTF rest poses are stable.
  model.traverse(node => {
    if (node instanceof THREE.SkinnedMesh) node.bind(node.skeleton)
  })
  model.updateWorldMatrix(true, true)
  const hips = restJoint(bones.hips!, rig.group)
  const chest = restJoint(bones.spine2!, rig.group)
  const shoulder = chest.node.worldToLocal(bones.rightArm!.getWorldPosition(new THREE.Vector3()))
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
  const hand = bones.rightHand!
  const palm = hand.getObjectByName('RightHandMiddle1')?.position.clone().multiplyScalar(0.65) ?? new THREE.Vector3()
  const rightArm = limbs.find(limb => limb.source === rig.rightArm)!
  const leftArm = limbs.find(limb => limb.source === rig.leftArm)!
  const gripRotation = RACKET_IN_RIGHT_HAND.clone().invert()
  const index = hand.getObjectByName('RightHandIndex1')
  const pinky = hand.getObjectByName('RightHandPinky1')
  // The handle crosses the palm from little finger towards index/thumb. Aligning
  // it along the fingers produces a pinching wrist, even when positions match.
  if (index && pinky) {
    const shaft = index.getWorldPosition(new THREE.Vector3()).sub(pinky.getWorldPosition(new THREE.Vector3())).normalize()
    const normal = new THREE.Vector3(0, -1, 0)
    const x = new THREE.Vector3().crossVectors(shaft, normal).normalize()
    normal.crossVectors(x, shaft).normalize()
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, shaft, normal))
    rotation.premultiply(rig.group.getWorldQuaternion(new THREE.Quaternion()).invert())
    gripRotation.copy(rotation).invert()
  }
  const fingers: { node: THREE.Object3D; rotation: THREE.Quaternion; axis: THREE.Vector3; angle: number; thumb: boolean }[] = []
  hand.traverse(node => {
    const match = /RightHand(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(node.name)
    if (!match) return
    const thumb = match[1] === 'Thumb'
    const joint = Number(match[2]) - 1
    const angle = (thumb ? [0.95, 0.7, 0.55] : match[1] === 'Index' ? [0.45, 1.05, 0.65] : [0.8, 1.25, 0.8])[joint]
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.group.getWorldQuaternion(new THREE.Quaternion()))
    if (thumb && joint === 0 && node.children[0]) {
      const root = node.getWorldPosition(new THREE.Vector3())
      const direction = node.children[0].getWorldPosition(new THREE.Vector3()).sub(root)
      const towardsGrip = hand.localToWorld(palm.clone()).sub(root)
      axis.crossVectors(direction, towardsGrip).normalize()
    }
    axis.applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()).invert())
    fingers.push({ node, rotation: node.quaternion.clone(), axis, angle, thumb })
  })
  hand.add(racket)
  model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true } })
  const legs = limbs.filter(limb => limb.source === rig.rightLeg || limb.source === rig.leftLeg)
  const shoes = legs.map(limb => ({ object: limb.source.end.getObjectByName(limb.source === rig.rightLeg ? 'right-shoe' : 'left-shoe')!, limb }))
  for (const shoe of shoes) {
    const side = shoe.limb.source === rig.rightLeg ? 'right' : 'left'
    shoe.object.add(shoe.limb.source.end.getObjectByName(`${side}-sock`)!)
    shoe.limb.end.node.add(shoe.object)
  }
  const animateLegs = createLegAnimation(rig, clips, legs)
  return (player, elapsed) => {
    rig.group.updateWorldMatrix(true, true)
    const facing = rig.group.getWorldQuaternion(new THREE.Quaternion())
    hips.node.position.copy(hips.node.parent!.worldToLocal(rig.hips.getWorldPosition(new THREE.Vector3())))
    rotate(hips, rig.hips.getWorldQuaternion(new THREE.Quaternion()).multiply(hips.rotation))
    rotate(chest, rig.chest.getWorldQuaternion(new THREE.Quaternion()).multiply(chest.rotation))
    if (head) rotate(head, rig.head.getWorldQuaternion(new THREE.Quaternion()).multiply(head.rotation))
    // Shorter avatar legs need a lower pelvis to reach the same planted feet.
    // Preserve authored bone lengths instead of stretching the skin or floating.
    const drop = Math.max(0, ...legs.map(limb => {
      const root = limb.upper.node.getWorldPosition(new THREE.Vector3())
      const target = limb.source.end.getWorldPosition(new THREE.Vector3())
      const horizontal = (root.x - target.x) ** 2 + (root.z - target.z) ** 2
      const length = limb.lengths[0] + limb.lengths[1] - 1e-6
      return root.y - target.y - Math.sqrt(Math.max(0, length * length - horizontal))
    }))
    hips.node.position.y -= drop / hips.node.parent!.getWorldScale(new THREE.Vector3()).y
    hips.node.updateWorldMatrix(false, true)
    // Mixer samples feed this pose writer; IK alone owns the model bones.
    // Full mocap previews continue to use the same retargeting path.
    if (!animateLegs?.(player, elapsed)) legs.forEach(limb => retargetLimb(limb, facing))
    // The torso follows the calibrated shoulder after hip turns and foot planting.
    // Matching rotations alone leaves the skin's wrist short of the real impact.
    const chestPosition = chest.node.getWorldPosition(new THREE.Vector3())
      .add(rig.rightArm.root.getWorldPosition(new THREE.Vector3()))
      .sub(chest.node.localToWorld(shoulder.clone()))
    chest.node.position.copy(chest.node.parent!.worldToLocal(chestPosition.clone()))
    chest.node.updateWorldMatrix(false, true)
    const handRotation = rig.racket.getWorldQuaternion(new THREE.Quaternion())
      .multiply(gripRotation).multiply(rightArm.end.rotation)
    const wrist = rig.rightArm.end.getWorldPosition(new THREE.Vector3()).sub(palm.clone()
      .multiply(hand.getWorldScale(new THREE.Vector3())).applyQuaternion(handRotation))
    // A compact avatar reaches by advancing its shoulder, while the calibrated
    // hand/strings stay at the real contact and authored arm lengths stay fixed.
    const extension = wrist.clone().sub(rightArm.upper.node.getWorldPosition(new THREE.Vector3()))
    const distance = extension.length()
    const reach = rightArm.lengths[0] + rightArm.lengths[1] - 1e-6
    if (distance > reach) {
      chestPosition.addScaledVector(extension, (distance - reach) / distance)
      chest.node.position.copy(chest.node.parent!.worldToLocal(chestPosition.clone()))
      chest.node.updateWorldMatrix(false, true)
    }
    for (const { object, limb } of shoes) {
      object.position.set(0, 0, 0)
      object.scale.copy(rig.group.getWorldScale(new THREE.Vector3())).divide(limb.end.node.getWorldScale(new THREE.Vector3()))
      object.quaternion.copy(limb.end.node.getWorldQuaternion(new THREE.Quaternion()).invert())
        .multiply(limb.source.end.getWorldQuaternion(new THREE.Quaternion()))
    }
    retargetLimb(rightArm, facing, wrist)
    rotate(rightArm.end, handRotation)
    retargetLimb(leftArm, facing)
    const forearm = leftArm.end.node.getWorldPosition(new THREE.Vector3())
      .sub(leftArm.lower.node.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(facing.clone().invert())
    rotate(leftArm.end, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), forearm)
      .multiply(leftArm.end.rotation).premultiply(facing))
    for (const finger of fingers) {
      const angle = player?.grip === 'backhand' && finger.thumb ? finger.angle * 0.2 : finger.angle
      finger.node.quaternion.copy(finger.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(finger.axis, angle))
    }
    racket.position.copy(palm)
    // glTF bones may use centimetres; attached equipment stays in court metres.
    racket.scale.copy(rig.group.getWorldScale(new THREE.Vector3()))
      .divide(bones.rightHand!.getWorldScale(new THREE.Vector3()))
    racket.quaternion.copy(bones.rightHand!.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(rig.racket.getWorldQuaternion(new THREE.Quaternion()))
    model.updateWorldMatrix(false, true)
  }
}

/** Local to the model binding: in-place clips blend into six-point foot plants. */
function createLegAnimation(rig: PlayerSkeleton, clips: THREE.AnimationClip[], legs: ModelLimb[]): ((player?: PlayerState, elapsed?: number) => boolean) | undefined {
  const gaitClips = ['idle', 'walk', 'run'].map(name => clips.find(clip => clip.name === name))
  if (gaitClips.some(clip => !clip)) return undefined
  // Mixer caches unchanged tracks. Sample detached leg bones so IK cannot
  // corrupt its next sample, especially during pause and clip transitions.
  const pose = new THREE.Group()
  const samples = legs.map(limb => {
    const root = limb.upper.node.clone(true)
    pose.add(root)
    return [root, root.getObjectByName(limb.lower.node.name)!, root.getObjectByName(limb.end.node.name)!]
  })
  const mixer = new THREE.AnimationMixer(pose)
  const actions = gaitClips.map(clip => mixer.clipAction(new THREE.AnimationClip(clip!.name, clip!.duration,
    // No root translation, scale, hips, spine or arm tracks can displace the
    // simulation or overwrite the calibrated racket/contact chain.
    clip!.tracks.filter(track => /(?:Left|Right)(?:UpLeg|Leg|Foot)\.quaternion$/.test(track.name)))))
  let current: THREE.AnimationAction | undefined
  let lastTime = 0
  let weight = 0
  return (player, elapsed) => {
    if (!player || elapsed === undefined) {
      mixer.stopAllAction()
      current = undefined
      weight = 0
      lastTime = 0
      return false
    }
    const reset = elapsed < lastTime
    const dt = reset ? 0 : Math.min(0.05, Math.max(0, elapsed - lastTime))
    lastTime = elapsed
    if (reset) { mixer.stopAllAction(); current = undefined; weight = 0 }
    const { currentVel, gait, footwork, footworkPoint } = player.movement
    const speed = Math.hypot(currentVel.x, currentVel.z)
    const direction = new THREE.Vector3(currentVel.x, 0, currentVel.z)
      .applyQuaternion(rig.group.quaternion.clone().invert())
    const reverse = direction.z < -0.1 ? -1 : 1
    const next = actions[speed < 0.1 ? 0 : gait === 'sprint' ? 2 : 1]
    if (current !== next) {
      next.reset().setEffectiveWeight(1).play()
      if (reverse < 0) next.time = next.getClip().duration
      current?.crossFadeTo(next, 0.16, false)
      current = next
    }
    next.setEffectiveTimeScale(speed < 0.1 ? 1 : reverse * THREE.MathUtils.clamp(speed / (gait === 'sprint' ? 5 : 1.8), 0.5, 1.6))
    mixer.update(dt)
    const depth = footworkPoint?.split('-')[0]
    const lateral = speed > 0.1 ? Math.abs(direction.x) / speed : 0
    const special = (depth === 'front' && direction.z > 0.1) || (depth === 'mid' && lateral > 0.45)
      || (depth === 'back' && lateral > 0.3) || footwork === 'lunge'
      || footwork === 'start' || footwork === 'recover'
      || player.body.phase !== 'grounded' || player.swing.phase !== 'ready'
    weight = THREE.MathUtils.lerp(weight, special ? 0 : 1, 1 - Math.exp(-dt * 22))
    // A new contact must be exact on its first frame, including while moving.
    if (player.contactPose && player.swing.phase !== 'ready') weight = 0
    const yaw = speed > 0.1 ? Math.atan2(direction.x * reverse, direction.z * reverse) - rig.hips.rotation.y : 0
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    const facing = rig.group.getWorldQuaternion(new THREE.Quaternion())
    for (const [index, limb] of legs.entries()) {
      const joints = [limb.upper, limb.lower, limb.end]
      const animated = samples[index].map(joint => joint.quaternion.clone())
      animated[0].premultiply(turn)
      retargetLimb(limb, facing)
      joints.forEach((joint, i) => joint.node.quaternion.slerp(animated[i], weight))
      limb.upper.node.updateWorldMatrix(false, true)
    }
    if (weight > 0 && player.body.phase === 'grounded') {
      // Plant the lowest ankle after blending; upper-body IK runs afterwards.
      const lowest = Math.min(...legs.map(limb => limb.end.node.getWorldPosition(new THREE.Vector3()).y))
      const hips = legs[0].upper.node.parent!
      const scale = hips.parent!.getWorldScale(new THREE.Vector3()).y
      hips.position.y += (player.pos[1] + ANKLE_HEIGHT - lowest) / scale
      hips.updateWorldMatrix(false, true)
    }
    return true
  }
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

function retargetLimb(limb: ModelLimb, facing: THREE.Quaternion, target = limb.source.end.getWorldPosition(new THREE.Vector3())): void {
  const root = limb.upper.node.getWorldPosition(new THREE.Vector3())
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
