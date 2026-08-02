import type { Meta, StoryObj } from '@storybook/html'
import GUI from 'lil-gui'
import * as THREE from 'three'
import type { ContactResult, ContactTechnique } from '../character/contact'
import {
  getShuttleCorkCenter,
  type RacketContactPose,
} from '../character/racketKinematics'
import {
  RALLY_PLAYER_POS,
  createRallyContactState,
  createRallyRacketPose,
  stepRallyContact,
  type RallyContactConfig,
  type RallyContactLanding,
  type RallyContactPhase,
} from '../play/rallyContact'
import { createCourt } from '../render/court'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { createPlayerMesh, updatePlayerMesh } from '../render/playerMesh'
import {
  createShuttlecockMesh,
  syncShuttlecockMesh,
} from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { createSkeletalRacket, syncRacketToGrip } from '../render/skeletalRacket'
import { mountScene } from './threeHelper'

interface Controls extends RallyContactConfig {
  contactHeightCm: number
  contactReachCm: number
  contactSideCm: number
  debug: boolean
  incomingSpeed: number
  paused: boolean
  power: number
  racketFaceDeg: number
  reset: () => void
  swingOffsetMs: number
  targetZ: number
  technique: ContactTechnique
}

interface Diagnostics {
  landing: RallyContactLanding
  phase: RallyContactPhase
  result: ContactResult | null
}

interface ResponsiveOverlay extends HTMLDivElement {
  disposeLayout: () => void
}

const TECHNIQUES: ContactTechnique[] = ['AUTO', 'CLEAR', 'DRIVE', 'DROP', 'SMASH', 'LIFT', 'NET_DROP']

const meta: Meta = {
  title: 'Play/Rally Contact Timing',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '700px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'
    container.style.background = '#101625'

    const overlay = createOverlay(container)
    const ctx = mountScene(container)
    const syncCamera = () => setContactCamera(ctx.camera, container.clientWidth < 640)
    const cameraObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncCamera)
    cameraObserver?.observe(container)
    syncCamera()
    createCourt(ctx.scene)

    const player = createPlayerMesh(
      { body: 0x00ddff, head: 0xffcc99, racket: 0xd7dde8, marker: 0x00ffff },
      'A',
      { glowScale: 0, labelScale: 0 },
    )
    updatePlayerMesh(player, RALLY_PLAYER_POS, 0)
    ctx.scene.add(player)

    const shuttleGroup = createShuttlecockMesh()
    ctx.scene.add(shuttleGroup)

    const racket = createSkeletalRacket()
    ctx.scene.add(racket)

    const debug = createDebugObjects()
    ctx.scene.add(debug.contact, debug.ideal, debug.target, debug.line)

    const trail = createTrailSystem(ctx.scene)
    const controls: Controls = {
      contactHeightCm: 0,
      contactReachCm: 0,
      contactSideCm: 0,
      debug: false,
      incomingSpeed: 18,
      paused: false,
      power: 0.78,
      racketFaceDeg: 0,
      reset: () => reset(),
      swingOffsetMs: 0,
      targetZ: -0.35,
      technique: 'AUTO',
    }
    const gui = createGui(container, controls)

    let rally = createRallyContactState(controls)
    let publishedResult: ContactResult | null = null

    reset()

    function reset(): void {
      rally = createRallyContactState(controls)
      publishedResult = null
      trail.reset()
      setDebugVisible(debug, controls.debug)
      ;(window as any).__badminton_rally_contact_ready__ = false
    }

    function step(): void {
      if (!ctx.animating) return
      requestAnimationFrame(step)
      updateEffects(performance.now(), ctx.scene)

      if (!controls.paused) {
        const dt = Math.min(ctx.clock.getDelta(), 1 / 45)
        advance(dt)
      }

      render()
      publish({ landing: rally.landing, phase: rally.phase, result: rally.result })
    }
    step()

    function advance(dt: number): void {
      const step = stepRallyContact(rally, dt, controls)
      rally = step.state
      if (step.reset) {
        publishedResult = null
        trail.reset()
      }
      if (rally.result && rally.result !== publishedResult) {
        publishedResult = rally.result
        debug.contact.position.set(...rally.result.contactPoint)
        debug.ideal.position.set(...rally.result.idealPoint)
        debug.target.position.set(...rally.result.target)
        syncTargetLine(debug.line, rally.result.contactPoint, rally.result.target)
      }
      if (step.impact && rally.result) {
        spawnImpactEffect(rally.result.contactPoint, Math.max(0.2, rally.result.quality))
        trail.reset()
      }
    }

    function render(): void {
      syncShuttlecockMesh(shuttleGroup, rally.shuttle.pos, rally.shuttle.vel)
      trail.update(getShuttleCorkCenter(rally.shuttle.pos, rally.shuttle.vel))
      updateRacketGhost(racket, createRallyRacketPose(controls))
      setDebugVisible(debug, controls.debug)
      updateOverlay(overlay, controls, { landing: rally.landing, phase: rally.phase, result: rally.result })
    }

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      gui.destroy()
      trail.dispose()
      disposeObject(debug.contact)
      disposeObject(debug.ideal)
      disposeObject(debug.target)
      disposeLine(debug.line)
      disposeRacketGhost(racket)
      overlay.disposeLayout()
      cameraObserver?.disconnect()
      originalDispose()
    }

    return container
  },
}

