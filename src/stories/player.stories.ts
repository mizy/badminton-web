import type { Meta, StoryObj } from '@storybook/html'
import { createPlayerMesh, createGroundMarker } from '../render/playerMesh'
import { createCourt } from '../render/court'
import { mountScene } from './threeHelper'

const meta: Meta = {
  title: '渲染/球员展示',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    // Legend
    const legend = document.createElement('div')
    legend.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;background:rgba(0,0,0,0.7);padding:10px 14px;border-radius:6px;font:13px monospace;color:#fff;'
    legend.innerHTML = `
      <div style="color:#00ddff">● 主场 (Player A) — 蓝/青色</div>
      <div style="color:#ff2255">● 客场 (Player B) — 红/粉色</div>
    `
    container.appendChild(legend)

    const ctx = mountScene(container)
    createCourt(ctx.scene)

    // Home player (left side, behind net)
    const homeMesh = createPlayerMesh({
      body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff,
    }, 'A')
    homeMesh.position.set(-3, 0, 0)
    ctx.scene.add(homeMesh)

    const homeMarker = createGroundMarker(0x00ddff)
    homeMarker.position.set(-3, 0.02, 0)
    ctx.scene.add(homeMarker)

    // Away player (right side, behind net)
    const awayMesh = createPlayerMesh({
      body: 0xff2255, head: 0xffcc99, racket: 0xcccccc, marker: 0xff44aa,
    }, 'B')
    awayMesh.position.set(3, 0, 0)
    ctx.scene.add(awayMesh)

    const awayMarker = createGroundMarker(0xff2255)
    awayMarker.position.set(3, 0.02, 0)
    ctx.scene.add(awayMarker)

    // Stationary camera
    ctx.camera.position.set(0, 5, 8)
    ctx.camera.lookAt(0, 1, 0)

    // Animate players gently swaying
    let t = 0
    function sway() {
      if (!ctx.animating) return
      requestAnimationFrame(sway)
      t += 0.02
      const bob = Math.sin(t) * 0.05
      homeMesh.position.y = bob
      awayMesh.position.y = -bob
    }
    sway()

    return container
  },
}

export default meta
export const Default: StoryObj = {}
