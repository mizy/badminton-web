/** Browse playable HDM05 recordings by action; compare the shared rig and skins. */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Meta, StoryObj } from '@storybook/html'
import { createPlayerSkeleton } from '../render/playerSkeleton'
import { applyHdm05PlayerMotion } from '../render/hdm05PlayerMotion'
import { createPlayerMesh, syncPlayerMocap } from '../render/playerMesh'
import { createHdm05StrikeClip, sampleHdm05Playback, type Hdm05Motion } from '../render/hdm05BadmintonMocap'
import { createSkeletonDiagram } from './playerSkeletonDiagram'
import { mountScene } from './threeHelper'

interface LibraryEntry {
  id: string
  label: string
  category: string
  description: string
  path: string
  actor: string
  frames: number
  duration: number
  sourcePath: string
  source: string
}

const meta: Meta<{ category: string }> = {
  title: '动作素材/HDM05 动作库',
  args: { category: '全部' },
  parameters: { layout: 'fullscreen' },
  render: ({ category }) => {
    const container = document.createElement('div')
    container.className = 'hdm-library'
    container.innerHTML = `<style>
      .hdm-library{display:grid;grid-template-columns:240px minmax(0,1fr);height:min(760px,100vh);min-height:340px;background:#10212a;color:#e6eff0;font:13px system-ui;overflow:hidden}
      .hdm-library button,.hdm-library input,.hdm-library select{font:inherit;color:inherit;background:#19333c;border:1px solid #36545b;border-radius:5px;padding:7px}
      .hdm-library button{cursor:pointer}.hdm-library button:hover,.hdm-library button.selected{background:#315356;border-color:#93bfae}
      .hdm-library aside{padding:14px;display:flex;flex-direction:column;gap:10px;border-right:1px solid #35505b;min-height:0}
      .hdm-library h2{font-size:17px;margin:0}.hdm-library p{margin:0;line-height:1.6;color:#acc3c9}
      .hdm-library [data-list]{overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:0}
      .hdm-library [data-list] button{text-align:left;display:flex;justify-content:space-between;gap:8px}.hdm-library [data-list] small{color:#a5bec4}
      .hdm-library main{display:flex;flex-direction:column;min-height:0}.hdm-library header{padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .hdm-library [data-stage]{position:relative;flex:1;min-height:0}.hdm-library details{background:#142d36;border:1px solid #35505b;padding:8px;border-radius:5px;flex-shrink:0;max-height:180px;overflow:auto}.hdm-library [data-details]{font-size:11px;line-height:1.6;overflow-wrap:anywhere}.hdm-library [data-title]{padding:4px 12px;color:#c8e8d7}
      .hdm-library [data-range]{padding:0 12px 8px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}.hdm-library [data-range] input{width:65px}.hdm-library footer{padding:10px 12px;display:flex;gap:8px;align-items:center}.hdm-library [data-time]{flex:1;min-width:70px;padding:0}
      @media(max-width:620px){.hdm-library{grid-template-columns:170px minmax(0,1fr)}.hdm-library aside{padding:8px}.hdm-library header{padding:7px;gap:5px}.hdm-library [data-details]{font-size:11px;max-width:190px}}
    </style><aside><h2>HDM05 动作库</h2><p>按动作分类查看真实录制。<br>可切换骨架、标准角色与 Xbot。</p><input data-search placeholder="搜索动作 / 编号 / 演员" aria-label="搜索动作"><select data-category aria-label="动作分类"><option>全部</option></select><div data-count></div><div data-list></div><details><summary>录制信息与来源</summary><div data-details>加载动作目录…</div></details></aside><main><header><button data-play>暂停</button><button data-step>前进一帧</button><button data-restart>重播</button><select data-mode aria-label="显示方式"><option value="skeleton">独立骨架</option><option value="athlete">标准角色</option><option value="xbot">Xbot 模型</option></select><select data-rate aria-label="播放速度"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select><label><input data-full type="checkbox">完整录制</label><label><input data-follow type="checkbox" checked>跟随位移</label></header><div data-range><label>选区起点 <input data-from type="number" min="0" step="0.1" value="0" aria-label="选区起点"></label><label>终点 <input data-to type="number" min="0" step="0.1" value="1" aria-label="选区终点"></label><button data-range-apply>循环选区</button><button data-range-reset>恢复整段</button></div><div data-title>加载动作目录…</div><div data-stage></div><footer><span data-clock>0.00 s</span><input data-time type="range" min="0" max="1" step="0.001" value="0" aria-label="回放时间轴"></footer></main>`
    const stage = container.querySelector<HTMLElement>('[data-stage]')!
    const ctx = mountScene(stage)
    ctx.scene.background = new THREE.Color(0x10212a)
    ctx.camera.position.set(2.6, 2, 3.3)
    const orbit = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    orbit.target.set(0, 0.9, 0)
    orbit.enableDamping = true
    orbit.enablePan = false
    const rig = createPlayerSkeleton()
    const diagram = createSkeletonDiagram(ctx.scene)
    ctx.scene.add(rig.group)
    const search = container.querySelector<HTMLInputElement>('[data-search]')!
    const categorySelect = container.querySelector<HTMLSelectElement>('[data-category]')!
    const list = container.querySelector<HTMLElement>('[data-list]')!
    const title = container.querySelector<HTMLElement>('[data-title]')!
    const details = container.querySelector<HTMLElement>('[data-details]')!
    const count = container.querySelector<HTMLElement>('[data-count]')!
    const play = container.querySelector<HTMLButtonElement>('[data-play]')!
    const mode = container.querySelector<HTMLSelectElement>('[data-mode]')!
    const rate = container.querySelector<HTMLSelectElement>('[data-rate]')!
    const full = container.querySelector<HTMLInputElement>('[data-full]')!
    const follow = container.querySelector<HTMLInputElement>('[data-follow]')!
    const timeline = container.querySelector<HTMLInputElement>('[data-time]')!
    const from = container.querySelector<HTMLInputElement>('[data-from]')!
    const to = container.querySelector<HTMLInputElement>('[data-to]')!
    const clock = container.querySelector<HTMLElement>('[data-clock]')!
    let entries: LibraryEntry[] = []
    let selected: LibraryEntry | null = null
    let recording: Hdm05Motion<string> | null = null
    let baseClip: Hdm05Motion<string> | null = null
    let rangeStart = 0
    let motion: Hdm05Motion<string> | null = null
    let time = 0
    let playing = true
    let previous = performance.now()
    let request = 0
    let athlete: THREE.Group | null = null
    let xbot: THREE.Group | null = null

    void fetch('/mocap/hdm05-library/manifest.json').then(response => {
      if (!response.ok) throw new Error(`动作目录加载失败：${response.status}`)
      return response.json() as Promise<{ motions: LibraryEntry[] }>
    }).then(manifest => {
      if (!ctx.animating) return
      entries = manifest.motions
      for (const name of new Set(entries.map(entry => entry.category))) categorySelect.add(new Option(name, name))
      categorySelect.value = category
      if (!categorySelect.value) categorySelect.value = '全部'
      showList()
      const first = filtered()[0]
      if (first) void selectClip(first)
    }).catch(error => { title.textContent = details.textContent = String(error) })

    function filtered(): LibraryEntry[] {
      const query = search.value.trim().toLowerCase()
      return entries.filter(entry => (categorySelect.value === '全部' || entry.category === categorySelect.value)
        && `${entry.label} ${entry.description} ${entry.id} ${entry.actor}`.toLowerCase().includes(query))
    }
    function showList(): void {
      const visible = filtered()
      count.textContent = `${visible.length} 条录制 / 共 ${entries.length} 条`
      list.replaceChildren()
      for (const entry of visible) {
        const button = document.createElement('button')
        button.classList.toggle('selected', selected?.id === entry.id)
        const label = document.createElement('span')
        label.textContent = entry.label
        const actor = document.createElement('small')
        actor.textContent = entry.actor
        button.append(label, actor)
        button.title = `${entry.id} · ${entry.description}`
        button.onclick = () => { void selectClip(entry) }
        list.appendChild(button)
      }
    }
    async function selectClip(entry: LibraryEntry): Promise<void> {
      const version = ++request
      selected = entry
      full.disabled = entry.category !== '羽毛球'
      recording = motion = null
      showList()
      title.textContent = details.textContent = `加载 ${entry.label}…`
      try {
        const response = await fetch(entry.path)
        if (!response.ok) throw new Error(`动作加载失败：${response.status}`)
        const next = await response.json() as Hdm05Motion<string>
        if (version !== request || !ctx.animating) return
        recording = next
        updateClip()
      } catch (error) { if (version === request) title.textContent = details.textContent = String(error) }
    }
    function updateClip(): void {
      if (!recording) return
      baseClip = !full.checked && selected?.category === '羽毛球'
        ? createHdm05StrikeClip(recording as Hdm05Motion) : recording
      motion = baseClip
      rangeStart = 0
      from.value = '0'
      to.value = String((motion.poseBody.length - 1) / motion.fps)
      time = 0
      playing = true
      play.textContent = '暂停'
      timeline.max = String(sampleHdm05Playback(motion, 0).duration)
      diagram.trails.forEach(path => { path.length = 0 })
    }
    container.querySelector<HTMLButtonElement>('[data-range-apply]')!.onclick = () => {
      if (!baseClip) return
      const frames = baseClip.poseBody.length
      const start = Math.max(0, Math.min(frames - 1, Math.floor((Number(from.value) || 0) * baseClip.fps)))
      const end = Math.max(start + 1, Math.min(frames, Math.ceil((Number(to.value) || 0) * baseClip.fps) + 1))
      motion = { ...baseClip, poseBody: baseClip.poseBody.slice(start, end), root: baseClip.root.slice(start, end),
        rootOrient: baseClip.rootOrient.slice(start, end) }
      rangeStart = start
      from.value = String(start / baseClip.fps)
      to.value = String((end - 1) / baseClip.fps)
      time = 0
      playing = true
      play.textContent = '暂停'
      timeline.max = String(sampleHdm05Playback(motion, 0).duration)
      diagram.trails.forEach(path => { path.length = 0 })
    }
    container.querySelector<HTMLButtonElement>('[data-range-reset]')!.onclick = updateClip
    search.oninput = showList
    categorySelect.onchange = () => { showList(); const first = filtered()[0]; if (first) void selectClip(first) }
    full.onchange = updateClip
    play.onclick = () => { playing = !playing; play.textContent = playing ? '暂停' : '播放'; previous = performance.now() }
    container.querySelector<HTMLButtonElement>('[data-step]')!.onclick = () => {
      playing = false; play.textContent = '播放'; time += 1 / (motion?.fps ?? 30)
    }
    container.querySelector<HTMLButtonElement>('[data-restart]')!.onclick = () => { time = 0; diagram.trails.forEach(path => { path.length = 0 }) }
    timeline.oninput = () => { time = Number(timeline.value); playing = false; play.textContent = '播放'; diagram.trails.forEach(path => { path.length = 0 }) }
    mode.onchange = () => {
      if (mode.value === 'athlete' && !athlete) { athlete = createPlayerMesh(undefined, '', { labelScale: 0 }); ctx.scene.add(athlete) }
      if (mode.value === 'xbot' && !xbot) { xbot = createPlayerMesh(undefined, '', { labelScale: 0, modelUrl: '/models/xbot.glb' }); ctx.scene.add(xbot) }
    }
    function animate(now: number): void {
      if (!ctx.animating) return
      if (!container.isConnected) { dispose(); return }
      requestAnimationFrame(animate)
      if (playing && motion) time += Math.min((now - previous) / 1000, 0.05) * Number(rate.value)
      previous = now
      if (!motion || !selected) return
      const sample = applyHdm05PlayerMotion(rig, motion, time)
      const showRacket = selected.category === '羽毛球'
      diagram.group.visible = mode.value === 'skeleton'
      if (diagram.group.visible) diagram.update(rig, showRacket)
      for (const [name, group] of [['athlete', athlete], ['xbot', xbot]] as const) {
        if (!group) continue
        group.visible = mode.value === name
        if (!group.visible) continue
        syncPlayerMocap(group, motion, time)
        const racket = group.getObjectByName('player-racket')
        if (racket) racket.visible = showRacket
      }
      const hips = rig.hips.getWorldPosition(new THREE.Vector3())
      const center = follow.checked ? new THREE.Vector3(hips.x, 0.9, hips.z) : new THREE.Vector3(0, 0.9, 0)
      ctx.camera.position.add(center.clone().sub(orbit.target))
      orbit.target.copy(center)
      orbit.update()
      const phase = sample.loopBlend ? '循环衔接' : '原始采样'
      title.textContent = `${selected.label} · 演员 ${selected.actor} · ${sample.frame + rangeStart} 帧 · ${phase}`
      details.textContent = `${selected.label} · ${selected.category}\n${selected.description}\n选区 ${Number(from.value).toFixed(1)}–${Number(to.value).toFixed(1)} s\n${selected.id} · 演员 ${selected.actor}\n${sample.frame + rangeStart} 帧 / ${motion.fps} fps · ${phase}\n源录制 ${selected.frames} 帧 / ${selected.duration.toFixed(2)} 秒\n来源 ${selected.source}\n${selected.sourcePath}`
      details.style.whiteSpace = 'pre-line'
      details.dataset.clip = selected.id
      clock.textContent = `${sample.time.toFixed(2)} s / ${sample.duration.toFixed(2)} s`
      timeline.value = String(sample.time)
    }
    function dispose(): void {
      request++
      orbit.dispose()
      diagram.dispose()
      ctx.scene.traverse(node => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          node.geometry.dispose()
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose()
        }
      })
      ctx.dispose()
    }
    requestAnimationFrame(animate)
    return container
  },
}

export default meta
export const Browse: StoryObj = { name: '分类浏览' }