export default meta

export const Default: StoryObj = {
  name: '真实击球点与时机',
}

function setContactCamera(camera: THREE.PerspectiveCamera, compact: boolean): void {
  camera.position.set(compact ? -10.2 : -7.8, compact ? 5.5 : 5.2, compact ? 8.8 : 6.8)
  camera.fov = compact ? 52 : 45
  camera.updateProjectionMatrix()
  camera.lookAt(-0.8, 1.15, 0)
}

function createOverlay(container: HTMLElement): ResponsiveOverlay {
  const overlay = document.createElement('div') as ResponsiveOverlay
  overlay.style.cssText = [
    'position:absolute',
    'left:12px',
    'top:12px',
    'z-index:12',
    'min-width:250px',
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
    overlay.style.bottom = compact ? '10px' : 'auto'
    overlay.style.minWidth = compact ? '0' : '250px'
    overlay.style.maxWidth = compact ? '205px' : '320px'
    overlay.style.font = compact
      ? '11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace'
      : '13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace'
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncLayout)
  observer?.observe(container)
  syncLayout()
  overlay.disposeLayout = () => observer?.disconnect()
  return overlay
}

function updateOverlay(overlay: HTMLDivElement, controls: Controls, diag: Diagnostics): void {
  const result = diag.result
  const technique = result?.technique ?? controls.technique
  const quality = result ? `${Math.round(result.quality * 100)}%` : '--'
  const sweet = result ? `${Math.round(result.sweetSpot * 100)}%` : '--'
  const fit = result ? `${Math.round(result.techniqueFit * 100)}%` : '--'
  const contactError = result ? `${(result.contactError * 100).toFixed(1)}cm` : '--'
  const landingPoint = result
    ? `${result.landingPoint[0].toFixed(2)}, ${result.landingPoint[2].toFixed(2)}`
    : '--'
  const net = result?.netClearance === null || result?.netClearance === undefined
    ? '--'
    : `${(result.netClearance * 100).toFixed(0)}cm`
  overlay.textContent = [
    `phase       ${diag.phase}`,
    `technique   ${technique}`,
    `timing      ${result?.timing ?? 'waiting'} (${controls.swingOffsetMs}ms)`,
    `quality     ${quality}`,
    `sweet spot  ${sweet}`,
    `contact err ${contactError}`,
    `tech fit    ${fit}`,
    `net clear   ${net}`,
    `landing x/z ${landingPoint}`,
    `outcome     ${result?.outcome ?? 'pending'} / ${diag.landing}`,
    `reason      ${result?.reason ?? 'approach'}`,
  ].join('\n')
}

function createGui(container: HTMLElement, controls: Controls): GUI {
  installGuiStyles()
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.top = '12px'
  host.style.right = '12px'
  host.style.zIndex = '20'
  container.appendChild(host)

  const gui = new GUI({ container: host, title: 'Contact Timing' })
  gui.add(controls, 'technique', TECHNIQUES).name('technique').onChange(() => controls.reset())
  gui.add(controls, 'swingOffsetMs', -320, 320, 5).name('timing ms').onChange(() => controls.reset())
  gui.add(controls, 'contactReachCm', -45, 45, 1).name('reach cm').onChange(() => controls.reset())
  gui.add(controls, 'contactHeightCm', -55, 85, 1).name('height cm').onChange(() => controls.reset())
  gui.add(controls, 'contactSideCm', -65, 65, 1).name('side cm').onChange(() => controls.reset())
  gui.add(controls, 'incomingSpeed', 8, 30, 0.5).name('incoming').onChange(() => controls.reset())
  gui.add(controls, 'power', 0.15, 1, 0.01).name('power')
  gui.add(controls, 'racketFaceDeg', -35, 35, 1).name('face deg').onChange(() => controls.reset())
  gui.add(controls, 'targetZ', -2.5, 2.5, 0.05).name('target z').onChange(() => controls.reset())
  gui.add(controls, 'debug').name('debug')
  gui.add(controls, 'paused').name('paused')
  gui.add(controls, 'reset').name('reset')
  requestAnimationFrame(() => {
    if (container.clientWidth < 640) gui.close()
  })
  return gui
}

