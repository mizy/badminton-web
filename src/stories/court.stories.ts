import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createCourt } from '../render/court'
import { createShuttlecockMesh } from '../render/shuttlecockMesh'
import { mountScene } from './threeHelper'

const meta: Meta = {
  title: 'Scene/球场与羽球',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    const ctx = mountScene(container)
    ctx.camera.position.set(-11.5, 6.4, 8.2)
    ctx.camera.lookAt(0, 0.8, 0)

    const arena = createCourt(ctx.scene)

    // Place shuttle at center
    const shuttleGroup = createShuttlecockMesh()
    shuttleGroup.position.set(-2.4, 1.5, -1.1)
    ctx.scene.add(shuttleGroup)

    // Add some reference markers
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.3 })
    const markerGeo = new THREE.SphereGeometry(0.05, 8, 6)
    const servePos = new THREE.Mesh(markerGeo, markerMat)
    servePos.position.set(-4, 0.05, 0)
    ctx.scene.add(servePos)

    function animateArena() {
      if (!ctx.animating) return
      requestAnimationFrame(animateArena)
      arena.update(ctx.clock.getElapsedTime(), 0)
    }
    requestAnimationFrame(animateArena)

    return container
  },
}

export default meta

export const Default: StoryObj = {}

export const ArenaReactions: StoryObj = {
  render: () => {
    const container = document.createElement('div')
    container.style.cssText = 'width:100%;height:600px;position:relative'
    const controls = document.createElement('div')
    controls.style.cssText = 'position:absolute;z-index:4;top:16px;left:16px;display:flex;gap:8px'
    const ctx = mountScene(container)
    ctx.camera.position.set(-7.8, 2.5, -7)
    ctx.camera.lookAt(-4, 1, -3.8)
    const arena = createCourt(ctx.scene)
    let rallyHits = 12
    for (const [label, reason] of [['长回合主场得分', 'in'], ['出界判罚', 'out']] as const) {
      const button = document.createElement('button')
      button.textContent = label
      button.style.cssText = 'padding:9px 12px;border:0;border-radius:6px;background:#edf3ec;color:#14332e;cursor:pointer'
      button.addEventListener('click', () => arena.reactToPoint({ reason, rallyHits, winnerSide: 0 }))
      controls.appendChild(button)
    }
    container.appendChild(controls)
    function animateArena() {
      if (!ctx.animating) return
      requestAnimationFrame(animateArena)
      const elapsed = ctx.clock.getElapsedTime()
      arena.update(elapsed, rallyHits)
      if (elapsed > 3) rallyHits = 0
    }
    requestAnimationFrame(animateArena)
    return container
  },
}
