/** 羽球轨迹示踪 — 飞行路径线 + 间隔点 */

import * as THREE from 'three'

const MAX_POINTS = 400
const DOT_INTERVAL = 10

export interface TrailSystem {
  update: (pos: [number, number, number]) => void
  reset: () => void
  setVisible: (v: boolean) => void
  dispose: () => void
}

export function createTrailSystem(scene: THREE.Scene): TrailSystem {
  const positions: number[] = []

  // --- Trajectory line ---
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.5,
  })
  const lineGeo = new THREE.BufferGeometry()
  const line = new THREE.Line(lineGeo, lineMat)
  scene.add(line)

  // --- Dots at intervals ---
  const dotMat = new THREE.PointsMaterial({
    color: 0x00ffcc,
    size: 0.18,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  })
  const dotGeo = new THREE.BufferGeometry()
  const dots = new THREE.Points(dotGeo, dotMat)
  scene.add(dots)

  // --- Glow dots (larger, more transparent) ---
  const glowDotMat = new THREE.PointsMaterial({
    color: 0x66eeff,
    size: 0.35,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
  })
  const glowDotGeo = new THREE.BufferGeometry()
  const glowDots = new THREE.Points(glowDotGeo, glowDotMat)
  scene.add(glowDots)

  function updateGeometry() {
    const floatArr = new Float32Array(positions)
    line.geometry.setAttribute('position', new THREE.BufferAttribute(floatArr, 3))
    line.geometry.setDrawRange(0, positions.length / 3)

    const dotPositions: number[] = []
    const glowPositions: number[] = []
    for (let i = 0; i < positions.length; i += 3) {
      if ((i / 3) % DOT_INTERVAL === 0) {
        dotPositions.push(positions[i], positions[i + 1], positions[i + 2])
      }
      if ((i / 3) % (DOT_INTERVAL * 3) === 0) {
        glowPositions.push(positions[i], positions[i + 1], positions[i + 2])
      }
    }
    dots.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dotPositions), 3))
    dots.geometry.setDrawRange(0, dotPositions.length / 3)
    glowDots.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowPositions), 3))
    glowDots.geometry.setDrawRange(0, glowPositions.length / 3)
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
      dots.visible = v
      glowDots.visible = v
    },
    dispose() {
      scene.remove(line)
      scene.remove(dots)
      scene.remove(glowDots)
      line.geometry.dispose()
      lineMat.dispose()
      dotGeo.dispose()
      dotMat.dispose()
      glowDotGeo.dispose()
      glowDotMat.dispose()
    },
  }
}
