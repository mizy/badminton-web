import type { Meta, StoryObj } from '@storybook/html'
import GUI, { type Controller } from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  canBadmintonActionContact,
  getBadmintonActionContactTime,
  sampleBadmintonShuttle,
  type BadmintonShuttleSample,
} from '../character/badmintonKinematics'
import {
  MAX_CONTACT_ERROR,
  distance3,
  placeShuttleForCorkCenter,
  type Vec3,
} from '../character/racketKinematics'
import { createCourt } from '../render/court'
import {
  ACTION_LABELS,
  BADMINTON_ACTIONS,
  applyBadmintonPose,
  createSkeletalRacket,
  findHumanoidBones,
  getRacketStringCenterWorld,
  normalizeHumanoidModel,
  sampleBadmintonMotion,
  syncRacketToHand,
  type BadmintonAction,
  type BadmintonMotionSample,
  type HumanoidBones,
} from '../render/skeletalBadminton'
import { createShuttlecockMesh, syncShuttlecockMesh } from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { mountScene } from './threeHelper'

type ViewMode = 'orbit' | 'front' | 'side' | 'back' | 'top'

interface Controls {
  action: BadmintonAction
  autoCycle: boolean
  paused: boolean
  playbackSpeed: number
  showContact: boolean
  showSkeleton: boolean
  showTrail: boolean
  view: ViewMode
}

interface OverlayElement extends HTMLDivElement {
  disposeLayout: () => void
}

interface StoryGui {
  actionController: Controller
  gui: GUI
}

const MODEL_URL = '/models/xbot.glb'
const VIEW_MODES: ViewMode[] = ['orbit', 'front', 'side', 'back', 'top']
const ACTION_OPTIONS = BADMINTON_ACTIONS.reduce<Record<string, BadmintonAction>>((options, action) => {
  options[ACTION_LABELS[action]] = action
  return options
}, {})

const meta: Meta = {
  title: 'Character/Badminton Actions',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '720px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'
    container.style.background = '#101625'

    const overlay = createOverlay(container)
    const ctx = mountScene(container)
    ctx.scene.background = new THREE.Color(0x15182a)
    createCourt(ctx.scene)

    const orbit = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    orbit.target.set(-1.6, 1.08, 0)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08

    const controls: Controls = {
      action: 'smash',
      autoCycle: false,
      paused: false,
      playbackSpeed: 0.92,
      showContact: true,
      showSkeleton: false,
      showTrail: true,
      view: 'orbit',
    }
    const { actionController, gui } = createGui(container, controls)
    const racket = createSkeletalRacket()
    ctx.scene.add(racket)

    const shuttle = createShuttlecockMesh()
    ctx.scene.add(shuttle)
    const trail = createTrailSystem(ctx.scene)
    const contactMarker = createContactMarker()
    ctx.scene.add(contactMarker)

    let model: THREE.Object3D | null = null
    let bones: HumanoidBones = {}
    let helper: THREE.SkeletonHelper | null = null
    let elapsed = 0
    let lastAction: BadmintonAction | null = null
    let lastCycle = 0
    let lastView: ViewMode | null = null
    let lastCompact: boolean | null = null
    let loadError = ''
    let contactAnchorReady = false
    let contactAnchorAction: BadmintonAction | null = null
    let contactError = Number.POSITIVE_INFINITY
    let contactValid = false
    let shuttleCorkCenter: Vec3 | null = null
    const contactAnchor = new THREE.Vector3()
    const racketStringCenter = new THREE.Vector3()
    ;(window as any).__badminton_actions_ready__ = false

    const layoutObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        if (container.clientWidth < 640) gui.close()
      })
    layoutObserver?.observe(container)

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        model = gltf.scene
        normalizeHumanoidModel(model)
        model.position.set(-2.35, 0, -0.15)
        ctx.scene.add(model)
        bones = findHumanoidBones(model)
        helper = new THREE.SkeletonHelper(model)
        helper.visible = controls.showSkeleton
        ctx.scene.add(helper)
        ;(window as any).__badminton_actions_ready__ = true
      },
      undefined,
      (error) => {
        loadError = error instanceof Error ? error.message : String(error)
      },
    )

    function step(): void {
      if (!ctx.animating) return
      requestAnimationFrame(step)
      const dt = Math.min(ctx.clock.getDelta(), 1 / 30)
      if (!controls.paused) elapsed += dt * controls.playbackSpeed

      const action = controls.autoCycle
        ? BADMINTON_ACTIONS[Math.floor(elapsed / 2.15) % BADMINTON_ACTIONS.length]
        : controls.action
      if (controls.autoCycle) {
        controls.action = action
        actionController.updateDisplay()
      }
      const sample = model
        ? applyBadmintonPose(bones, action, elapsed)
        : sampleBadmintonMotion(action, elapsed)

      if (model && contactAnchorAction !== action) {
        contactAnchorReady = measureContactAnchor(
          model,
          bones,
          racket,
          action,
          contactAnchor,
        )
        contactAnchorAction = action
        applyBadmintonPose(bones, action, elapsed)
      }

      if (model) model.updateMatrixWorld(true)
      if (lastAction !== action || sample.cycle < lastCycle) trail.reset()
      lastAction = action
      lastCycle = sample.cycle

      syncRacketToHand(
        racket,
        bones.rightHand,
        sample.racketDirection,
        sample.faceNormal,
        bones.rightForeArm,
      )
      getRacketStringCenterWorld(racket, racketStringCenter)
      const shuttleSample = contactAnchorReady
        ? sampleBadmintonShuttle(action, sample.cycle, contactAnchor.toArray() as Vec3)
        : null
      shuttleCorkCenter = syncShuttle(shuttleSample, shuttle, trail, controls.showTrail)
      contactError = shuttleCorkCenter
        ? distance3(racketStringCenter.toArray() as Vec3, shuttleCorkCenter)
        : Number.POSITIVE_INFINITY
      contactValid = sample.contactCue && contactError <= MAX_CONTACT_ERROR
      syncContactMarker(contactMarker, contactAnchor, canBadmintonActionContact(action), contactValid, controls.showContact)
      helper && (helper.visible = controls.showSkeleton)

      const compact = container.clientWidth < 640
      if (lastView !== controls.view || lastCompact !== compact) {
        setCamera(ctx.camera, orbit, controls.view, compact)
        lastView = controls.view
        lastCompact = compact
      }
      orbit.enabled = controls.view === 'orbit'
      if (controls.view !== 'orbit') setCamera(ctx.camera, orbit, controls.view, compact)
      orbit.update()

      updateOverlay(
        overlay,
        sample,
        controls,
        model !== null,
        loadError,
        countBones(bones),
        contactError,
        contactValid,
      )
      publish(
        sample,
        controls,
        model !== null,
        bones,
        racket,
        racketStringCenter,
        shuttleCorkCenter,
        contactError,
        contactValid,
      )
    }
    step()

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      gui.destroy()
      orbit.dispose()
      trail.dispose()
      if (helper) ctx.scene.remove(helper)
      if (model) ctx.scene.remove(model)
      layoutObserver?.disconnect()
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

