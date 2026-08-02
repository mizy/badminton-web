/** 羽球轨迹示踪 — 头亮尾淡的彗星状飞行路径 */

import * as THREE from 'three'

const MAX_POINTS = 100
const PARTICLE_INTERVAL = 2
const TRAIL_COLOR = [0.0, 1.0, 0.82] as const

export interface TrailSystem {
  update: (pos: [number, number, number]) => void
  reset: () => void
  setVisible: (v: boolean) => void
  dispose: () => void
}

export function createTrailSystem(scene: THREE.Scene): TrailSystem {
  const positions: number[] = []

  const lineMat = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.82,
    vertexColors: true,
  })
  const lineGeo = new THREE.BufferGeometry()
  const line = new THREE.Line(lineGeo, lineMat)
  scene.add(line)

  const particleMat = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.7,
    size: 0.07,
    sizeAttenuation: true,
    transparent: true,
    vertexColors: true,
  })
  const particleGeo = new THREE.BufferGeometry()
  const particles = new THREE.Points(particleGeo, particleMat)
  scene.add(particles)

  const headGlowCanvas = document.createElement('canvas')
  headGlowCanvas.width = 128
  headGlowCanvas.height = 128
  const ctx = headGlowCanvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255, 255, 210, 0.9)')
  gradient.addColorStop(0.22, 'rgba(0, 255, 210, 0.55)')
  gradient.addColorStop(0.52, 'rgba(0, 180, 255, 0.18)')
  gradient.addColorStop(1, 'rgba(0, 180, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const headGlowTexture = new THREE.CanvasTexture(headGlowCanvas)
  const headGlowMat = new THREE.SpriteMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: headGlowTexture,
    opacity: 0.72,
    transparent: true,
  })
  const headGlow = new THREE.Sprite(headGlowMat)
  headGlow.scale.set(0.2, 0.2, 1)
  headGlow.visible = false
  scene.add(headGlow)

  function writeCometColors(colors: number[], age01: number): void {
    const intensity = 0.05 + 0.95 * Math.pow(age01, 2.2)
    colors.push(
      TRAIL_COLOR[0] * intensity,
      TRAIL_COLOR[1] * intensity,
      TRAIL_COLOR[2] * intensity,
    )
  }

  function updateGeometry() {
    const pointCount = positions.length / 3
    const lineColors: number[] = []
    const particlePositions: number[] = []
    const particleColors: number[] = []

    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const age01 = pointCount <= 1 ? 1 : pointIndex / (pointCount - 1)
      writeCometColors(lineColors, age01)

      if (pointIndex % PARTICLE_INTERVAL === 0 || pointIndex === pointCount - 1) {
        const offset = pointIndex * 3
        particlePositions.push(positions[offset], positions[offset + 1], positions[offset + 2])
        writeCometColors(particleColors, age01)
      }
    }

    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lineColors), 3))
    lineGeo.setDrawRange(0, pointCount)

    particleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particlePositions), 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(particleColors), 3))
    particleGeo.setDrawRange(0, particlePositions.length / 3)

    if (pointCount > 0) {
      const last = positions.length - 3
      headGlow.position.set(positions[last], positions[last + 1], positions[last + 2])
      headGlow.visible = line.visible
    } else {
      headGlow.visible = false
    }
  }

  return {
    update(pos: [number, number, number]) {
      positions.push(pos[0], pos[1], pos[2])
      while (positions.length > MAX_POINTS * 3) {
        positions.splice(0, 3)
      }
      updateGeometry()
    },
    reset() {
      positions.length = 0
      updateGeometry()
    },
    setVisible(v: boolean) {
      line.visible = v
      particles.visible = v
      headGlow.visible = v && positions.length > 0
    },
    dispose() {
      scene.remove(line)
      scene.remove(particles)
      scene.remove(headGlow)
      lineGeo.dispose()
      lineMat.dispose()
      particleGeo.dispose()
      particleMat.dispose()
      headGlowTexture.dispose()
      headGlowMat.dispose()
    },
  }
}
