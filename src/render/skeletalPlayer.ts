/**
 * 骨骼球员 — GLTF 骨骼模型 + 动作状态机 + 拍子挂右手。
 * 比赛渲染层使用：平时 ready，发球/击球时播放对应挥拍动作，播完回 ready。
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  getBadmintonActionDuration,
  sampleBadmintonMotion,
  type BadmintonAction,
} from '../character/badmintonKinematics'
import {
  applyBadmintonPose,
  createSkeletalRacket,
  findHumanoidBones,
  normalizeHumanoidModel,
  syncRacketToHand,
  type HumanoidBones,
} from './skeletalBadminton'

const MODEL_URL = '/models/xbot.glb'
/** normalizeHumanoidModel 把模型转到面朝 +x，与 home（-x 侧朝 +x）一致。 */
const BASE_YAW = Math.PI / 2

export interface SkeletalPlayer {
  group: THREE.Group
  bones: HumanoidBones
  racket: THREE.Group
  loaded: boolean
  loadError: string
  /** 触发一个动作（从头播放）；同动作连续触发会重播。 */
  play: (action: BadmintonAction) => void
  /** 推进动作时间并应用骨骼姿态；dt 为秒。 */
  update: (dt: number) => void
  /** 同步世界位置与朝向（facing 为世界 yaw）。 */
  place: (pos: [number, number, number], facing: number) => void
  dispose: () => void
}

interface PlayerAnimState {
  action: BadmintonAction
  elapsed: number
  duration: number
}

export function createSkeletalPlayer(scene: THREE.Scene): SkeletalPlayer {
  const group = new THREE.Group()
  scene.add(group)

  const anim: PlayerAnimState = {
    action: 'ready',
    elapsed: 0,
    duration: getBadmintonActionDuration('ready'),
  }

  const player: SkeletalPlayer = {
    group,
    bones: {},
    racket: createSkeletalRacket(),
    loaded: false,
    loadError: '',
    play,
    update,
    place,
    dispose,
  }
  player.racket.visible = false
  group.add(player.racket)

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene
      normalizeHumanoidModel(model)
      group.add(model)
      player.bones = findHumanoidBones(model)
      player.loaded = true
      player.racket.visible = true
    },
    undefined,
    (error) => {
      player.loadError = error instanceof Error ? error.message : String(error)
    },
  )

  return player

  function play(action: BadmintonAction): void {
    anim.action = action
    anim.elapsed = 0
    anim.duration = getBadmintonActionDuration(action)
  }

  function update(dt: number): void {
    if (!player.loaded) return
    anim.elapsed += dt
    if (anim.elapsed >= anim.duration && anim.action !== 'ready') {
      anim.action = 'ready'
      anim.elapsed = 0
      anim.duration = getBadmintonActionDuration('ready')
    }
    applyBadmintonPose(player.bones, anim.action, anim.elapsed)
    player.group.updateMatrixWorld(true)
    const sample = sampleBadmintonMotion(anim.action, anim.elapsed)
    syncRacketToHand(
      player.racket,
      player.bones.rightHand,
      sample.racketDirection,
      sample.faceNormal,
      player.bones.rightForeArm,
    )
  }

  function place(pos: [number, number, number], facing: number): void {
    group.position.set(pos[0], 0, pos[2])
    group.rotation.y = BASE_YAW + facing
  }

  function dispose(): void {
    scene.remove(group)
  }
}
