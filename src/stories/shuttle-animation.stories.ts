import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import {
  SPEED_77_SHUTTLECOCK,
  launchShuttlecock,
  stepShuttlecock,
  type ShuttlecockState,
} from '../physics/shuttlecock'
import { createCourt } from '../render/court'
import {
  createShuttlecockMesh,
  getShuttlecockHeadGroundClearance,
  hasShuttlecockHeadLanded,
  placeShuttlecockHeadOnGround,
  syncShuttlecockMesh,
} from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { mountScene } from './threeHelper'

interface ShuttleAnimationArgs {
  angle: number
  heading: number
  showTangent: boolean
  speed: number
}

const ORIGIN: [number, number, number] = [-5.2, 1.05, -1.7]

const meta: Meta<ShuttleAnimationArgs> = {
  title: 'Render/Shuttle Animation',
  tags: ['autodocs'],
  argTypes: {
    speed: { control: { type: 'range', min: 8, max: 30, step: 1 } },
    angle: { control: { type: 'range', min: 6, max: 55, step: 1 } },
    heading: { control: { type: 'range', min: 35, max: 120, step: 5 } },
    showTangent: { control: 'boolean' },
  },
  render: (args: ShuttleAnimationArgs) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '640px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'

    const ctx = mountScene(container)
    ctx.camera.position.set(-10.2, 8.4, 9.0)
    ctx.camera.lookAt(-1.0, 2.8, 0)

    createCourt(ctx.scene)

    const shuttleGroup = createShuttlecockMesh()
    ctx.scene.add(shuttleGroup)

    const trail = createTrailSystem(ctx.scene)
    const tangentArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      0.62,
      0xffdd66,
      0.12,
      0.06,
    )
    tangentArrow.visible = args.showTangent
    ctx.scene.add(tangentArrow)

    let shuttle = launch(args)
    let elapsed = 0
    let initialSpeed = speedOf(shuttle.vel)
    let landedHoldSeconds = 0
    let sampleCount = 0
    ;(window as any).__badminton_shuttle_animation_ready__ = false

    function restart() {
      shuttle = launch(args)
      elapsed = 0
      initialSpeed = speedOf(shuttle.vel)
      landedHoldSeconds = 0
      sampleCount = 0
      trail.reset()
    }

    function step() {
      if (!ctx.animating) return
      requestAnimationFrame(step)

      const dt = Math.min(ctx.clock.getDelta(), 1 / 45)

      if (landedHoldSeconds > 0) {
        landedHoldSeconds -= dt
        if (landedHoldSeconds <= 0) restart()
        return
      }

      elapsed += dt
      shuttle = stepShuttlecock(shuttle, dt, SPEED_77_SHUTTLECOCK, 8)
      const headLanded = hasShuttlecockHeadLanded(shuttle.pos, shuttle.vel)
      if (headLanded) {
        shuttle = {
          ...shuttle,
          pos: placeShuttlecockHeadOnGround(shuttle.pos, shuttle.vel),
        }
        landedHoldSeconds = 0.8
      }

      syncShuttlecockMesh(shuttleGroup, shuttle.pos, shuttle.vel)
      publishAlignmentError(shuttleGroup, shuttle)
      publishDecayStats(shuttle, elapsed, initialSpeed)
      trail.update(shuttle.pos)
      syncTangentArrow(tangentArrow, shuttle, args.showTangent)

      sampleCount++
      if (sampleCount > 12) {
        ;(window as any).__badminton_shuttle_animation_ready__ = true
      }
      if (headLanded) {
        ;(window as any).__badminton_shuttle_last_landing_clearance__ =
          getShuttlecockHeadGroundClearance(shuttle.pos, shuttle.vel)
      }
      if (headLanded || elapsed > 6) restart()
    }
    step()

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      trail.dispose()
      ctx.scene.remove(tangentArrow)
      disposeTangentArrow(tangentArrow)
      originalDispose()
    }

    return container
  },
}

export default meta

type Story = StoryObj<ShuttleAnimationArgs>

export const CometTrail: Story = {
  name: '球头切线 / 彗星轨迹',
  args: {
    angle: 26,
    heading: 72,
    showTangent: false,
    speed: 18,
  },
}

export const Speed77Decay: Story = {
  name: '77速自然下落 / 衰减',
  args: {
    angle: 26,
    heading: 72,
    showTangent: false,
    speed: 18,
  },
}

export const TangentDebug: Story = {
  name: '切线方向调试',
  args: {
    angle: 26,
    heading: 72,
    showTangent: true,
    speed: 18,
  },
}

function launch(args: ShuttleAnimationArgs): ShuttlecockState {
  return launchShuttlecock(ORIGIN, args.speed, args.angle, args.heading)
}

function speedOf(velocity: [number, number, number]): number {
  return Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2)
}

function syncTangentArrow(
  arrow: THREE.ArrowHelper,
  shuttle: ShuttlecockState,
  visible: boolean,
): void {
  arrow.visible = visible
  if (!visible) return

  const direction = new THREE.Vector3(shuttle.vel[0], shuttle.vel[1], shuttle.vel[2])
  if (direction.lengthSq() < 0.000001) return
  direction.normalize()
  arrow.position.set(shuttle.pos[0], shuttle.pos[1], shuttle.pos[2])
  arrow.setDirection(direction)
}

function publishAlignmentError(group: THREE.Group, shuttle: ShuttlecockState): void {
  const velocity = new THREE.Vector3(shuttle.vel[0], shuttle.vel[1], shuttle.vel[2])
  if (velocity.lengthSq() < 0.000001) return

  const headDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).normalize()
  const errorDeg = headDirection.angleTo(velocity.normalize()) * 180 / Math.PI
  ;(window as any).__badminton_shuttle_alignment_error_deg__ = errorDeg
}

function publishDecayStats(
  shuttle: ShuttlecockState,
  elapsed: number,
  initialSpeed: number,
): void {
  const currentSpeed = speedOf(shuttle.vel)
  ;(window as any).__badminton_shuttle_decay__ = {
    currentSpeed,
    elapsed,
    headClearance: getShuttlecockHeadGroundClearance(shuttle.pos, shuttle.vel),
    height: shuttle.pos[1],
    initialSpeed,
    speedRatio: initialSpeed <= 0 ? 0 : currentSpeed / initialSpeed,
  }
}

function disposeTangentArrow(arrow: THREE.ArrowHelper): void {
  arrow.line.geometry.dispose()
  arrow.cone.geometry.dispose()
  ;(arrow.line.material as THREE.Material).dispose()
  ;(arrow.cone.material as THREE.Material).dispose()
}
