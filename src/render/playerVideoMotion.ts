/** Video clips own visual playback only; GameState still owns travel and contact. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import { findHumanoidBones } from './humanoidModel'
import { ANKLE_HEIGHT } from './playerSkeleton'

type VideoMotion = 'ready-start' | 'cross-approach' | 'front-forehand' | 'front-backhand'
  | 'rear-forehand' | 'rear-backhand' | 'forehand-recover' | 'backhand-recover'
const MOTIONS: VideoMotion[] = ['ready-start', 'cross-approach', 'front-forehand', 'front-backhand',
  'rear-forehand', 'rear-backhand', 'forehand-recover', 'backhand-recover']

/** Current movement selects a clip; the previous approach supplies recovery side. */
export function selectVideoMotion(player: PlayerState, previous: VideoMotion | null): VideoMotion | null {
  const { currentVel, footwork, footworkPoint } = player.movement
  const speed = Math.hypot(currentVel.x, currentVel.z)
  const backhand = footworkPoint?.endsWith('left') ?? player.grip === 'backhand'
  const recovery = previous?.includes('backhand') ? 'backhand-recover'
    : previous?.includes('forehand') ? 'forehand-recover' : backhand ? 'backhand-recover' : 'forehand-recover'
  const forward = currentVel.x * (player.side === 0 ? 1 : -1)
  const returning = footworkPoint?.startsWith('front') && forward < -0.1
    || footworkPoint?.startsWith('back') && forward > 0.1
  if (footwork === 'recover' || returning) return recovery
  if (speed < 0.1 && footwork !== 'lunge') return null
  if (footwork === 'start') return 'ready-start'
  if (footworkPoint?.startsWith('back')) return backhand ? 'rear-backhand' : 'rear-forehand'
  if (footworkPoint?.startsWith('front') && footwork !== 'cross') return backhand ? 'front-backhand' : 'front-forehand'
  return 'cross-approach'
}

