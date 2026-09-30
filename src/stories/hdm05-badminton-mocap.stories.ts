import type { Meta, StoryObj } from '@storybook/html'
import type { Controller } from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  applyHdm05Motion,
  createDefaultPlaybackOptions,
  type Hdm05Manifest,
  type Hdm05Motion,
  type Hdm05MotionSummary,
  type Hdm05PlaybackSample,
} from '../render/hdm05BadmintonMocap'
import {
  findHumanoidBones,
  normalizeHumanoidModel,
  type HumanoidBones,
} from '../render/skeletalBadminton'
import {
  createSkeletalRacket,
  getRacketStringCenterWorld,
} from '../render/skeletalBadminton'
import {
  distance3,
  getShuttleCorkCenter,
  placeShuttleForCorkCenter,
  type Vec3,
} from '../character/racketKinematics'
import { stepShuttlecock, type ShuttlecockState } from '../physics/shuttlecock'
import {
  createIncomingHdm05Shuttle,
  findHdm05VisualStrikeFrame,
  solveHdm05Shot,
  syncHdm05ContactMarker,
  syncHdm05Racket,
  syncHdm05Shuttle,
} from '../render/hdm05BadmintonContact'
import { createCourt } from '../render/court'
import {
  createShuttlecockMesh,
  hasShuttlecockHeadLanded,
  placeShuttlecockHeadOnGround,
} from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { mountScene } from './threeHelper'
import {
  createHdm05Overlay,
  createHdm05StoryGui,
  publishHdm05StoryState,
  updateHdm05Overlay,
  type Hdm05ShuttlePhase,
  type Hdm05StoryControls,
  type Hdm05ViewMode,
} from './hdm05BadmintonStoryUi'

const MANIFEST_URL = '/mocap/hdm05-badminton/manifest.json'