export const TechniquePlayer: StoryObj = {
  name: '羽毛球常见动作播放器',
}

function syncShuttle(
  sample: BadmintonShuttleSample | null,
  shuttle: THREE.Group,
  trail: ReturnType<typeof createTrailSystem>,
  showTrail: boolean,
): Vec3 | null {
  if (!sample) {
    shuttle.visible = false
    trail.setVisible(false)
    return null
  }
  shuttle.visible = true
  const velocity: Vec3 = [
    (sample.nextCorkCenter[0] - sample.corkCenter[0]) * 38,
    (sample.nextCorkCenter[1] - sample.corkCenter[1]) * 38,
    (sample.nextCorkCenter[2] - sample.corkCenter[2]) * 38,
  ]
  const position = placeShuttleForCorkCenter(sample.corkCenter, velocity)
  syncShuttlecockMesh(shuttle, position, velocity)
  if (showTrail) trail.update(sample.corkCenter)
  trail.setVisible(showTrail)
  return sample.corkCenter
}

function measureContactAnchor(
  model: THREE.Object3D,
  bones: HumanoidBones,
  racket: THREE.Group,
  action: BadmintonAction,
  target: THREE.Vector3,
): boolean {
  if (!canBadmintonActionContact(action) || !bones.rightHand) return false
  const sample = applyBadmintonPose(bones, action, getBadmintonActionContactTime(action))
  model.updateMatrixWorld(true)
  syncRacketToHand(racket, bones.rightHand, sample.racketDirection, sample.faceNormal, bones.rightForeArm)
  getRacketStringCenterWorld(racket, target)
  return true
}

function createGui(container: HTMLElement, controls: Controls): StoryGui {
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.top = '12px'
  host.style.right = '12px'
  host.style.zIndex = '20'
  container.appendChild(host)

  const gui = new GUI({ container: host, title: 'Badminton Actions' })
  gui.add(controls, 'autoCycle').name('auto cycle')
  const actionController = gui.add(controls, 'action', ACTION_OPTIONS).name('technique')
  gui.add(controls, 'view', VIEW_MODES).name('view')
  gui.add(controls, 'playbackSpeed', 0.15, 1.6, 0.05).name('speed')
  gui.add(controls, 'showSkeleton').name('skeleton')
  gui.add(controls, 'showTrail').name('trail')
  gui.add(controls, 'showContact').name('contact')
  gui.add(controls, 'paused').name('paused')
  return { actionController, gui }
}