/** @entry One mixer per skin; the model binding calls this before contact IK. */
export function createVideoAnimation(rig: THREE.Group, model: THREE.Group, clips: THREE.AnimationClip[]):
  ((player: PlayerState, elapsed: number) => PlayerState['grip'] | undefined) | undefined {
  const sources = MOTIONS.map(name => clips.find(clip => clip.name === name))
  if (sources.some(clip => !clip)) return undefined
  // Normalize each root before mixing. Removing the new clip's heading after
  // a crossfade would also rotate the old pose and cause an instant foot jump.
  const selectedClips = sources.map(source => {
    const clip = source!.clone()
    const track = clip.tracks.find(track => track.name === 'Hips.quaternion')!
    const inverse = new THREE.Quaternion().fromArray(track.values).invert()
    for (let i = 0; i < track.values.length; i += 4) {
      new THREE.Quaternion().fromArray(track.values, i).premultiply(inverse).toArray(track.values, i)
    }
    // The source selections are not authored loops. Close the last few samples
    // onto the opening pose before repeating them in continuous locomotion.
    for (const track of clip.tracks) {
      const size = track.getValueSize()
      for (let i = 0; i < track.times.length; i++) {
        const blend = THREE.MathUtils.clamp((track.times[i] - clip.duration + 0.16) / 0.16, 0, 1)
        if (track.name.endsWith('.quaternion')) {
          new THREE.Quaternion().fromArray(track.values, i * size)
            .slerp(new THREE.Quaternion().fromArray(track.values), blend).toArray(track.values, i * size)
        } else {
          for (let j = 0; j < size; j++) track.values[i * size + j] = THREE.MathUtils.lerp(track.values[i * size + j], track.values[j], blend)
        }
      }
    }
    return clip
  })
  const bones = findHumanoidBones(model)
  const hips = bones.hips!
  const pose = new THREE.Group()
  pose.add(hips.clone(true))
  const samples: { node: THREE.Object3D; sample: THREE.Object3D; leg: boolean }[] = []
  hips.traverse(node => {
    if (node instanceof THREE.Bone && /^(Hips|Spine[12]?|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase))$/.test(node.name)) {
      samples.push({ node, sample: pose.getObjectByName(node.name)!, leg: /(?:UpLeg|Leg|Foot|ToeBase)$/.test(node.name) })
    }
  })
  const mixer = new THREE.AnimationMixer(pose)
  const actions = selectedClips.map(clip => mixer.clipAction(clip!))
  const rests = hips.getWorldQuaternion(new THREE.Quaternion()).premultiply(rig.getWorldQuaternion(new THREE.Quaternion()).invert())
  const legs = (['right', 'left'] as const).map(side => {
    const upper = bones[`${side}UpLeg`]!, knee = bones[`${side}Leg`]!, foot = bones[`${side}Foot`]!
    return { upper, knee, foot, a: upper.getWorldPosition(new THREE.Vector3()).distanceTo(knee.getWorldPosition(new THREE.Vector3())), b: knee.getWorldPosition(new THREE.Vector3()).distanceTo(foot.getWorldPosition(new THREE.Vector3())),
      plant: new THREE.Vector3(), from: new THREE.Vector3(), visible: new THREE.Vector3(), initialized: false, grounded: false, step: -1 }
  })
  let current: THREE.AnimationAction | undefined
  let approach: VideoMotion | null = null
  let lastTime = 0
  let weight = 0
  return (player, elapsed) => {
    const reset = elapsed < lastTime || elapsed - lastTime > 0.25
    const dt = reset ? 0 : Math.min(0.05, Math.max(0, elapsed - lastTime))
    lastTime = elapsed
    if (reset) { mixer.stopAllAction(); current = undefined; weight = 0; approach = null; legs.forEach(leg => { leg.grounded = false; leg.step = -1; leg.initialized = false }) }
    const id = selectVideoMotion(player, approach)
    if (id && !id.endsWith('recover') && id !== 'ready-start') approach = id
    const next = id ? actions[MOTIONS.indexOf(id)] : undefined
    if (next && current !== next) {
      next.reset().setEffectiveWeight(1).play()
      current?.crossFadeTo(next, 0.24, false)
      current = next
    }
    const speed = Math.hypot(player.movement.currentVel.x, player.movement.currentVel.z)
    current?.setEffectiveTimeScale(id === 'ready-start' ? 3 : THREE.MathUtils.clamp(speed / 3, 0.8, 1.8))
    mixer.update(dt)
    const enabled = !!id && player.body.phase === 'grounded'
    weight = THREE.MathUtils.lerp(weight, enabled ? 1 : 0, 1 - Math.exp(-dt * 18))
    if (player.body.phase !== 'grounded') weight = 0
    if (weight < 0.001 || !current) { legs.forEach(leg => { leg.grounded = false; leg.step = -1; leg.initialized = false }); return undefined }
    for (const leg of legs) {
      if (!leg.initialized) { leg.visible.copy(leg.foot.getWorldPosition(new THREE.Vector3())); leg.initialized = true }
    }
    const freeArm = player.swing.phase === 'ready'
    const sampleHip = pose.getObjectByName(hips.name)!
    if (freeArm) {
      const rotation = rig.getWorldQuaternion(new THREE.Quaternion()).multiply(rests)
        .multiply(sampleHip.quaternion)
      rotation.premultiply(hips.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
      hips.quaternion.slerp(rotation, weight)
    }
    for (const { node, sample, leg } of samples) {
      if (node !== hips && (leg || freeArm)) node.quaternion.slerp(sample.quaternion, weight)
      if (freeArm && /^Spine/.test(node.name)) node.position.copy(sample.position)
    }
    // Clip root travel is unmeasured. Only its vertical pose enters the skin;
    // the gameplay group remains at the authoritative player position.
    if (freeArm) hips.position.y = THREE.MathUtils.lerp(hips.position.y, sampleHip.position.y, weight)
    model.updateWorldMatrix(true, true)
    const floor = player.pos[1] + ANKLE_HEIGHT
    const lowest = Math.min(...legs.map(leg => leg.foot.getWorldPosition(new THREE.Vector3()).y))
    hips.position.y += (floor - lowest) / hips.parent!.getWorldScale(new THREE.Vector3()).y
    model.updateWorldMatrix(true, true)
    for (const leg of legs) {
      const target = leg.foot.getWorldPosition(new THREE.Vector3())
      const root = leg.upper.getWorldPosition(new THREE.Vector3())
      const low = target.y - floor < 0.025
      const reachable = speed < 0.1 || Math.hypot(root.x - leg.plant.x, root.z - leg.plant.z) < 0.45
      if (leg.grounded && (!low || !reachable || !enabled) && leg.step < 0) {
        leg.from.copy(leg.plant)
        leg.step = 0
      }
      if (leg.step >= 0) {
        leg.step += dt
        const t = Math.min(1, leg.step / 0.14)
        leg.plant.lerpVectors(leg.from, target, t * t * (3 - 2 * t))
        leg.plant.y += Math.sin(Math.PI * t) * 0.08
        leg.grounded = false
        if (t === 1) { leg.step = -1; leg.grounded = low }
      } else if (!leg.grounded) {
        leg.plant.copy(target)
        leg.grounded = low
      }
      if (leg.grounded) leg.plant.y = floor
      // Different recordings can disagree at a transition. Bound the visible
      // correction in world metres; never teleport an airborne foot to its target.
      const correction = leg.plant.clone().sub(leg.visible)
      leg.visible.add(correction.clampLength(0, dt * 10))
    }
    // Yield the pelvis to reachable support contacts instead of stretching bones.
    const drop = Math.max(0, ...legs.map(leg => {
      const root = leg.upper.getWorldPosition(new THREE.Vector3()), target = leg.visible
      const horizontal = (root.x - target.x) ** 2 + (root.z - target.z) ** 2
      return root.y - target.y - Math.sqrt(Math.max(0, (leg.a + leg.b - 1e-6) ** 2 - horizontal))
    }))
    hips.position.y -= Math.min(drop, 0.13) / hips.parent!.getWorldScale(new THREE.Vector3()).y
    model.updateWorldMatrix(true, true)
    legs.forEach(leg => plantLeg(leg, leg.visible))
    // The binding's upper-body contact solve follows these changed hips/legs.
    return freeArm && weight > 0.5 ? current.getClip().name.includes('backhand') ? 'backhand' : 'forehand' : undefined
  }
}

