/** Storybook 3D 场景辅助 — 挂载/卸载 Three.js 到 DOM 容器 */

import * as THREE from 'three'

export interface StoryScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  container: HTMLElement
  clock: THREE.Clock
  animating: boolean
  dispose: () => void
}

/** 创建 Three.js 场景挂载到容器中 */
export function mountScene(container: HTMLElement): StoryScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100)
  camera.position.set(-8, 10, 0)
  camera.lookAt(0, 1, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 0.5)
  scene.add(ambient)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
  dirLight.position.set(10, 15, 10)
  scene.add(dirLight)
  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5)
  fillLight.position.set(-5, 5, -5)
  scene.add(fillLight)

  // Grid
  const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355)
  gridHelper.position.y = -0.01
  scene.add(gridHelper)

  const clock = new THREE.Clock()
  const ctx: StoryScene = {
    scene, camera, renderer, container, clock,
    animating: true,
    dispose() {
      ctx.animating = false
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    },
  }

  function animate() {
    if (!ctx.animating) return
    requestAnimationFrame(animate)
    renderer.render(scene, camera)
  }
  animate()

  // Resize
  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)
  // Override dispose to also remove listener
  const origDispose = ctx.dispose
  ctx.dispose = () => {
    origDispose()
    window.removeEventListener('resize', onResize)
  }

  return ctx
}
