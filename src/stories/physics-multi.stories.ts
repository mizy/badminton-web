import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createCourt } from '../render/court'
import { mountScene } from './threeHelper'
import { launchShuttlecock, stepShuttlecock, DEFAULT_SHUTTLECOCK } from '../physics/shuttlecock'

interface MultiArgs {}

/** 多条轨迹对比 — 不同角度/速度 */
const TRAJECTORIES = [
  { speed: 15, angle: 22, heading: 90, color: 0x00ffcc, label: '高远球 15m/s 22°' },
  { speed: 28, angle: 12, heading: 90, color: 0xff6644, label: '平抽 28m/s 12°' },
  { speed: 10, angle: 35, heading: 90, color: 0xffcc00, label: '吊球 10m/s 35°' },
  { speed: 18, angle: 45, heading: 90, color: 0xcc66ff, label: '高远球 18m/s 45°' },
]

const meta: Meta<MultiArgs> = {
  title: 'Physics/多条轨迹对比',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    // Legend overlay
    const legend = document.createElement('div')
    legend.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;background:rgba(0,0,0,0.7);padding:10px 14px;border-radius:6px;font:13px monospace;'
    legend.innerHTML = TRAJECTORIES.map(t =>
      `<div style="color:#${t.color.toString(16).padStart(6, '0')};">● ${t.label}</div>`
    ).join('')
    container.appendChild(legend)

    const ctx = mountScene(container)
    createCourt(ctx.scene)

    const colors = TRAJECTORIES.map(t => new THREE.Color(t.color))
    const trails: THREE.Line[] = []
    const trajPositions: [number, number, number][][] = []
    const states = TRAJECTORIES.map(t =>
      launchShuttlecock([-4, 1, 0], t.speed, t.angle, t.heading)
    )

    // Create trail lines
    for (let i = 0; i < TRAJECTORIES.length; i++) {
      const mat = new THREE.LineBasicMaterial({ color: colors[i], transparent: true, opacity: 0.6 })
      const geo = new THREE.BufferGeometry()
      const positions = new Float32Array(900) // 300 points max
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setDrawRange(0, 0)
      const line = new THREE.Line(geo, mat)
      ctx.scene.add(line)
      trails.push(line)
      trajPositions.push([])
    }

    const finished = new Set<number>()

    function step() {
      if (!ctx.animating) return
      requestAnimationFrame(step)

      for (let i = 0; i < states.length; i++) {
        if (finished.has(i)) continue

        const s = states[i]
        const next = stepShuttlecock(s, 1 / 60, DEFAULT_SHUTTLECOCK, 8)
        states[i] = next

        if (next.pos[1] > 0) {
          trajPositions[i].push([next.pos[0], next.pos[1], next.pos[2]])
        }

        if (next.pos[1] <= 0 || trajPositions[i].length >= 250) {
          finished.add(i)
          // Mark landing
          const landMat = new THREE.PointsMaterial({ color: colors[i], size: 0.1 })
          const landGeo = new THREE.BufferGeometry()
          const p = trajPositions[i][trajPositions[i].length - 1]
          landGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([p[0], 0.02, p[2]]), 3))
          const dot = new THREE.Points(landGeo, landMat)
          ctx.scene.add(dot)
        }

        // Update trail geometry
        const pos = trajPositions[i]
        const arr = trails[i].geometry.attributes.position.array as Float32Array
        for (let j = 0; j < pos.length && j < 300; j++) {
          arr[j * 3] = pos[j][0]
          arr[j * 3 + 1] = pos[j][1]
          arr[j * 3 + 2] = pos[j][2]
        }
        trails[i].geometry.setDrawRange(0, Math.min(pos.length, 300))
        trails[i].geometry.attributes.position.needsUpdate = true
      }
    }
    step()

    // Orbit-like camera
    let angle = 0
    function orbit() {
      if (!ctx.animating) return
      requestAnimationFrame(orbit)
      angle += 0.002
      const r = 14
      ctx.camera.position.set(r * Math.cos(angle), 8, r * Math.sin(angle))
      ctx.camera.lookAt(0, 1.5, 0)
    }
    orbit()

    return container
  },
}

export default meta
type Story = StoryObj<MultiArgs>

export const AllTrajectories: Story = {}