function aim(node: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  const rotation = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize())
    .multiply(node.getWorldQuaternion(new THREE.Quaternion()))
  node.quaternion.copy(node.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation)
  node.updateWorldMatrix(false, true)
}

function plantLeg(leg: { upper: THREE.Object3D; knee: THREE.Object3D; foot: THREE.Object3D; a: number; b: number }, target: THREE.Vector3): void {
  const root = leg.upper.getWorldPosition(new THREE.Vector3()), knee = leg.knee.getWorldPosition(new THREE.Vector3())
  // A game can travel faster than the reference. Keep the requested height and
  // constrain horizontal reach instead of folding the pelvis down to the floor.
  target = target.clone()
  const horizontal = new THREE.Vector2(target.x - root.x, target.z - root.z)
  const reach = Math.sqrt(Math.max(0, (leg.a + leg.b - 1e-6) ** 2 - (root.y - target.y) ** 2))
  if (horizontal.length() > reach) {
    horizontal.setLength(reach)
    target.x = root.x + horizontal.x
    target.z = root.z + horizontal.y
  }
  const direction = target.clone().sub(root)
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(leg.a - leg.b) + 1e-6, leg.a + leg.b - 1e-6)
  direction.normalize()
  const along = (leg.a * leg.a - leg.b * leg.b + distance * distance) / (2 * distance)
  const bend = knee.clone().sub(root)
  bend.addScaledVector(direction, -bend.dot(direction)).normalize()
  const elbow = direction.clone().multiplyScalar(along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, leg.a * leg.a - along * along)))
  const rotation = leg.foot.getWorldQuaternion(new THREE.Quaternion())
  aim(leg.upper, knee.sub(root), elbow)
  aim(leg.knee, leg.foot.getWorldPosition(new THREE.Vector3()).sub(leg.knee.getWorldPosition(new THREE.Vector3())), target.clone().sub(leg.knee.getWorldPosition(new THREE.Vector3())))
  leg.foot.quaternion.copy(leg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation)
  leg.foot.updateWorldMatrix(false, true)
}
