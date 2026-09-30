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
  return (await new GLTFLoader().parseAsync(data, '')).scene
}

describe('glTF player binding', () => {
  it('retargets the real Xbot skin, preserves bind lengths, and keeps equipment in metres', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const motion = createPlayerMotion(rig)
    const model = await xbot()
    const bones = findHumanoidBones(model)
    const positions = [bones.rightForeArm!, bones.rightHand!, bones.rightLeg!, bones.rightFoot!]
      .map(node => ({ node, rest: node.position.clone() }))
    const updateModel = bindHumanoidModel(rig, model)
    const player = createPlayer(0)
    for (let frame = 0; frame < 60; frame++) {
      player.pos[2] += 1.5 / 60
      player.movement.currentVel = { x: 0, z: 1.5 }
      player.movement.footwork = 'chasse'
      player.swing.phase = 'preparing'
      player.swing.elapsed = frame / 60
      updatePlayerMotion(motion, player, frame / 60)
      updateModel()
      for (const { node, rest } of positions) expect(node.position.distanceTo(rest)).toBeLessThan(1e-8)
      const racket = model.getObjectByName('player-racket')!
      expect(world(racket).distanceTo(world(bones.rightHand!))).toBeLessThan(1e-6)
      expect(world(model.getObjectByName('racket-string-center')!).distanceTo(world(racket))).toBeCloseTo(0.46, 6)
      expect(Number.isFinite(world(bones.leftFoot!).y)).toBe(true)
    }
  })

  it('binds the same captured smash to a real skin with connected, metre-sized equipment', async () => {
    const rig = createPlayerSkeleton()
    attachPlayerAppearance(rig, undefined, '', { labelScale: 0 })
    const model = await xbot()
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
