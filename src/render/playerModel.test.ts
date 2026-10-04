import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createPlayer } from '../game/playerFactory'
import { createPlayerSkeleton } from './playerSkeleton'
import { createPlayerMotion, updatePlayerMotion } from './playerMotion'
import { attachPlayerAppearance } from './playerAppearance'
import { bindHumanoidModel } from './playerModel'
import { findHumanoidBones } from './humanoidModel'
import { applyHdm05PlayerMotion } from './hdm05PlayerMotion'
import { applyMultiSensePlayerMotion, type MultiSenseCapture } from './multisensePlayerMotion'
import { createHdm05StrikeClip, type Hdm05Motion } from './hdm05BadmintonMocap'
import { createReachableRacketPose } from '../character/racketKinematics'
import { idealContactPoint } from '../character/contact'

const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
async function xbot() {
  const data = new Uint8Array(readFileSync(new URL('../../public/models/xbot.glb', import.meta.url))).buffer
  return new GLTFLoader().parseAsync(data, '')
}

async function quaterniusPlayer() {
  const data = readFileSync(new URL('../../public/models/quaternius-player.glb', import.meta.url))
  const { scene: model, animations } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
  return { bytes: data.byteLength, model, animations }
}

async function animePlayer() {
  const source = readFileSync(new URL('../../public/models/anime-player.glb', import.meta.url))
  const size = source.readUInt32LE(12)
  const doc = JSON.parse(source.subarray(20, 20 + size).toString())
  // Node verifies the real skin and bones; browser acceptance decodes its images.
  for (const material of doc.materials) delete material.pbrMetallicRoughness.baseColorTexture
  const json = Buffer.from(JSON.stringify(doc))
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
  const data = Buffer.concat([source.subarray(0, 20), padded, source.subarray(20 + size)])
  data.writeUInt32LE(data.length, 8)
  data.writeUInt32LE(padded.length, 12)
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
}