function setCamera(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
  view: ViewMode,
  compact: boolean,
): void {
  const distanceScale = compact ? 1.32 : 1
  if (view === 'front') camera.position.set(-2.2, 1.55, 5.2 * distanceScale)
  if (view === 'side') camera.position.set(-2.2 - 4.8 * distanceScale, 2.45, 0.2)
  if (view === 'back') camera.position.set(-2.2, 1.7, -5.2 * distanceScale)
  if (view === 'top') camera.position.set(-2.2, 7.2 * distanceScale, 0.1)
  if (view === 'orbit') camera.position.set(-2.2 - 4 * distanceScale, 3.1, 4.15 * distanceScale)
  camera.fov = compact ? 52 : 45
  camera.updateProjectionMatrix()
  orbit.target.set(-1.65, 1.24, 0.02)
  camera.lookAt(orbit.target)
}

function createContactMarker(): THREE.Group {
  const group = new THREE.Group()
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffdc5e, transparent: true, opacity: 0.95 }),
  )
  group.add(sphere)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.007, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.55 }),
  )
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  return group
}

function syncContactMarker(
  marker: THREE.Group,
  anchor: THREE.Vector3,
  contactCapable: boolean,
  contactValid: boolean,
  visible: boolean,
): void {
  marker.visible = visible && contactCapable
  marker.position.copy(anchor)
  const scale = contactValid ? 1.45 : 1
  marker.scale.setScalar(scale)
}

function createOverlay(container: HTMLElement): OverlayElement {
  const overlay = document.createElement('div') as OverlayElement
  overlay.style.cssText = [
    'position:absolute',
    'left:12px',
    'top:12px',
    'z-index:12',
    'background:rgba(5,9,16,0.78)',
    'border:1px solid rgba(255,255,255,0.16)',
    'border-radius:6px',
    'padding:10px 12px',
    'color:#eff6ff',
    'font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre',
    'pointer-events:none',
    'user-select:none',
  ].join(';')
  container.appendChild(overlay)
  const syncLayout = () => {
    const compact = container.clientWidth < 640
    overlay.style.top = compact ? 'auto' : '12px'
    overlay.style.bottom = compact ? '12px' : 'auto'
    overlay.style.maxWidth = compact ? '210px' : '300px'
    overlay.style.font = compact
      ? '12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace'
      : '13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace'
  }
  syncLayout()
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncLayout)
  observer?.observe(container)
  overlay.disposeLayout = () => observer?.disconnect()
  return overlay
}

function updateOverlay(
  overlay: HTMLDivElement,
  sample: BadmintonMotionSample,
  controls: Controls,
  loaded: boolean,
  error: string,
  boneCount: number,
  contactError: number,
  contactValid: boolean,
): void {
  const contactText = Number.isFinite(contactError)
    ? `${(contactError * 100).toFixed(1)}cm / ${contactValid ? 'hit' : 'tracking'}`
    : 'n/a'
  overlay.textContent = [
    `sport    badminton`,
    `rig      ${loaded ? `xbot rigged test model (${boneCount})` : error || 'loading...'}`,
    `tech     ${sample.label}`,
    `phase    ${sample.phaseLabel}${contactValid ? ' *' : ''}`,
    `contact  ${contactText}`,
    `cycle    ${sample.cycle.toFixed(2)}`,
    `view     ${controls.view}`,
    `speed    ${controls.playbackSpeed.toFixed(2)}x`,
  ].join('\n')
}

function publish(
  sample: BadmintonMotionSample,
  controls: Controls,
  loaded: boolean,
  bones: HumanoidBones,
  racket: THREE.Group,
  racketStringCenter: THREE.Vector3,
  shuttleCorkCenter: Vec3 | null,
  contactError: number,
  contactValid: boolean,
): void {
  const hand = new THREE.Vector3()
  bones.rightHand?.getWorldPosition(hand)
  ;(window as any).__badminton_actions_state__ = {
    action: sample.action,
    contact: contactValid,
    contactError,
    cycle: sample.cycle,
    hand: hand.toArray(),
    loaded,
    phase: sample.phase,
    racket: racket.position.toArray(),
    racketStringCenter: racketStringCenter.toArray(),
    shuttle: shuttleCorkCenter,
    shuttleCorkCenter,
    showSkeleton: controls.showSkeleton,
    view: controls.view,
  }
}

function countBones(bones: HumanoidBones): number {
  return Object.values(bones).filter(Boolean).length
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
