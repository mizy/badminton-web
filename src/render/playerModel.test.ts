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
import { createHdm05StrikeClip, type Hdm05Motion } from './hdm05BadmintonMocap'

const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
async function xbot() {
  const data = new Uint8Array(readFileSync(new URL('../../public/models/xbot.glb', import.meta.url))).buffer
  return new GLTFLoader().parseAsync(data, '')
}

async function kenneyPlayer() {
  const data = readFileSync(new URL('../../public/models/kenney-player.glb', import.meta.url))
  const { scene: model } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
  return { bytes: data.byteLength, model }
}

describe('glTF player binding', () => {
  it('binds the compact default Kenney skin to the gameplay skeleton', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const { bytes, model } = await kenneyPlayer()
    const bones = findHumanoidBones(model)

    expect(bytes).toBeLessThan(450_000)
    expect(bones.spine2?.name).toBe('UpperChest')
    expect(bones.rightHand?.name).toBe('RightHand')
    const updateModel = bindHumanoidModel(rig, model)
    const player = createPlayer(0)
    player.movement.footwork = 'lunge'
    player.movement.footworkPoint = 'front-right'
    player.movement.currentVel = { x: 1.2, z: 1.2 }
    updatePlayerMotion(motion, player, 0.2)
    updateModel(player, 0.2)

    expect(model.name).toBe('player-model')
    expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y).toBeGreaterThan(1.4)
    expect(world(bones.rightFoot!).toArray().every(Number.isFinite)).toBe(true)
    expect(world(model.getObjectByName('racket-string-center')!).distanceTo(world(bones.rightHand!))).toBeCloseTo(0.46, 5)
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
