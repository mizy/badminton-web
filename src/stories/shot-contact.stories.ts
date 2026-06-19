import type { Meta, StoryObj } from '@storybook/html'
import GUI from 'lil-gui'
import * as THREE from 'three'
import type { ShotType } from '../character/shotSynthesis'
import { SPEED_77_SHUTTLECOCK, stepShuttlecock, type ShuttlecockState } from '../physics/shuttlecock'
import { createCourt } from '../render/court'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { createPlayerMesh, updatePlayerMesh } from '../render/playerMesh'
import {
  createShuttlecockMesh,
  getShuttlecockHeadGroundClearance,
  hasShuttlecockHeadLanded,
  placeShuttlecockHeadOnGround,
  syncShuttlecockMesh,
} from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { mountScene } from './threeHelper'

type ShotContactPhase = 'incoming' | 'landed' | 'outgoing'

interface ShotContactControls {
  incomingSpeed: number
  paused: boolean
  power: number
  reset: () => void
  shotType: ShotType
  showDebug: boolean
  timingOffsetMs: number
}

const SHOT_TYPES: ShotType[] = ['CLEAR', 'DRIVE', 'DROP', 'SMASH', 'NET_DROP', 'LIFT']
const INCOMING_START: [number, number, number] = [-4.9, 1.85, -0.95]
const CONTACT_ANCHOR: [number, number, number] = [-2.25, 1.42, -0.18]

const meta: Meta = {
  title: 'Play/Shot Contact Smoke',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '680px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'

    const ctx = mountScene(container)
    ctx.camera.position.set(-7.5, 5.3, 6.6)
    ctx.camera.lookAt(-1.2, 1.35, 0)
    createCourt(ctx.scene)

    const controls: ShotContactControls = {
      incomingSpeed: 17,
      paused: false,
      power: 0.78,
      reset: () => reset(),
      shotType: 'DRIVE',
      showDebug: false,
      timingOffsetMs: 0,
    }

    const player = createPlayerMesh(
      { body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff },
      'A',
      { glowScale: 0, labelScale: 0 },
    )
    updatePlayerMesh(player, [-2.55, 0, -0.38], 0)
    ctx.scene.add(player)

    const shuttleGroup = createShuttlecockMesh()
    ctx.scene.add(shuttleGroup)

    const swingRacket = createSwingRacket()
    ctx.scene.add(swingRacket)

    const contactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.7 }),
    )
    contactMarker.visible = false
    ctx.scene.add(contactMarker)

    const hitZone = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.56, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xffdd55,
        transparent: true,
        opacity: 0.12,
        wireframe: true,
      }),
    )
    hitZone.position.set(CONTACT_ANCHOR[0], CONTACT_ANCHOR[1], CONTACT_ANCHOR[2])
    hitZone.visible = false
    ctx.scene.add(hitZone)

    const trail = createTrailSystem(ctx.scene)
    const gui = createGui(container, controls)

    let phase: ShotContactPhase = 'incoming'
    let phaseTime = 0
    let contactTime = 0
    let shuttle = createIncomingShuttle(controls)
    let contactPoint: [number, number, number] = [...CONTACT_ANCHOR]
    reset()
    ;(window as any).__badminton_shot_contact_ready__ = false

    function reset() {
      phase = 'incoming'
      phaseTime = 0
      contactTime = Math.max(0.14, 0.31 + controls.timingOffsetMs / 1000)
      shuttle = createIncomingShuttle(controls)
      contactPoint = [...CONTACT_ANCHOR]
      contactMarker.visible = controls.showDebug
      hitZone.visible = controls.showDebug
      trail.reset()
    }

    function step() {
      if (!ctx.animating) return
      requestAnimationFrame(step)
      updateEffects(performance.now(), ctx.scene)

      if (controls.paused) {
        renderState()
        return
      }

      const dt = Math.min(ctx.clock.getDelta(), 1 / 45)
      phaseTime += dt

      if (phase === 'landed') {
        if (phaseTime > 0.8) reset()
        renderState()
        ;(window as any).__badminton_shot_contact_ready__ = true
        return
      }

      shuttle = stepShuttlecock(shuttle, dt, SPEED_77_SHUTTLECOCK, 8)

      if (phase === 'incoming' && phaseTime >= contactTime) {
        hitShuttle()
      }

      const headLanded = hasShuttlecockHeadLanded(shuttle.pos, shuttle.vel)
      if (phase === 'outgoing' && headLanded) {
        shuttle = {
          ...shuttle,
          pos: placeShuttlecockHeadOnGround(shuttle.pos, shuttle.vel),
        }
        phase = 'landed'
        phaseTime = 0
        ;(window as any).__badminton_shot_contact_last_landing_clearance__ =
          getShuttlecockHeadGroundClearance(shuttle.pos, shuttle.vel)
      }
      if (phase === 'outgoing' && phaseTime > 6) {
        reset()
      }

      renderState()
      ;(window as any).__badminton_shot_contact_ready__ = true
    }
    step()

    function hitShuttle() {
      phase = 'outgoing'
      phaseTime = 0
      contactPoint = [...shuttle.pos]
      contactMarker.position.set(contactPoint[0], contactPoint[1], contactPoint[2])
      spawnImpactEffect(contactPoint, controls.power)
      shuttle = {
        ...shuttle,
        vel: computeOutgoingVelocity(contactPoint, controls),
        spin: [0, 70, 0],
      }
    }

    function renderState() {
      syncShuttlecockMesh(shuttleGroup, shuttle.pos, shuttle.vel)
      trail.update(shuttle.pos)
      updateSwingRacket(swingRacket, phase, phaseTime, contactTime)
      contactMarker.visible = controls.showDebug
      hitZone.visible = controls.showDebug
    }

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      gui.destroy()
      trail.dispose()
      disposeMesh(contactMarker)
      disposeMesh(hitZone)
      disposeSwingRacket(swingRacket)
      originalDispose()
    }

    return container
  },
}

