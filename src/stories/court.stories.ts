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

    // Build court
    createCourt(ctx.scene)

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

    // Store cleanup
    const origDispose = ctx.dispose
    ctx.dispose = () => {
      origDispose()
    }

    return container
  },
}

export default meta

export const Default: StoryObj = {}