const meta: Meta = {
  title: 'Character/HDM05 Badminton Mocap',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.cssText = [
      'width:100%',
      'height:720px',
      'position:relative',
      'overflow:hidden',
      'background:#101625',
    ].join(';')

    const overlay = createHdm05Overlay(container)
    const ctx = mountScene(container)
    ctx.scene.background = new THREE.Color(0x15182a)
    createCourt(ctx.scene)

    const orbit = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    orbit.target.set(-1.8, 1.1, 0)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08

    const playback = createDefaultPlaybackOptions()
    const controls: Hdm05StoryControls = {
      autoCycle: true,
      clipSeconds: 4.5,
      motionId: '',
      paused: false,
      playbackSpeed: 1,
      poseScale: 1,
      rootMotionScale: playback.rootMotionScale,
      rootRotationScale: 0,
      showTrail: true,
      view: 'orbit',
    }

    const gui = createHdm05StoryGui(container, controls)
    const playerGroup = new THREE.Group()
    playerGroup.position.set(-2.2, 0, 0)
    ctx.scene.add(playerGroup)
    const player: { bones: HumanoidBones; loaded: boolean } = { bones: {}, loaded: false }
    new GLTFLoader().load(
      '/models/xbot.glb',
      (gltf) => {
        const model = gltf.scene
        normalizeHumanoidModel(model)
        playerGroup.add(model)
        player.bones = findHumanoidBones(model)
        player.loaded = true
        ;(window as any).__hdm05_player__ = player
        ;(window as any).__hdm05_player_group__ = playerGroup
        if (motion) recomputeStrike(motion)
      },
      undefined,
      (error) => {
        loadError = error instanceof Error ? error.message : String(error)
      },
    )
    const racket = createSkeletalRacket()
    racket.scale.setScalar(0.88)
    const contactMarker = createContactMarker()
    const shuttle = createShuttlecockMesh()
    ctx.scene.add(racket, contactMarker, shuttle)
    const trail = createTrailSystem(ctx.scene)

    let manifest: Hdm05Manifest | null = null
    let motion: Hdm05Motion | null = null
    let selectedSummary: Hdm05MotionSummary | null = null
    let motionController: Controller | null = null
    let elapsed = 0
    let previewOffset = 0
    let autoCycleElapsed = 0
    let lastView: Hdm05ViewMode | null = null
    let lastCompact: boolean | null = null
    let loadError = ''
    let motionRequest = 0
    const lastHead = new THREE.Vector3()
    const head = new THREE.Vector3()
    const strikeAnchor = new THREE.Vector3()
    const incomingStart = new THREE.Vector3()
    let hasLastHead = false
    let racketSpeed = 0
    let previousFrameValue = -1
    let lastLoopIndex = -1
    let strikeFrame = 0
    let contactCount = 0
    let contactError = Number.POSITIVE_INFINITY
    let impactAge = Number.POSITIVE_INFINITY
    let shuttlePhase: Hdm05ShuttlePhase = 'waiting'
    let shuttleState: ShuttlecockState | null = null
    ;(window as any).__hdm05_badminton_ready__ = false

    void loadManifest()

    function step(): void {
      if (!ctx.animating) return
      requestAnimationFrame(step)
      const dt = Math.min(ctx.clock.getDelta(), 1 / 30)
      if (!controls.paused) {
        elapsed += dt * controls.playbackSpeed
        syncAutoCycle(dt)
      }
      syncPlaybackOptions(playback, controls)

      let sample: Hdm05PlaybackSample | null = null
      if (motion && player.loaded) {
        sample = applyHdm05Motion(player.bones, motion, elapsed + previewOffset, playback)
        playerGroup.updateMatrixWorld(true)
      }

      syncHdm05Racket(player.bones, racket)
      getRacketStringCenterWorld(racket, head)
      racketSpeed = controls.paused ? 0 : updateRacketHeadSpeed(dt, sample)
      if (!controls.paused && motion && sample) advanceMocapShuttle(dt, motion, sample)
      syncHdm05Shuttle(shuttle, shuttleState)
      syncHdm05ContactMarker(contactMarker, head, impactAge)
      if (controls.showTrail && shuttleState && (shuttlePhase === 'incoming' || shuttlePhase === 'outgoing')) {
        trail.update(getShuttleCorkCenter(shuttleState.pos, shuttleState.vel))
      }
      trail.setVisible(controls.showTrail && shuttleState !== null)

      const compact = container.clientWidth < 640
      if (lastView !== controls.view || lastCompact !== compact) {
        setCamera(ctx.camera, orbit, controls.view, compact)
        lastView = controls.view
        lastCompact = compact
      }
      orbit.enabled = controls.view === 'orbit'
      if (controls.view !== 'orbit') setCamera(ctx.camera, orbit, controls.view, compact)
      orbit.update()

      updateHdm05Overlay(overlay, {
        autoCycle: controls.autoCycle,
        clipSeconds: controls.clipSeconds,
        contactCount,
        contactError,
        error: loadError,
        frame: sample?.frame ?? 0,
        loopBlend: sample?.loopBlend ?? false,
        racketSpeed,
        loaded: motion !== null,
        manifest,
        motion,
        selectedSummary,
        shuttlePhase,
        strikeFrame,
        view: controls.view,
      })
      publishHdm05StoryState(controls, motion, selectedSummary, sample, {
        contactCount,
        contactError,
        racketSpeed,
        shuttlePhase,
        strikeFrame,
      }, shuttleState?.pos ?? null)
    }
    step()

    async function loadManifest(): Promise<void> {
      try {
        manifest = await fetchJson<Hdm05Manifest>(MANIFEST_URL)
        const options = motionOptions(manifest.motions)
        motionController = gui.add(controls, 'motionId', options).name('motion')
        motionController.onChange((id: string) => {
          autoCycleElapsed = 0
          void loadMotion(id)
        })
        controls.motionId = defaultMotionId(manifest.motions)
        motionController.updateDisplay()
        if (controls.motionId) await loadMotion(controls.motionId)
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error)
      }
    }

    async function loadMotion(id: string): Promise<void> {
      if (!manifest) return
      const request = ++motionRequest
      const summary = manifest.motions.find((item) => item.id === id)
      if (!summary) return
      try {
        const nextMotion = await fetchJson<Hdm05Motion>(summary.path)
        if (request !== motionRequest) return
        selectedSummary = summary
        motion = nextMotion
        elapsed = 0
        autoCycleElapsed = 0
        recomputeStrike(nextMotion)
        ;(window as any).__hdm05_badminton_ready__ = true
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error)
      }
    }

    function syncAutoCycle(dt: number): void {
      if (!controls.autoCycle || !manifest || manifest.motions.length < 2) return
      autoCycleElapsed += dt * controls.playbackSpeed
      if (autoCycleElapsed < controls.clipSeconds) return
      const currentIndex = manifest.motions.findIndex((item) => item.id === controls.motionId)
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % manifest.motions.length
      const nextId = manifest.motions[nextIndex].id
      autoCycleElapsed = 0
      controls.motionId = nextId
      motionController?.updateDisplay()
      void loadMotion(nextId)
    }

    function recomputeStrike(nextMotion: Hdm05Motion): void {
      if (!player.loaded) return
      strikeFrame = findHdm05VisualStrikeFrame(player.bones, racket, nextMotion, playback)
      previewOffset = Math.max(0, strikeFrame - Math.round(nextMotion.fps * 1.2)) / nextMotion.fps
      measureStrikeAnchor(nextMotion)
      resetShuttlePlayback()
    }

    function measureStrikeAnchor(nextMotion: Hdm05Motion): void {
      applyHdm05Motion(player.bones, nextMotion, strikeFrame / nextMotion.fps, playback)
      playerGroup.updateMatrixWorld(true)
      syncHdm05Racket(player.bones, racket)
      getRacketStringCenterWorld(racket, strikeAnchor)
      incomingStart.copy(strikeAnchor).add(new THREE.Vector3(1.7, 0.42, 0.28))
    }

    function resetShuttlePlayback(): void {
      hasLastHead = false
      previousFrameValue = -1
      lastLoopIndex = -1
      contactError = Number.POSITIVE_INFINITY
      contactCount = 0
      impactAge = Number.POSITIVE_INFINITY
      shuttlePhase = 'waiting'
      shuttleState = null
      trail.reset()
    }

    function advanceMocapShuttle(dt: number, activeMotion: Hdm05Motion, sample: Hdm05PlaybackSample): void {
      impactAge += dt
      if (sample.loopIndex !== lastLoopIndex) {
        lastLoopIndex = sample.loopIndex
        previousFrameValue = -1
        shuttlePhase = 'waiting'
        shuttleState = null
        trail.reset()
      }
      if (sample.loopBlend) {
        previousFrameValue = sample.frameValue
        return
      }

      const framesToStrike = strikeFrame - sample.frameValue
      const incomingFrames = activeMotion.fps * 0.52
      if (framesToStrike > 0 && framesToStrike <= incomingFrames && shuttlePhase === 'waiting') {
        shuttlePhase = 'incoming'
      }
      if (shuttlePhase === 'incoming' && framesToStrike > 0) {
        const progress = 1 - framesToStrike / incomingFrames
        shuttleState = createIncomingHdm05Shuttle(incomingStart, strikeAnchor, progress)
      }

      const crossedStrike = previousFrameValue >= 0
        && previousFrameValue < strikeFrame
        && sample.frameValue >= strikeFrame
      if (crossedStrike) triggerMocapStrike(activeMotion.action)

      if (shuttlePhase === 'outgoing' && shuttleState) {
        shuttleState = stepShuttlecock(shuttleState, dt, undefined, 8)
        if (hasShuttlecockHeadLanded(shuttleState.pos, shuttleState.vel)) {
          shuttleState = {
            ...shuttleState,
            pos: placeShuttlecockHeadOnGround(shuttleState.pos, shuttleState.vel),
          }
          shuttlePhase = 'landed'
        }
      }
      previousFrameValue = sample.frameValue
    }

    function triggerMocapStrike(action: Hdm05Motion['action']): void {
      const incomingVelocity = shuttleState?.vel ?? [-5, -1, 0]
      const incomingPosition = placeShuttleForCorkCenter(head.toArray() as Vec3, incomingVelocity)
      contactError = distance3(
        getShuttleCorkCenter(incomingPosition, incomingVelocity),
        head.toArray() as Vec3,
      )
      const solution = solveHdm05Shot(action, head.toArray() as Vec3)
      shuttleState = {
        pos: solution.launchPoint,
        spin: [0, 36, -3],
        vel: solution.outgoingVel,
      }
      shuttlePhase = 'outgoing'
      impactAge = 0
      contactCount += 1
      trail.reset()
    }

    function updateRacketHeadSpeed(dt: number, sample: Hdm05PlaybackSample | null): number {
      if (!sample || sample.loopBlend || sample.loopIndex !== lastLoopIndex || sample.frameValue < previousFrameValue) {
        lastHead.copy(head)
        hasLastHead = false
        return 0
      }
      const speed = hasLastHead ? head.distanceTo(lastHead) / Math.max(dt, 1 / 120) : 0
      lastHead.copy(head)
      hasLastHead = true
      return speed
    }

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      gui.destroy()
      orbit.dispose()
      trail.dispose()
      disposeGroup(playerGroup)
      overlay.disposeLayout()
      disposeGroup(racket)
      disposeGroup(shuttle)
      disposeGroup(contactMarker)
      originalDispose()
    }

    return container
  },
}