export default meta

type Story = StoryObj

export const Default: Story = {
  name: '击球瞬间',
}

function createGui(container: HTMLElement, controls: ShotContactControls): GUI {
  installGuiStyles()

  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.top = '12px'
  host.style.right = '12px'
  host.style.zIndex = '20'
  container.appendChild(host)

  const gui = new GUI({ container: host, title: 'Shot Contact' })
  gui.add(controls, 'shotType', SHOT_TYPES).name('shot')
  gui.add(controls, 'power', 0.1, 1, 0.01).name('power')
  gui.add(controls, 'incomingSpeed', 8, 28, 0.5).name('incoming')
  gui.add(controls, 'timingOffsetMs', -140, 140, 5).name('timing ms')
  gui.add(controls, 'showDebug').name('debug')
  gui.add(controls, 'paused').name('paused')
  gui.add(controls, 'reset').name('reset')

  for (const controller of gui.controllersRecursive()) {
    if (controller.property !== 'paused' && controller.property !== 'showDebug') {
      controller.onChange(() => controls.reset())
    }
  }

  return gui
}

function installGuiStyles(): void {
  if (document.getElementById('shot-contact-lil-gui-style')) return

  const style = document.createElement('style')
  style.id = 'shot-contact-lil-gui-style'
  style.textContent = `
    .lil-gui {
      --background-color: rgba(10, 14, 22, 0.88);
      --title-background-color: rgba(4, 8, 14, 0.94);
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
    .lil-gui, .lil-gui * { box-sizing: border-box; }
    .lil-gui.lil-root {
      width: 260px;
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
      flex: 0 0 84px;
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
    .lil-controller input[type="number"] {
      color: var(--number-color);
      text-align: right;
    }
    .lil-controller button {
      cursor: pointer;
      text-align: left;
    }
    .lil-controller input:hover,
    .lil-controller select:hover,
    .lil-controller button:hover {
      background: var(--hover-color);
    }
  `
  document.head.appendChild(style)
}