describe('glTF player binding', () => {
  it('keeps captured arm directions and neutral wrists without contact IK pulling the shoulders', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const { scene: model } = await animePlayer()
    const bones = findHumanoidBones(model)
    const hands = [bones.rightHand!, bones.leftHand!]
    const neutral = hands.map(hand => hand.quaternion.clone())
    const chestPosition = bones.spine2!.position.clone()
    const updateModel = bindHumanoidModel(rig, model)
    let grip: THREE.Quaternion | undefined
    let forehandThumb: THREE.Quaternion | undefined
    for (const source of ['front-right', 'front-left', 'back-right', 'back-left']) {
      const capture = JSON.parse(readFileSync(new URL(`../../public/mocap/video-poses/${source}.json`, import.meta.url), 'utf8')) as MultiSenseCapture
      for (const time of capture.time) {
        applyMultiSensePlayerMotion(rig, capture, Math.min(time, capture.time.at(-1)! - 0.000001))
        updateModel(undefined, undefined, capture.grip)
        for (const [i, side] of (['right', 'left'] as const).entries()) {
          const limb = rig[`${side}Arm`]
          const sourceUpper = world(limb.joint).sub(world(limb.root))
          const sourceLower = world(limb.end).sub(world(limb.joint))
          const skinUpper = world(bones[`${side}ForeArm`]!).sub(world(bones[`${side}Arm`]!))
          const skinLower = world(hands[i]).sub(world(bones[`${side}ForeArm`]!))
          expect(skinUpper.angleTo(sourceUpper)).toBeLessThan(0.000001)
          expect(skinLower.angleTo(sourceLower)).toBeLessThan(0.000001)
          expect(hands[i].quaternion.angleTo(neutral[i])).toBeLessThan(0.000001)
        }
        expect(bones.spine2!.position.distanceTo(chestPosition)).toBeLessThan(1e-8)
        const racket = model.getObjectByName('player-racket')!
        grip ??= racket.quaternion.clone()
        expect(racket.quaternion.angleTo(grip)).toBeLessThan(0.000001)
        const thumb = model.getObjectByName('RightHandThumb1')!
        if (capture.grip === 'forehand') forehandThumb = thumb.quaternion.clone()
        else expect(thumb.quaternion.angleTo(forehandThumb!)).toBeGreaterThan(0.5)
      }
    }
  })

  it('preserves captured knee angles on the anime skin despite its different leg proportions', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const { scene: model } = await animePlayer()
    const updateModel = bindHumanoidModel(rig, model)
    const bones = findHumanoidBones(model)
    const capture = JSON.parse(readFileSync(new URL('../../public/mocap/multisense-badminton/expert-backhand-Sub14.json', import.meta.url), 'utf8')) as MultiSenseCapture
    for (const time of [0, 0.4, 0.8, 1.2]) {
      applyMultiSensePlayerMotion(rig, capture, time)
      updateModel()
      for (const side of ['right', 'left'] as const) {
        const limb = rig[`${side}Leg`]
        const sourceAngle = world(limb.root).sub(world(limb.joint)).angleTo(world(limb.end).sub(world(limb.joint)))
        const root = bones[`${side}UpLeg`]!, joint = bones[`${side}Leg`]!, end = bones[`${side}Foot`]!
        const skinAngle = world(root).sub(world(joint)).angleTo(world(end).sub(world(joint)))
        expect(skinAngle).toBeCloseTo(sourceAngle, 5)
      }
      expect(Math.min(world(bones.rightFoot!).y, world(bones.leftFoot!).y)).toBeCloseTo(0.09, 5)
    }
    rig.body.position.y += 0.35
    rig.group.updateWorldMatrix(true, true)
    updateModel()
    expect(Math.min(world(bones.rightFoot!).y, world(bones.leftFoot!).y)).toBeCloseTo(0.44, 5)
  })

  it('binds the Quaternius athlete with leg clips, a palm grip and court shoes', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { bytes, model, animations } = await quaterniusPlayer()
    const bones = findHumanoidBones(model)

    expect(bytes).toBeLessThan(900_000)
    expect(bones.spine2?.name).toBe('Spine2')
    expect(bones.rightHand?.name).toBe('RightHand')
    expect(animations.map(clip => clip.name)).toEqual(['idle', 'walk', 'run'])
    for (const clip of animations) {
      expect(clip.tracks).toHaveLength(6)
      expect(clip.tracks.every(track => /(?:Left|Right)(?:UpLeg|Leg|Foot)\.quaternion$/.test(track.name))).toBe(true)
    }
    const finger = model.getObjectByName('RightHandMiddle2')!
    const thumb = model.getObjectByName('RightHandThumb1')!
    const openFinger = finger.quaternion.clone()
    const openThumb = thumb.quaternion.clone()
    const updateModel = bindHumanoidModel(rig, model, animations)
    const player = createPlayer(0)
    player.movement.footwork = 'lunge'
    player.movement.footworkPoint = 'front-right'
    player.movement.currentVel = { x: 1.2, z: 1.2 }
    updatePlayerMotion(motion, player, 0.2)
    updateModel(player, 0.2)

    expect(model.name).toBe('player-model')
    expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y).toBeGreaterThan(1.4)
    expect(world(bones.rightFoot!).toArray().every(Number.isFinite)).toBe(true)
    const racket = model.getObjectByName('player-racket')!
    expect(world(racket).distanceTo(world(bones.rightHand!))).toBeGreaterThan(0.04)
    expect(world(racket).distanceTo(world(bones.rightHand!))).toBeLessThan(0.09)
    expect(world(model.getObjectByName('racket-string-center')!).distanceTo(world(racket))).toBeCloseTo(0.46, 5)
    expect(finger.quaternion.angleTo(openFinger)).toBeGreaterThan(0.5)
    expect(thumb.quaternion.angleTo(openThumb)).toBeGreaterThan(0.8)
    expect(model.getObjectByName('right-shoe')?.parent).toBe(bones.rightFoot)
    expect(model.getObjectByName('left-shoe')?.parent).toBe(bones.leftFoot)
  })

  it.each([0, 1] as const)('binds the anime athlete with fixed bones and calibrated forehand/backhand contact on side %s', async side => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { scene: model } = await animePlayer()
    const bones = findHumanoidBones(model)
    const lengths = [bones.rightForeArm!, bones.rightHand!, bones.rightLeg!, bones.rightFoot!]
      .map(node => ({ node, position: node.position.clone() }))
    const updateModel = bindHumanoidModel(rig, model)
    const player = createPlayer(side)
    const forward = side === 0 ? 1 : -1
    for (const grip of ['forehand', 'backhand'] as const) {
      player.grip = grip
      for (const height of [0.65, 1.5, 2.3]) {
        const point: [number, number, number] = [player.pos[0] + forward * 0.5, height, grip === 'backhand' ? -forward * 0.4 : 0]
        player.contactPose = createReachableRacketPose({ desiredContact: point, playerPos: player.pos, playerSide: side, racketFaceDeg: 0 })
        player.swing = { ...player.swing, phase: 'recovery', shot: height > 2 ? 'CLEAR' : height < 1 ? 'NET_DROP' : 'DRIVE', elapsed: 0.07 }
        updatePlayerMotion(motion, player, 0)
        updateModel(player, 0)
        expect(world(model.getObjectByName('racket-string-center')!).distanceTo(new THREE.Vector3(...point))).toBeLessThan(0.05)
        for (const { node, position } of lengths) expect(node.position.distanceTo(position)).toBeLessThan(1e-8)
        for (const bone of Object.values(bones)) expect(world(bone!).toArray().every(Number.isFinite)).toBe(true)
      }
    }
  })

  it.each([0, 1] as const)('keeps both anime shoes planted during a deep lunge on side %s', async side => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { scene: model } = await animePlayer()
    const bones = findHumanoidBones(model)
    const updateModel = bindHumanoidModel(rig, model)
    const player = createPlayer(side)
    const forward = side === 0 ? 1 : -1
    for (const lateral of [forward, -forward]) {
      player.movement.footwork = 'lunge'
      player.movement.footworkPoint = lateral === forward ? 'front-right' : 'front-left'
      player.movement.targetDir = { x: forward, z: lateral }
      motion.feet.initialized = false
      updatePlayerMotion(motion, player, 0)
      updateModel(player, 0)
      expect(world(bones.rightFoot!).y).toBeCloseTo(world(rig.rightLeg.end).y, 4)
      expect(world(bones.leftFoot!).y).toBeCloseTo(world(rig.leftLeg.end).y, 4)
    }
  })

  it.each([0, 1] as const)('turns the actual skin side-on then contacts at the calibrated strings on side %s', async side => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { model, animations } = await quaterniusPlayer()
    const updateModel = bindHumanoidModel(rig, model, animations)
    const bones = findHumanoidBones(model)
    const player = createPlayer(side)
    player.swing = { ...player.swing, phase: 'preparing', shot: 'CLEAR', elapsed: 0.09 }
    updatePlayerMotion(motion, player, 0)
    updateModel(player, 0)
    const shoulders = world(bones.rightArm!).sub(world(bones.leftArm!))
    expect(Math.abs(shoulders.x)).toBeGreaterThan(Math.abs(shoulders.z) * 2)

    const point = idealContactPoint(player.pos, side, 'CLEAR')
    player.contactPose = createReachableRacketPose({ desiredContact: point, playerPos: player.pos, playerSide: side, racketFaceDeg: 18 })
    player.swing = { ...player.swing, phase: 'recovery', elapsed: 0.07 }
    updatePlayerMotion(motion, player, 1 / 60)
    updateModel(player, 1 / 60)
    expect(world(model.getObjectByName('racket-string-center')!).distanceTo(new THREE.Vector3(...point))).toBeLessThan(0.05)
  })

  it('retargets the real Xbot skin, preserves bind lengths, and keeps equipment in metres', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { scene: model, animations } = await xbot()
    const bones = findHumanoidBones(model)
    const positions = [bones.rightForeArm!, bones.rightHand!, bones.rightLeg!, bones.rightFoot!]
      .map(node => ({ node, rest: node.position.clone() }))
    const updateModel = bindHumanoidModel(rig, model, animations)
    const player = createPlayer(0)
    for (let frame = 0; frame < 60; frame++) {
      player.pos[0] += 1.5 / 60
      player.movement.currentVel = { x: 1.5, z: 0 }
      player.movement.gait = 'walk'
      player.movement.footwork = 'chasse'
      player.movement.footworkPoint = 'mid-right'
      updatePlayerMotion(motion, player, frame / 60)
      updateModel(player, frame / 60)
      expect(rig.group.position.toArray()).toEqual(player.pos)
      for (const { node, rest } of positions) expect(node.position.distanceTo(rest)).toBeLessThan(1e-8)
      const racket = model.getObjectByName('player-racket')!
      expect(world(racket).distanceTo(world(bones.rightHand!))).toBeLessThan(1e-6)
      expect(world(model.getObjectByName('racket-string-center')!).distanceTo(world(racket))).toBeCloseTo(0.46, 6)
      expect(Number.isFinite(world(bones.leftFoot!).y)).toBe(true)
    }
    const feet = [world(bones.rightFoot!), world(bones.leftFoot!)]
    expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y).toBeGreaterThan(1.4)
    for (let frame = 0; frame < 5; frame++) {
      updatePlayerMotion(motion, player, 59 / 60)
      updateModel(player, 59 / 60)
      expect(world(bones.rightFoot!).distanceTo(feet[0])).toBeLessThan(1e-8)
      expect(world(bones.leftFoot!).distanceTo(feet[1])).toBeLessThan(1e-8)
    }
  })

  it('binds the same captured smash to a real skin with connected, metre-sized equipment', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const { scene: model } = await xbot()
    const updateModel = bindHumanoidModel(rig, model)
    const bones = findHumanoidBones(model)
    const recording = JSON.parse(readFileSync(new URL('../../public/mocap/hdm05-badminton/dg-04-smash.json', import.meta.url), 'utf8')) as Hdm05Motion
    const clip = createHdm05StrikeClip(recording)
    for (let frame = 0; frame < clip.poseBody.length; frame++) {
      applyHdm05PlayerMotion(rig, clip, frame / clip.fps)
      updateModel()
      const racket = model.getObjectByName('player-racket')!
      expect(world(racket).distanceTo(world(bones.rightHand!))).toBeLessThan(1e-6)
      expect(world(model.getObjectByName('racket-string-center')!).distanceTo(world(racket))).toBeCloseTo(0.46, 6)
      expect(world(bones.head!).toArray().every(Number.isFinite)).toBe(true)
    }
  })

  it('rejects an unrigged model before replacing the playable fallback', () => {
    const rig = createPlayerSkeleton()
    expect(() => bindHumanoidModel(rig, new THREE.Group())).toThrow('缺少人形骨骼')
    expect(rig.group.getObjectByName('player-model')).toBeUndefined()
  })
})