export default meta

export const MocapPlayer: StoryObj = {
  name: 'HDM05 源骨架羽毛球动作',
}

function motionOptions(motions: Hdm05MotionSummary[]): Record<string, string> {
  return motions.reduce<Record<string, string>>((options, motion) => {
    options[`${motion.label} / ${motion.actor} / take ${motion.take}`] = motion.id
    return options
  }, {})
}

function defaultMotionId(motions: Hdm05MotionSummary[]): string {
  return motions.find((motion) => motion.id === 'dg-04-smash')?.id
    ?? motions.find((motion) => motion.action === 'smash')?.id
    ?? motions.find((motion) => motion.action === 'clear')?.id
    ?? motions[0]?.id
    ?? ''
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json() as Promise<T>
}

function syncPlaybackOptions(
  target: ReturnType<typeof createDefaultPlaybackOptions>,
  controls: Hdm05StoryControls,
): void {
  target.poseScale = controls.poseScale
  target.rootMotionScale = controls.rootMotionScale
  target.rootRotationScale = controls.rootRotationScale
}

function setCamera(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
  view: Hdm05ViewMode,
  compact: boolean,
): void {
  const scale = compact ? 1.3 : 1
  // 假人面朝 +x（球网在 x=0），站位 x≈-2.2、z≈0；右侧（挥拍手）在 +z 侧
  if (view === 'front') camera.position.set(-1.9, 1.45, 5.2 * scale + 0.4)
  if (view === 'side') camera.position.set(-1.9 - 4.8 * scale, 2.45, 0.4)
  if (view === 'back') camera.position.set(-1.9, 1.65, 0.4 - 5.2 * scale)
  if (view === 'top') camera.position.set(-1.9, 7.2 * scale, 0.4)
  if (view === 'orbit') camera.position.set(-1.9 - 4 * scale, 3, 4.15 * scale + 0.4)
  camera.fov = compact ? 52 : 45
  camera.updateProjectionMatrix()
  orbit.target.set(-1.9, 1.1, 0.4)
  camera.lookAt(orbit.target)
}

function createContactMarker(): THREE.Group {
  const group = new THREE.Group()
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffdc5e, transparent: true, opacity: 0.2 }),
  )
  group.add(marker)
  return group
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material)) {
      for (const item of material) item.dispose()
    } else {
      material.dispose()
    }
  })
}
