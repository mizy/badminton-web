/** 视觉特效 — 冲击波环 + 闪白（用于击球反馈，确保视频可见） */

import * as THREE from 'three'

export interface ImpactEffect {
  mesh: THREE.Mesh
  startTime: number
  duration: number
}

const activeEffects: ImpactEffect[] = []

export function spawnImpactEffect(
  pos: [number, number, number],
  _intensity: number = 1,
): ImpactEffect {
  const ringGeo = new THREE.RingGeometry(0.1, 0.5, 16)
  const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  }))
  mesh.position.set(pos[0], pos[1] + 0.2, pos[2])
  mesh.rotation.x = -Math.PI / 2
  const effect: ImpactEffect = {
    mesh,
    startTime: performance.now(),
    duration: 400,
  }
  activeEffects.push(effect)
  return effect
}

export function updateEffects(
  _now: number,
  scene: THREE.Scene,
): void {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const e = activeEffects[i]
    const age = performance.now() - e.startTime
    const progress = age / e.duration

    if (progress >= 1) {
      scene.remove(e.mesh)
      e.mesh.geometry.dispose()
      activeEffects.splice(i, 1)
      continue
    }

    // Add to scene if not already added
    if (e.mesh.parent === null) {
      scene.add(e.mesh)
    }

    // Scale up ring over time
    const scale = 1 + progress * 3
    e.mesh.scale.set(scale, scale, scale)
    // Fade out
    const mat = e.mesh.material as THREE.MeshBasicMaterial
    mat.opacity = 0.8 * (1 - progress)
  }
}