function createIncomingShuttle(controls: ShotContactControls): ShuttlecockState {
  const direction = vectorBetween(INCOMING_START, CONTACT_ANCHOR)
  return {
    pos: [...INCOMING_START],
    spin: [0, 45, 0],
    vel: [
      direction[0] * controls.incomingSpeed,
      direction[1] * controls.incomingSpeed,
      direction[2] * controls.incomingSpeed,
    ],
  }
}

function computeOutgoingVelocity(
  contactPoint: [number, number, number],
  controls: ShotContactControls,
): [number, number, number] {
  const timingQuality = THREE.MathUtils.clamp(1 - Math.abs(controls.timingOffsetMs) / 180, 0.35, 1)
  const speed = shotBaseSpeed(controls.shotType) * (0.45 + 0.55 * controls.power) * timingQuality
  const elevation = shotElevation(controls.shotType) * Math.PI / 180
  const target = shotTarget(controls.shotType)
  const horizontal = vectorBetween([contactPoint[0], 0, contactPoint[2]], [target[0], 0, target[2]])
  const horizontalSpeed = speed * Math.cos(elevation)

  return [
    horizontal[0] * horizontalSpeed,
    speed * Math.sin(elevation),
    horizontal[2] * horizontalSpeed,
  ]
}

function shotBaseSpeed(type: ShotType): number {
  switch (type) {
    case 'SMASH': return 38
    case 'DRIVE': return 18
    case 'DROP': return 14
    case 'NET_DROP': return 7
    case 'LIFT': return 16
    case 'CLEAR':
    default: return 14
  }
}

function shotElevation(type: ShotType): number {
  switch (type) {
    case 'SMASH': return -7
    case 'DRIVE': return 8
    case 'DROP': return 24
    case 'NET_DROP': return 10
    case 'LIFT': return 50
    case 'CLEAR':
    default: return 38
  }
}

function shotTarget(type: ShotType): [number, number, number] {
  switch (type) {
    case 'DROP': return [1.0, 0, 0.75]
    case 'NET_DROP': return [0.55, 0, 0.45]
    case 'DRIVE': return [4.2, 0, -0.45]
    case 'SMASH': return [3.6, 0, 0.2]
    case 'LIFT': return [4.8, 0, 1.1]
    case 'CLEAR':
    default: return [4.2, 0, 0.7]
  }
}

function vectorBetween(
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dy, dz) || 1
  return [dx / length, dy / length, dz / length]
}

function createSwingRacket(): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.42, metalness: 0.1 })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 10), material)
  handle.position.y = -0.26
  group.add(handle)

  const head = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 22), material)
  head.position.y = 0.18
  head.scale.x = 0.78
  group.add(head)
  return group
}

function updateSwingRacket(
  racket: THREE.Group,
  phase: ShotContactPhase,
  phaseTime: number,
  contactTime: number,
): void {
  const t = phase === 'incoming'
    ? THREE.MathUtils.clamp(phaseTime / contactTime, 0, 1)
    : THREE.MathUtils.clamp(1 + phaseTime / 0.34, 1, 1.25)
  racket.position.set(CONTACT_ANCHOR[0] - 0.18, CONTACT_ANCHOR[1] - 0.04, CONTACT_ANCHOR[2] - 0.12)
  racket.rotation.set(0.18, 0.32, THREE.MathUtils.lerp(-0.85, 0.55, t))
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  const material = mesh.material
  if (Array.isArray(material)) {
    for (const item of material) item.dispose()
  } else {
    material.dispose()
  }
}

function disposeSwingRacket(racket: THREE.Group): void {
  for (const child of racket.children) {
    if (child instanceof THREE.Mesh) disposeMesh(child)
  }
}
