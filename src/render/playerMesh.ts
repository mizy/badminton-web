/** Player rendering entry points shared by the game and character previews. */
import * as THREE from 'three'
import type { PlayerState } from '../character/types'
import type { Vec3 } from '../character/racketKinematics'
import { createPlayerSkeleton } from './playerSkeleton'
import { createPlayerMotion, updatePlayerMotion, updateRacketMotion, type PlayerMotion } from './playerMotion'
import { attachPlayerAppearance, type PlayerMeshColors, type PlayerAppearanceOptions } from './playerAppearance'
import { bindHumanoidModel } from './playerModel'
import { applyHdm05PlayerMotion } from './hdm05PlayerMotion'
import { applyMultiSensePlayerMotion, type MultiSenseCapture } from './multisensePlayerMotion'
import type { Hdm05Motion } from './hdm05BadmintonMocap'
export type { PlayerMeshColors } from './playerAppearance'

export interface PlayerMeshOptions extends PlayerAppearanceOptions {
  /** Rigged glTF/GLB or FBX with supported humanoid bones and +Z bind-pose forward. */
  modelUrl?: string
  /** Optional atlas for models that ship their skin separately. */
  modelTextureUrl?: string
  /** Bone-only clips for this skin, loaded alongside the model. */
  animationUrl?: string
}

interface PlayerView {
  motion: PlayerMotion
  model?: ReturnType<typeof bindHumanoidModel>
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
    void loadPlayerModel(modelUrl, options.modelTextureUrl, colors?.body, options.animationUrl).then(({ scene: model, animations }) => {
      try {
        view.model = bindHumanoidModel(skeleton, model, animations)
        model.traverse(node => {
          if (!(node instanceof THREE.Mesh) || !colors) return
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (material instanceof THREE.MeshStandardMaterial && (material.name.includes('Beta_') || material.name === 'Player_Jersey')) {
              material.color.setHex(colors.body).multiplyScalar(material.name.includes('Joints') ? 0.4 : 1)
            }
          }
        })
        appearance.forEach(node => { node.visible = node.name.includes('-shoe-') || node.name.endsWith('-sole') || node.name.endsWith('-sock') })
        view.model()
      } catch (error) { console.warn('球员模型无法绑定，保留默认外观', error) }
    }).catch(error => { console.warn('球员模型加载失败，保留默认外观', error) })
  }
  return skeleton.group
}

export function syncPlayerMotion(group: THREE.Group, player: PlayerState, elapsed: number): void {
  const view = players.get(group)
  if (!view) return
  updatePlayerMotion(view.motion, player, elapsed)
  view.model?.(player, elapsed)
}

/** @entry Captured motion uses the same skeleton and model binding as gameplay. */
export function syncPlayerMocap(group: THREE.Group, motion: Hdm05Motion<string> | MultiSenseCapture, time: number): void {
  const view = players.get(group)
  if (!view) return
  if ('globalPositions' in motion) applyMultiSensePlayerMotion(view.motion, motion, time)
  else applyHdm05PlayerMotion(view.motion, motion, time)
  view.model?.(undefined, undefined, 'globalPositions' in motion ? motion.grip : undefined)
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

interface LoadedPlayerModel {
  animations: THREE.AnimationClip[]
  scene: THREE.Group
}

async function loadPlayerModel(modelUrl: string, textureUrl?: string, bodyColor?: number, animationUrl?: string): Promise<LoadedPlayerModel> {
  const isFbx = /\.fbx(?:$|[?#])/i.test(modelUrl)
  let loaded: LoadedPlayerModel
  if (isFbx) {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const scene = await new FBXLoader().loadAsync(modelUrl)
    loaded = { scene, animations: scene.animations }
  } else {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    loaded = await new GLTFLoader().loadAsync(modelUrl)
  }
  const body = loaded.scene.getObjectByName('SuperHero_Male')
  const hasKit = body instanceof THREE.Mesh && !Array.isArray(body.material) && body.material.name === 'Player_Kit'
  if (textureUrl || hasKit) await applyModelTexture(loaded.scene, textureUrl ?? modelUrl.replace(/\.glb(?:\?.*)?$/, '.png'), bodyColor)
  if (animationUrl) {
    try {
      const response = await fetch(animationUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const clips = await response.json() as Parameters<typeof THREE.AnimationClip.parse>[0][]
      loaded.animations.push(...clips.map(clip => THREE.AnimationClip.parse(clip)))
    } catch (error) { console.warn('视频动作加载失败，保留基础比赛动作', error) }
  }
  return loaded
}

async function applyModelTexture(model: THREE.Group, textureUrl: string, bodyColor?: number): Promise<void> {
  const source = await new THREE.TextureLoader().loadAsync(textureUrl)
  source.colorSpace = THREE.SRGBColorSpace
  const body = model.getObjectByName('SuperHero_Male')
  const hasKit = body instanceof THREE.Mesh && !Array.isArray(body.material) && body.material.name === 'Player_Kit'
  if (hasKit) source.flipY = false
  const texture = bodyColor === undefined ? source : createTeamTexture(source, bodyColor)
  if (texture !== source) source.dispose()
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial)) continue
      if (hasKit && material.name !== 'Player_Kit') continue
      material.map = texture
      material.color.set(0xffffff)
      // Kenney's FBX exports TransparencyFactor=1 although the atlas itself is opaque.
      material.opacity = 1
      material.transparent = false
      material.needsUpdate = true
    }
  })
}

/** Re-hues only the saturated red kit pixels; skin, hair and facial details remain unchanged. */
function createTeamTexture(source: THREE.Texture, bodyColor: number): THREE.CanvasTexture {
  const image = source.image as HTMLImageElement
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法创建球员队服贴图')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const target = [(bodyColor >> 16) & 255, (bodyColor >> 8) & 255, bodyColor & 255]
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const red = pixels.data[offset]
    const green = pixels.data[offset + 1]
    const blue = pixels.data[offset + 2]
    if (red <= 150 || green >= 125 || red <= green * 1.35 || red <= blue * 1.25) continue
    const shade = 0.42 + 0.28 * red / 245
    pixels.data[offset] = Math.min(255, target[0] * shade)
    pixels.data[offset + 1] = Math.min(255, target[1] * shade)
    pixels.data[offset + 2] = Math.min(255, target[2] * shade)
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = source.flipY
  texture.name = 'player-team-texture'
  return texture
}