function createDebugObjects() {
  const contact = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffdd55 }),
  )
  const ideal = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0x57f287, transparent: true, opacity: 0.8 }),
  )
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.025, 20),
    new THREE.MeshBasicMaterial({ color: 0xff77aa, transparent: true, opacity: 0.75 }),
  )
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.65 }),
  )
  return { contact, ideal, line, target }
}

function setDebugVisible(debug: ReturnType<typeof createDebugObjects>, visible: boolean): void {
  debug.contact.visible = visible
  debug.ideal.visible = visible
  debug.target.visible = visible
  debug.line.visible = visible
}

function syncTargetLine(line: THREE.Line, from: [number, number, number], to: [number, number, number]): void {
  line.geometry.dispose()
  line.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from[0], from[1], from[2]),
    new THREE.Vector3(to[0], 0.05, to[2]),
  ])
}

function updateRacketGhost(
  racket: THREE.Group,
  pose: RacketContactPose,
): void {
  const grip = new THREE.Vector3(...pose.gripPoint)
  const direction = new THREE.Vector3(...pose.shaftDirection)
  const faceNormal = new THREE.Vector3(...pose.faceNormal)
  syncRacketToGrip(racket, grip, direction, faceNormal)
}

function publish(diag: Diagnostics): void {
  ;(window as any).__badminton_rally_contact_ready__ = diag.result !== null
  ;(window as any).__badminton_rally_contact_diagnostics__ = {
    contactPoint: diag.result?.contactPoint ?? null,
    contactError: diag.result?.contactError ?? null,
    idealPoint: diag.result?.idealPoint ?? null,
    landingPoint: diag.result?.landingPoint ?? null,
    landing: diag.landing,
    outcome: diag.result?.outcome ?? null,
    quality: diag.result?.quality ?? null,
    netClearance: diag.result?.netClearance ?? null,
    sweetSpot: diag.result?.sweetSpot ?? null,
    technique: diag.result?.technique ?? null,
    timing: diag.result?.timing ?? null,
    outgoingVel: diag.result?.outgoingVel ?? null,
  }
}

function installGuiStyles(): void {
  if (document.getElementById('rally-contact-gui-style')) return
  const style = document.createElement('style')
  style.id = 'rally-contact-gui-style'
  style.textContent = `
    .lil-gui {
      --background-color: rgba(10, 14, 22, 0.9);
      --title-background-color: rgba(4, 8, 14, 0.95);
      --text-color: #eef4ff;
      --widget-color: rgba(255,255,255,0.12);
      --hover-color: rgba(255,255,255,0.18);
      --focus-color: rgba(255,255,255,0.24);
      --number-color: #57d4ff;
      --string-color: #b7f36f;
      --font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-size: 12px;
      --widget-height: 22px;
      color: var(--text-color);
      font-family: var(--font-family);
      font-size: var(--font-size);
      user-select: none;
    }
    .lil-gui.lil-root {
      width: 270px;
      background: var(--background-color);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 6px;
      overflow: hidden;
    }
    .lil-gui .lil-title {
      background: var(--title-background-color);
      padding: 8px 10px;
      font-weight: 700;
    }
    .lil-controller {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
    }
    .lil-controller .lil-name {
      flex: 0 0 82px;
      line-height: var(--widget-height);
      white-space: nowrap;
    }
    .lil-controller .lil-widget {
      flex: 1;
      min-height: var(--widget-height);
      display: flex;
      align-items: center;
    }
    .lil-controller input,
    .lil-controller select,
    .lil-controller button {
      width: 100%;
      min-height: var(--widget-height);
      border: 0;
      border-radius: 3px;
      background: var(--widget-color);
      color: var(--text-color);
      font: inherit;
      padding: 2px 6px;
    }
    .lil-controller input[type="checkbox"] {
      width: 16px;
      min-height: 16px;
    }
  `
  document.head.appendChild(style)
}

function disposeObject(object: THREE.Mesh): void {
  object.geometry.dispose()
  const material = object.material
  if (Array.isArray(material)) {
    for (const item of material) item.dispose()
  } else {
    material.dispose()
  }
}

function disposeLine(line: THREE.Line): void {
  line.geometry.dispose()
  const material = line.material
  if (Array.isArray(material)) {
    for (const item of material) item.dispose()
  } else {
    material.dispose()
  }
}

function disposeRacketGhost(racket: THREE.Group): void {
  for (const child of racket.children) {
    if (child instanceof THREE.Mesh) disposeObject(child)
  }
}
