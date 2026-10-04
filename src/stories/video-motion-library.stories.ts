/** Inspect the exported multi-animation GLB; every clip uses the same anime skin. */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Meta, StoryObj } from '@storybook/html'
import { mountScene } from './threeHelper'

interface Motion {
  id: string
  label: string
  category: string
  source: string
  fromFrame: number
  toFrame: number
  bvh: string
}
interface Manifest {
  model: string
  fps: number
  sources: Record<string, { url: string; start: number; capture: string }>
  motions: Motion[]
}

const meta: Meta<{ category: string }> = {
  title: '动作素材/统一角色视频动作',
  args: { category: '全部' },
  parameters: { layout: 'fullscreen' },
  render: ({ category }) => {
    const container = document.createElement('div')
    container.className = 'video-motions'
    container.innerHTML = `<style>
      .video-motions{display:grid;grid-template-columns:248px minmax(0,1fr);height:min(800px,100vh);min-height:560px;background:#11242b;color:#edf3f5;font:14px system-ui}
      .video-motions *{box-sizing:border-box}.video-motions button,.video-motions select,.video-motions input{font:inherit;color:inherit;background:#203a44;border:1px solid #42616c;border-radius:6px;padding:8px}
      .video-motions button{cursor:pointer}.video-motions button:hover,.video-motions button.selected{background:#315954;border-color:#a8d6c9}
      .video-motions aside{padding:18px;display:flex;flex-direction:column;gap:12px;border-right:1px solid #35525d;min-height:0;min-width:0}
      .video-motions h2{font-size:19px;margin:0}.video-motions p{margin:0;line-height:1.6;color:#b7cad1}.video-motions [data-filters]{display:grid;gap:8px}.video-motions [data-filters] input,.video-motions [data-filters] select{min-width:0;width:100%}
      .video-motions [data-list]{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;flex:1}.video-motions [data-list] button{text-align:left;display:flex;flex-direction:column;gap:5px}.video-motions [data-list] small{color:#bad0d4}
      .video-motions a{color:#b8e7d3}.video-motions main{display:flex;flex-direction:column;min-height:0;min-width:0}.video-motions header{padding:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .video-motions [data-title]{padding:0 16px 10px;font-size:16px;font-weight:600}.video-motions [data-stage]{flex:1;min-height:200px;min-width:0;position:relative;overflow:hidden}
      .video-motions footer{display:flex;gap:12px;align-items:center;padding:12px 16px}.video-motions [data-time]{flex:1;min-width:60px;padding:0}
      .video-motions [data-source]{padding:0 16px 14px;font-size:12px;line-height:1.6;color:#b7cad1}.video-motions [data-downloads]{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px}
      @media(max-width:620px){.video-motions{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);min-height:680px}.video-motions aside{padding:12px;gap:8px;border-right:0;border-bottom:1px solid #35525d}.video-motions aside p{font-size:12px}.video-motions [data-filters]{grid-template-columns:1fr 1fr}.video-motions [data-list]{flex-direction:row;max-height:72px;min-height:60px}.video-motions [data-list] button{flex-shrink:0;min-width:150px;padding:7px}.video-motions header{padding:10px;gap:6px}.video-motions header select{max-width:145px;padding:6px}.video-motions [data-title]{font-size:14px;padding-bottom:5px}.video-motions [data-source]{font-size:11px;padding-bottom:10px}.video-motions footer{padding:8px 12px}}
    </style><aside><h2>统一角色动作库</h2><p>同一二次元人物 · 25 fps<br>真人视频估计的原地动作</p><div data-filters><select data-category aria-label="动作分类"><option>全部</option></select><input data-search aria-label="搜索动作" placeholder="搜索动作"></div><div data-count>加载目录…</div><div data-list></div></aside><main><header><button data-play>暂停</button><button data-restart>重播</button><select data-rate aria-label="播放速度"><option value="0.25">0.25 倍</option><option value="0.5" selected>0.5 倍</option><option value="1">原片速度</option></select><select data-mode aria-label="显示方式"><option value="character">人物</option><option value="bones">骨架</option><option value="overlay">人物 + 骨架</option></select><select data-view aria-label="观察方向"><option value="front">正面</option><option value="side">侧面</option><option value="orbit">自由观察</option></select><label><input data-loop type="checkbox">循环</label></header><div data-title>加载统一人物…</div><div data-stage></div><footer><span data-clock>0.00 s</span><input data-time type="range" min="0" max="1" step="0.001" value="0" aria-label="动画时间轴"></footer><div data-source><div data-info>位移、脚底锁定和手腕方向尚未实测。</div><div data-downloads><a data-model-download download>统一角色 GLB</a><a data-bvh-download download>当前动作 BVH</a><a data-reference target="_blank" rel="noreferrer">真人参考来源</a></div></div></main>`

    const ctx = mountScene(container.querySelector<HTMLElement>('[data-stage]')!)
    ctx.scene.background = new THREE.Color('#132b33')
    const orbit = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    orbit.target.set(0, 1.05, 0)
    orbit.enablePan = false
    orbit.enableDamping = true
    const categorySelect = container.querySelector<HTMLSelectElement>('[data-category]')!
    const search = container.querySelector<HTMLInputElement>('[data-search]')!
    const list = container.querySelector<HTMLElement>('[data-list]')!
    const title = container.querySelector<HTMLElement>('[data-title]')!
    const play = container.querySelector<HTMLButtonElement>('[data-play]')!
    const rate = container.querySelector<HTMLSelectElement>('[data-rate]')!
    const mode = container.querySelector<HTMLSelectElement>('[data-mode]')!
    const view = container.querySelector<HTMLSelectElement>('[data-view]')!
    const loop = container.querySelector<HTMLInputElement>('[data-loop]')!
    const timeline = container.querySelector<HTMLInputElement>('[data-time]')!
    const clock = container.querySelector<HTMLElement>('[data-clock]')!
    const url = (path: string) => new URL(path, document.baseURI).href
    const diagram = new THREE.Group()
    ctx.scene.add(diagram)
    const segments: { parent: THREE.Object3D; child: THREE.Object3D; mesh: THREE.Mesh }[] = []
    const joints: { bone: THREE.Object3D; mesh: THREE.Mesh }[] = []
    let manifest: Manifest | null = null
    let model: THREE.Group | null = null
    let mixer: THREE.AnimationMixer | null = null
    let clips: THREE.AnimationClip[] = []
    let selected: Motion | null = null
    let action: THREE.AnimationAction | null = null
    let time = 0
    let playing = true
    let previous = performance.now()

    function setView(): void {
      orbit.enabled = view.value === 'orbit'
      if (view.value === 'side') ctx.camera.position.set(3.7, 1.7, 0.8)
      else ctx.camera.position.set(0.2, 1.7, 4.1)
      ctx.camera.lookAt(orbit.target)
      orbit.update()
    }
    function showList(): void {
      const motions = manifest?.motions.filter(motion => (categorySelect.value === '全部' || motion.category === categorySelect.value)
        && `${motion.label} ${motion.category}`.includes(search.value.trim())) ?? []
      container.querySelector('[data-count]')!.textContent = `${motions.length} 条 / 共 ${manifest?.motions.length ?? 0} 条动作`
      list.replaceChildren()
      for (const motion of motions) {
        const button = document.createElement('button')
        button.dataset.motion = motion.id
        button.classList.toggle('selected', motion.id === selected?.id)
        button.textContent = motion.label
        const duration = document.createElement('small')
        duration.textContent = `${motion.category} · ${((motion.toFrame - motion.fromFrame) / manifest!.fps).toFixed(2)} s`
        button.appendChild(duration)
        button.onclick = () => select(motion)
        list.appendChild(button)
      }
    }
    function select(motion: Motion): void {
      const clip = clips.find(clip => clip.name === motion.id)
      if (!clip || !mixer || !manifest) throw new Error(`导出文件缺少动作：${motion.id}`)
      mixer.stopAllAction()
      selected = motion
      action = mixer.clipAction(clip)
      action.reset().setLoop(THREE.LoopOnce, 1).play()
      action.clampWhenFinished = true
      time = 0
      playing = true
      previous = performance.now()
      timeline.max = String(clip.duration)
      title.textContent = motion.label
      const source = manifest.sources[motion.source]
      container.querySelector('[data-info]')!.textContent = `${motion.toFrame - motion.fromFrame + 1} 帧 · 同一人物骨架 · 原片 ${(source.start + motion.fromFrame / manifest.fps).toFixed(2)}–${(source.start + motion.toFrame / manifest.fps).toFixed(2)} s · 视频估计试样`
      container.querySelector<HTMLAnchorElement>('[data-reference]')!.href = source.url
      container.querySelector<HTMLAnchorElement>('[data-bvh-download]')!.href = url(motion.bvh)
      showList()
      pose()
    }
    function pose(): void {
      if (!model || !mixer || !action) return
      action.paused = false
      mixer.setTime(time)
      model.updateWorldMatrix(true, true)
      model.visible = mode.value !== 'bones'
      diagram.visible = mode.value !== 'character'
      if (diagram.visible) {
        for (const { bone, mesh } of joints) mesh.position.copy(bone.getWorldPosition(new THREE.Vector3()))
        for (const { parent, child, mesh } of segments) {
          const a = parent.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3())
          const direction = b.clone().sub(a)
          mesh.position.copy(a).add(b).multiplyScalar(0.5)
          mesh.scale.set(1, direction.length(), 1)
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
        }
      }
      timeline.value = String(time)
      clock.textContent = `${time.toFixed(2)} / ${action.getClip().duration.toFixed(2)} s`
      play.textContent = playing ? '暂停' : time >= action.getClip().duration ? '重播' : '播放'
    }
    void fetch(url('mocap/video-poses/manifest.json')).then(async response => {
      if (!response.ok) throw new Error(`动作目录加载失败：${response.status}`)
      manifest = await response.json() as Manifest
      const gltf = await new GLTFLoader().loadAsync(url(manifest.model))
      if (!ctx.animating) return
      model = gltf.scene
      model.name = 'exported-motion-character'
      clips = gltf.animations
      mixer = new THREE.AnimationMixer(model)
      ctx.scene.add(model)
      const links = [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head']]
      for (const side of ['Right', 'Left']) {
        links.push(['Spine2', `${side}Shoulder`], [`${side}Shoulder`, `${side}Arm`], [`${side}Arm`, `${side}ForeArm`], [`${side}ForeArm`, `${side}Hand`],
          ['Hips', `${side}UpLeg`], [`${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Foot`], [`${side}Foot`, `${side}ToeBase`])
      }
      const materials = [0xd5e5ec, 0xff9b48, 0x3acdd1].map(color => new THREE.MeshBasicMaterial({ color, depthTest: false }))
      const jointGeometry = new THREE.SphereGeometry(0.03, 10, 8)
      const boneGeometry = new THREE.CylinderGeometry(0.014, 0.014, 1, 8)
      for (const [a, b] of links) {
        const parent = model.getObjectByName(a), child = model.getObjectByName(b)
        if (!parent || !child) throw new Error(`统一角色缺少骨骼：${a}/${b}`)
        const material = materials[b.startsWith('Right') ? 1 : b.startsWith('Left') ? 2 : 0]
        const mesh = new THREE.Mesh(boneGeometry, material)
        const joint = new THREE.Mesh(jointGeometry, material)
        diagram.add(mesh, joint)
        segments.push({ parent, child, mesh })
        joints.push({ bone: child, mesh: joint })
      }
      for (const name of new Set(manifest.motions.map(motion => motion.category))) categorySelect.add(new Option(name, name))
      categorySelect.value = category
      if (!categorySelect.value) categorySelect.value = '全部'
      container.querySelector<HTMLAnchorElement>('[data-model-download]')!.href = url(manifest.model)
      const first = manifest.motions.find(motion => categorySelect.value === '全部' || motion.category === categorySelect.value)
      if (first) select(first)
      const dispose = ctx.dispose
      ctx.dispose = () => {
        mixer?.stopAllAction()
        orbit.dispose()
        jointGeometry.dispose()
        boneGeometry.dispose()
        materials.forEach(material => material.dispose())
        model?.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose()) } })
        dispose()
      }
    }).catch(error => { title.textContent = String(error) })
    categorySelect.onchange = () => {
      const first = manifest?.motions.find(motion => categorySelect.value === '全部' || motion.category === categorySelect.value)
      if (first) select(first)
      else showList()
    }
    search.oninput = showList
    play.onclick = () => { if (action && time >= action.getClip().duration) time = 0; playing = !playing; previous = performance.now(); pose() }
    container.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => { time = 0; playing = true; previous = performance.now(); pose() }
    timeline.oninput = () => { time = Number(timeline.value); playing = false; pose() }
    mode.onchange = pose
    view.onchange = setView
    setView()
    function animate(now: number): void {
      if (!ctx.animating) return
      if (!container.isConnected) { ctx.dispose(); return }
      requestAnimationFrame(animate)
      if (playing && action) {
        time += Math.min((now - previous) / 1000, 0.1) * Number(rate.value)
        const duration = action.getClip().duration
        if (time >= duration) {
          if (loop.checked) time %= duration
          else { time = duration; playing = false }
        }
        pose()
      }
      previous = now
      orbit.update()
    }
    requestAnimationFrame(animate)
    return container
  },
}

export default meta
export const All: StoryObj<{ category: string }> = { name: '全部动作' }
export const Forecourt: StoryObj<{ category: string }> = { name: '前场', args: { category: '前场' } }
export const Rearcourt: StoryObj<{ category: string }> = { name: '后场', args: { category: '后场' } }
export const Start: StoryObj<{ category: string }> = { name: '启动与交叉步', args: { category: '启动与交叉步' } }
export const Recovery: StoryObj<{ category: string }> = { name: '回位', args: { category: '回位' } }
