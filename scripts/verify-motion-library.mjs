/** Export readback and the real Storybook gallery controls, on desktop and phone. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'

const output = '.workbuddy/motion-library'
await mkdir(output, { recursive: true })
const manifest = JSON.parse(await readFile('public/mocap/video-poses/manifest.json', 'utf8'))
const proof = JSON.parse(await readFile(`${output}/export-proof.json`, 'utf8'))
const bvh = []
let hierarchy = null
for (const motion of manifest.motions) {
  const { skeleton, clip } = new BVHLoader().parse(await readFile(`public/${motion.bvh}`, 'utf8'))
  const shape = skeleton.bones.map(bone => [bone.name, bone.parent?.name ?? null, bone.position.toArray()])
  if (hierarchy) assert.deepEqual(shape, hierarchy, `${motion.id}: BVH skeleton differs`)
  else hierarchy = shape
  const frames = motion.toFrame - motion.fromFrame + 1
  assert.equal(clip.tracks[0].times.length, frames)
  assert.ok(Math.abs(clip.duration - (frames - 1) / manifest.fps) < 0.000002)
  bvh.push({ id: motion.id, frames, joints: skeleton.bones.length })
}
const browser = await puppeteer.connect({ browserURL: process.env.CDP_URL ?? 'http://127.0.0.1:9222' })
const context = await browser.createBrowserContext()
try {
  const reader = await context.newPage()
  await reader.goto(`${process.env.PLAY_URL ?? 'http://127.0.0.1:3000'}/${output}/export.html`)
  const readback = await reader.evaluate(async proof => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
    const gltf = await new GLTFLoader().loadAsync('/models/anime-motion-library.glb')
    const model = gltf.scene, mixer = new THREE.AnimationMixer(model)
    const results = []
    for (const entry of proof) {
      const clip = gltf.animations.find(clip => clip.name === entry.id)
      if (!clip) throw new Error(`Missing exported clip: ${entry.id}`)
      mixer.stopAllAction()
      const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play()
      action.clampWhenFinished = true
      let positionError = 0, rotationError = 0
      for (const sample of entry.checkpoints) {
        action.paused = false
        mixer.setTime(sample.time)
        model.updateWorldMatrix(true, true)
        for (const [name, expected] of Object.entries(sample.joints)) {
          const bone = model.getObjectByName(name)
          if (!bone) throw new Error(`Missing character joint: ${name}`)
          positionError = Math.max(positionError, bone.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...expected.position)))
          rotationError = Math.max(rotationError, bone.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion(...expected.quaternion)))
        }
      }
      results.push({ id: entry.id, positionError, rotationError, duration: clip.duration })
    }
    return { clips: results, sceneRoots: gltf.scene.children.length }
  }, proof)
  for (const clip of readback.clips) {
    assert.ok(clip.positionError < 0.0001, `${clip.id}: GLB position error ${clip.positionError}`)
    assert.ok(clip.rotationError < 0.001, `${clip.id}: GLB rotation error ${clip.rotationError}`)
  }
  await reader.close()
  const results = []
  for (const mobile of [false, true]) {
    const page = await context.newPage()
    try {
      const errors = []
      await page.bringToFront()
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`) })
      await page.setViewport(mobile ? { width: 393, height: 852 } : { width: 1440, height: 900 })
      await page.goto(`${process.env.STORYBOOK_URL ?? 'http://127.0.0.1:7608'}/iframe.html?id=动作素材-统一角色视频动作--all&viewMode=story`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => document.querySelectorAll('[data-motion]').length === 8)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Gallery overflows viewport')
      await page.evaluate(async () => {
        const path = performance.getEntriesByType('resource').find(entry => /\/three\.js(?:\?|$)/.test(entry.name))?.name
        if (!path) throw new Error('Three module was not loaded')
        const THREE = await import(path)
        const updateScene = THREE.Scene.prototype.updateMatrixWorld
        const updateCamera = THREE.PerspectiveCamera.prototype.updateMatrixWorld
        THREE.Scene.prototype.updateMatrixWorld = function (...args) {
          window.__motionScene = this; window.__motionThree = THREE
          return updateScene.apply(this, args)
        }
        THREE.PerspectiveCamera.prototype.updateMatrixWorld = function (...args) {
          const result = updateCamera.apply(this, args)
          window.__motionCamera = this
          return result
        }
      })
      await page.waitForFunction(() => window.__motionScene && window.__motionCamera)
      for (const motion of manifest.motions) {
        await page.click(`[data-motion="${motion.id}"]`)
        assert.equal(await page.$eval('[data-title]', node => node.textContent), motion.label)
        const duration = (motion.toFrame - motion.fromFrame) / manifest.fps
        await page.$eval('[data-time]', (input, time) => { input.value = time; input.dispatchEvent(new Event('input', { bubbles: true })) }, duration * 0.55)
        const paused = await page.$eval('[data-clock]', node => node.textContent)
        await new Promise(resolve => setTimeout(resolve, 90))
        assert.equal(await page.$eval('[data-clock]', node => node.textContent), paused, `${motion.id}: pause moved`)
        const visible = await page.evaluate(() => ['Head', 'RightFoot', 'LeftFoot', 'RightHand', 'LeftHand'].every(name => {
          const node = window.__motionScene.getObjectByName('exported-motion-character').getObjectByName(name)
          const point = node.getWorldPosition(new window.__motionThree.Vector3()).project(window.__motionCamera)
          return Math.abs(point.x) <= 1.01 && Math.abs(point.y) <= 1.01 && point.z < 1
        }))
        assert.ok(visible, `${motion.id}: character clipped by camera`)
        await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${motion.id}.png` })
        results.push({ device: mobile ? 'mobile' : 'desktop', id: motion.id, paused })
      }
      for (const category of [...new Set(manifest.motions.map(motion => motion.category))]) {
        await page.select('[data-category]', category)
        assert.equal(await page.$$eval('[data-motion]', nodes => nodes.length), 2)
      }
      await page.select('[data-category]', '全部')
      await page.type('[data-search]', '后场')
      assert.deepEqual(await page.$$eval('[data-motion]', nodes => nodes.map(node => node.dataset.motion)), ['rear-forehand', 'rear-backhand'])
      await page.$eval('[data-search]', input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })) })
      for (const mode of ['bones', 'overlay', 'character']) {
        await page.select('[data-mode]', mode)
        await page.select('[data-view]', 'side')
        await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${mode}.png` })
      }
      await page.select('[data-view]', 'arms')
      await page.click('[data-motion="front-backhand"]')
      await page.$eval('[data-time]', node => { node.value = '1.76'; node.dispatchEvent(new Event('input')) })
      await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-arms.png` })
      await page.select('[data-view]', 'orbit')
      await page.select('[data-rate]', '1')
      await page.click('[data-motion="ready-start"]')
      await new Promise(resolve => setTimeout(resolve, 750))
      assert.equal(await page.$eval('[data-play]', node => node.textContent), '重播')
      await page.click('[data-play]')
      assert.equal(await page.$eval('[data-play]', node => node.textContent), '暂停')
      await page.click('[data-loop]')
      await new Promise(resolve => setTimeout(resolve, 750))
      assert.equal(await page.$eval('[data-play]', node => node.textContent), '暂停')
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  }
  await writeFile(`${output}/acceptance.json`, JSON.stringify({ bvh, readback, browser: results }, null, 2))
  console.log({ bvh, readback, cases: results.length })
} finally {
  await context.close()
  await browser.disconnect()
}
