/** Bake the curated poses onto the one existing anime skin, then export its GLB. */
import { mkdir, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const output = '.workbuddy/motion-library'
await mkdir(output, { recursive: true })
await writeFile(`${output}/export.html`, '<!doctype html><meta charset="utf-8"><title>Motion export</title>')
const browser = await puppeteer.connect({ browserURL: process.env.CDP_URL ?? 'http://127.0.0.1:9222' })
const context = await browser.createBrowserContext()
try {
  const page = await context.newPage()
  page.on('pageerror', error => console.error(error.message))
  await page.goto(`${process.env.PLAY_URL ?? 'http://127.0.0.1:3000'}/${output}/export.html`)
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js')
    const { createPlayerMesh, syncPlayerMocap } = await import('/src/render/playerMesh.ts')
    const response = await fetch('/mocap/video-poses/manifest.json')
    if (!response.ok) throw new Error(`Manifest: ${response.status}`)
    const manifest = await response.json()
    const captures = {}
    for (const [id, source] of Object.entries(manifest.sources)) {
      const response = await fetch(`/${source.capture}`)
      if (!response.ok) throw new Error(`Capture ${id}: ${response.status}`)
      captures[id] = await response.json()
    }
    const group = createPlayerMesh({ body: 0x3264b0, head: 0xf3c9a4, racket: 0xf5f5f5, marker: 0xffffff },
      '', { labelScale: 0, modelUrl: '/models/anime-player.glb' })
    const deadline = performance.now() + 15000
    while (!group.getObjectByName('player-model')) {
      if (performance.now() > deadline) throw new Error('Anime skin failed to load')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const model = group.getObjectByName('player-model')
    const nodes = []
    model.traverse(node => { if (node.isBone || node.name === 'player-racket') nodes.push(node) })
    const animations = [], proof = []
    const inspect = ['Hips', 'Spine2', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'RightHandThumb1', 'player-racket', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot']
    for (const motion of manifest.motions) {
      const capture = captures[motion.source]
      const times = [], samples = nodes.map(() => ({ position: [], quaternion: [], scale: [] }))
      const checkpoints = []
      for (let frame = motion.fromFrame; frame <= motion.toFrame; frame++) {
        const time = (frame - motion.fromFrame) / manifest.fps
        times.push(time)
        syncPlayerMocap(group, capture, Math.min(frame / manifest.fps, capture.time.at(-1) - 0.000001))
        nodes.forEach((node, i) => {
          samples[i].position.push(...node.position.toArray())
          samples[i].quaternion.push(...node.quaternion.toArray())
          samples[i].scale.push(...node.scale.toArray())
        })
        if ([motion.fromFrame, Math.floor((motion.fromFrame + motion.toFrame) / 2), motion.toFrame].includes(frame)) {
          checkpoints.push({ time, joints: Object.fromEntries(inspect.map(name => {
            const bone = model.getObjectByName(name)
            return [name, { position: bone.getWorldPosition(new THREE.Vector3()).toArray(),
              quaternion: bone.getWorldQuaternion(new THREE.Quaternion()).toArray() }]
          })) })
        }
      }
      const tracks = nodes.flatMap((node, i) => [
        new THREE.VectorKeyframeTrack(`${node.uuid}.position`, times, samples[i].position),
        new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, samples[i].quaternion),
        new THREE.VectorKeyframeTrack(`${node.uuid}.scale`, times, samples[i].scale),
      ])
      animations.push(new THREE.AnimationClip(motion.id, times.at(-1), tracks).optimize())
      proof.push({ id: motion.id, checkpoints })
    }
    // Gameplay reuses the original skin. Export its bone tracks separately so it
    // need not download a second copy of the avatar or bind a posed GLB as rest.
    const gameClips = animations.map(clip => {
      const copy = clip.clone()
      copy.tracks = copy.tracks.filter(track => {
        const node = nodes.find(node => track.name.startsWith(`${node.uuid}.`))
        if (!node || !/^(Hips|Spine[12]?|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase))$/.test(node.name)) return false
        const property = track.name.slice(node.uuid.length)
        if (property !== '.quaternion' && !(node.name === 'Hips' && property === '.position')) return false
        track.name = node.name + property
        return true
      })
      return THREE.AnimationClip.toJSON(copy)
    })
    const binary = await new GLTFExporter().parseAsync(model, { binary: true, animations, onlyVisible: true })
    const bytes = new Uint8Array(binary)
    let encoded = ''
    for (let i = 0; i < bytes.length; i += 8192) encoded += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return { model: manifest.model, glb: btoa(encoded), proof, gameClips, clips: animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })) }
  })
  await writeFile(`public/${result.model}`, Buffer.from(result.glb, 'base64'))
  await writeFile('public/mocap/video-poses/clips.json', JSON.stringify(result.gameClips))
  await writeFile(`${output}/export-proof.json`, JSON.stringify(result.proof))
  await writeFile(`${output}/export-clips.json`, JSON.stringify(result.clips, null, 2))
  console.log(result.clips)
} finally {
  await context.close()
  await browser.disconnect()
}
