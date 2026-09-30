/** Player rendering entry points shared by the game and character previews. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import type { Vec3 } from '../character/racketKinematics'
import { createPlayerSkeleton } from './playerSkeleton'
import { createPlayerMotion, updatePlayerMotion, updateRacketMotion, type PlayerMotion } from './playerMotion'
import { attachPlayerAppearance, type PlayerMeshColors, type PlayerAppearanceOptions } from './playerAppearance'
import { bindHumanoidModel } from './playerModel'
import { applyHdm05PlayerMotion } from './hdm05PlayerMotion'
import type { Hdm05Motion } from './hdm05BadmintonMocap'
export type { PlayerMeshColors } from './playerAppearance'

export interface PlayerMeshOptions extends PlayerAppearanceOptions {
  /** Rigged glTF with Mixamo bones and +Z bind-pose forward. */
  modelUrl?: string
}

interface PlayerView {
  motion: PlayerMotion
  model?: () => void
}
const players = new WeakMap<THREE.Group, PlayerView>()

/** 脚下能量环：细边线环 + 外发光晕 + 旋转的扫描弧，不是发光圆盘（尺寸见 playerMesh.test.ts）。 */
export function createGroundMarker(color: number): THREE.Group {
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.315, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
  ring.name = 'ground-ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.008
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.315, 0.35, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.name = 'ground-halo'
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.009
  const sweep = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.30, 32, 1, 0, Math.PI * 0.42),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  sweep.name = 'ground-sweep'
  sweep.rotation.x = -Math.PI / 2
  sweep.position.y = 0.01
  group.add(ring, halo, sweep)
  return group
}

/** 能量环动效：扫描弧转圈，光晕随呼吸明暗。每帧由 frame.ts 调用。 */
export function updateGroundMarker(group: THREE.Group, elapsed: number): void {
  const sweep = group.getObjectByName('ground-sweep')
  if (sweep) sweep.rotation.z = -elapsed * 1.5
  const halo = group.getObjectByName('ground-halo') as THREE.Mesh | undefined
  if (halo) (halo.material as THREE.MeshBasicMaterial).opacity = 0.12 + (0.5 + 0.5 * Math.sin(elapsed * 3.4)) * 0.14
}

/** @entry Skeleton owns animation; appearance can be procedural or a rigged glTF skin. */
export function createPlayerMesh(colors?: PlayerMeshColors, label = 'P', options: PlayerMeshOptions = {}): THREE.Group {
  const skeleton = createPlayerSkeleton()
  const appearance = attachPlayerAppearance(skeleton, colors, label, options)
  const view: PlayerView = { motion: createPlayerMotion(skeleton) }
  players.set(skeleton.group, view)
  const modelUrl = options.modelUrl
  if (modelUrl) {
    void import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load(modelUrl, gltf => {
      try {
        view.model = bindHumanoidModel(skeleton, gltf.scene)
        appearance.forEach(node => { node.visible = false })
        view.model()
      } catch (error) { console.warn('球员模型无法绑定，保留默认外观', error) }
    }, undefined, error => { console.warn('球员模型加载失败，保留默认外观', error) }))
      .catch(error => { console.warn('球员模型加载器失败，保留默认外观', error) })
  }
  return skeleton.group
}

export function syncPlayerMotion(group: THREE.Group, player: PlayerState, elapsed: number): void {
  const view = players.get(group)
  if (!view) return
  updatePlayerMotion(view.motion, player, elapsed)
  view.model?.()
}

/** @entry Captured motion uses the same skeleton and model binding as gameplay. */
export function syncPlayerMocap(group: THREE.Group, motion: Hdm05Motion<string>, time: number): void {
  const view = players.get(group)
  if (!view) return
  applyHdm05PlayerMotion(view.motion, motion, time)
  view.model?.()
}

export function updatePlayerMesh(group: THREE.Group, pos: Vec3, facing: number): void {
  group.position.set(...pos)
  group.rotation.y = facing
}

export function updatePlayerRacketPose(group: THREE.Group, swing01: number): void {
  const view = players.get(group)
  if (!view) return
  updateRacketMotion(view.motion, swing01)
  view.model?.()
}
