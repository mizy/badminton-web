import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createScoreHUD } from '../render/scoreHUD'
import { mountScene } from './threeHelper'

type HudMode = 'rally' | 'deuce' | 'sets'

const meta: Meta<{ mode: HudMode }> = {
  title: '渲染/3D计分HUD',
  tags: ['autodocs'],
  argTypes: {
    mode: {
      control: 'select',
      options: ['rally', 'deuce', 'sets'],
      defaultValue: 'rally',
    },
  },
  render: (args: { mode: HudMode }) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    const ctx = mountScene(container)
    // Use a plain dark background to make the HUD pop
    ctx.scene.background = new THREE.Color(0x1a1a2e)

    const hud = createScoreHUD()
    ctx.scene.add(hud.mesh)

    // Cycle through score states
    const states: Array<{ home: number; away: number; setStr: string; rally: number; isDeuce: boolean }> = []
    if (args.mode === 'rally') {
      states.push(
        { home: 0, away: 0, setStr: 'S1  0-0', rally: 0, isDeuce: false },
        { home: 1, away: 0, setStr: 'S1  1-0', rally: 3, isDeuce: false },
        { home: 1, away: 2, setStr: 'S1  1-2', rally: 8, isDeuce: false },
        { home: 3, away: 3, setStr: 'S1  3-3', rally: 16, isDeuce: false },
        { home: 4, away: 3, setStr: 'S1  4-3', rally: 22, isDeuce: false },
      )
    } else if (args.mode === 'deuce') {
      states.push(
        { home: 5, away: 5, setStr: 'S1  5-5', rally: 28, isDeuce: true },
        { home: 6, away: 5, setStr: 'S1  6-5', rally: 30, isDeuce: false },
        { home: 6, away: 6, setStr: 'S1  6-6', rally: 34, isDeuce: true },
        { home: 7, away: 6, setStr: 'S1  7-6', rally: 38, isDeuce: false },
      )
    } else {
      states.push(
        { home: 4, away: 1, setStr: 'S1  21-18  |  S2  4-1', rally: 12, isDeuce: false },
        { home: 4, away: 1, setStr: 'S1  21-18  |  S2  8-5', rally: 18, isDeuce: false },
        { home: 4, away: 1, setStr: 'S1  21-18  |  S2  15-12', rally: 24, isDeuce: false },
        { home: 4, away: 1, setStr: 'S1  21-18  |  S2  21-19', rally: 30, isDeuce: false },
      )
    }

    // Auto-rotate camera for viewing from different angles
    let angle = 0
    function orbit() {
      if (!ctx.animating) return
      requestAnimationFrame(orbit)
      angle += 0.003
      const r = 10
      ctx.camera.position.set(r * Math.sin(angle), 4, r * Math.cos(angle))
      ctx.camera.lookAt(0, 3, 0)
    }
    orbit()

    // Cycle through score states every 1.5s
    let stateIndex = 0
    hud.update(states[0].home, states[0].away, states[0].setStr, states[0].rally, states[0].isDeuce)

    setInterval(() => {
      stateIndex = (stateIndex + 1) % states.length
      const s = states[stateIndex]
      hud.update(s.home, s.away, s.setStr, s.rally, s.isDeuce)
    }, 1500)

    // Sync HUD position (fixed above center)
    const dummyCamera = new THREE.PerspectiveCamera()
    hud.syncPosition(dummyCamera)

    return container
  },
}

export default meta
export const RallyMode: StoryObj = { args: { mode: 'rally' } }
export const DeuceMode: StoryObj = { args: { mode: 'deuce' } }
export const SetsMode: StoryObj = { args: { mode: 'sets' } }
