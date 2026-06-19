import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createCourt } from '../render/court'
import {
  createShuttlecockMesh,
  getShuttlecockHeadCenter,
  hasShuttlecockHeadLanded,
  placeShuttlecockHeadOnGround,
  syncShuttlecockMesh,
} from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { mountScene } from './threeHelper'
import { launchShuttlecock, stepShuttlecock, DEFAULT_SHUTTLECOCK } from '../physics/shuttlecock'

interface TrajectoryArgs {
  speed: number
  angle: number
  heading: number
  trailOnly: boolean
}

const meta: Meta<TrajectoryArgs> = {
  title: 'Physics/羽球轨迹',
  tags: ['autodocs'],
  argTypes: {
    speed: { control: { type: 'range', min: 5, max: 30, step: 1 }, defaultValue: 15 },
    angle: { control: { type: 'range', min: 5, max: 60, step: 1 }, defaultValue: 22 },
    heading: { control: { type: 'range', min: 0, max: 180, step: 5 }, defaultValue: 90 },
    trailOnly: { control: 'boolean', defaultValue: false },
  },
  render: (args: TrajectoryArgs) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    // Info overlay
    const info = document.createElement('div')
    info.style.cssText = 'position:absolute;top:8px;left:8px;color:#8cf;font:14px monospace;z-index:10;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:4px;'
    info.textContent = `速度 ${args.speed}m/s · 仰角 ${args.angle}° · 方向 ${args.heading}°`
    container.appendChild(info)

    const ctx = mountScene(container)

    // Court
    createCourt(ctx.scene)

    // Shuttle + trail
    const shuttleGroup = args.trailOnly ? null : createShuttlecockMesh()
    if (shuttleGroup) ctx.scene.add(shuttleGroup)

    const trail = createTrailSystem(ctx.scene)
    trail.setVisible(true)

    // Launch shuttle
    let shuttle = launchShuttlecock([-4, 1, 0], args.speed, args.angle, args.heading)

    // Start dot
    const startMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.1, sizeAttenuation: true })
    const startGeo = new THREE.BufferGeometry()
    startGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-4, 1, 0]), 3))
    const startDot = new THREE.Points(startGeo, startMat)
    ctx.scene.add(startDot)

    // Animate physics
    let landed = false
    ctx.clock.start()

    function stepPhysics() {
      if (!ctx.animating) return
      requestAnimationFrame(stepPhysics)

      const dt = Math.min(ctx.clock.getDelta(), 1 / 30)

      if (!landed) {
        shuttle = stepShuttlecock(shuttle, dt, DEFAULT_SHUTTLECOCK, 8)
        trail.update(shuttle.pos)

        if (shuttleGroup) {
          syncShuttlecockMesh(shuttleGroup, shuttle.pos, shuttle.vel)
          shuttleGroup.visible = true
        }

        if (hasShuttlecockHeadLanded(shuttle.pos, shuttle.vel)) {
          landed = true
          shuttle = {
            ...shuttle,
            pos: placeShuttlecockHeadOnGround(shuttle.pos, shuttle.vel),
          }
          if (shuttleGroup) {
            syncShuttlecockMesh(shuttleGroup, shuttle.pos, shuttle.vel)
          }
          // Mark landing point
          const landMat = new THREE.PointsMaterial({ color: 0xff4444, size: 0.12, sizeAttenuation: true })
          const landGeo = new THREE.BufferGeometry()
          const headCenter = getShuttlecockHeadCenter(shuttle.pos, shuttle.vel)
          const landPos = new Float32Array([
            Math.max(-6.7, Math.min(6.7, headCenter[0])),
            0.02,
            Math.max(-3.05, Math.min(3.05, headCenter[2])),
          ])
          landGeo.setAttribute('position', new THREE.BufferAttribute(landPos, 3))
          const landDot = new THREE.Points(landGeo, landMat)
          ctx.scene.add(landDot)

          info.textContent += ` → 落点 (${landPos[0].toFixed(2)}, ${landPos[2].toFixed(2)})`
        }
      }

      // Camera follow
      if (!landed) {
        const [x, y, z] = shuttle.pos
        ctx.camera.position.set(x - 8, Math.max(y + 8, 6), z)
        ctx.camera.lookAt(x, Math.max(y, 1), z)
      }
    }
    stepPhysics()

    const origDispose = ctx.dispose
    ctx.dispose = () => {
      trail.dispose()
      origDispose()
    }

    return container
  },
}

export default meta
type Story = StoryObj<TrajectoryArgs>

export const HighServe: Story = {
  args: { speed: 16, angle: 34, heading: 90, trailOnly: false },
}

export const FastDrive: Story = {
  args: { speed: 18, angle: 12, heading: 90, trailOnly: false },
}

export const TrailOnly: Story = {
  args: { speed: 15, angle: 22, heading: 90, trailOnly: true },
}

export const CrossCourt: Story = {
  args: { speed: 14, angle: 20, heading: 70, trailOnly: false },
}
