/** Isolated animation acceptance: imports joints/motion, never a character skin or model loader. */
import * as THREE from 'three'
import type { Meta, StoryObj } from '@storybook/html'
import { createPlayer } from '../game/playerFactory'
import { ANKLE_HEIGHT, createPlayerSkeleton } from '../render/playerSkeleton'
import { createPlayerMotion, updatePlayerMotion } from '../render/playerMotion'
import { MOTION_DEMOS, sampleMotionDemo, type MotionDemo } from './playerMotionDemo'
import { applyHdm05PlayerMotion } from '../render/hdm05PlayerMotion'
import { HDM05_CLIPS, loadHdm05Motion, createHdm05StrikeClip, sampleHdm05Playback, type Hdm05Motion } from '../render/hdm05BadmintonMocap'
import { createSkeletonDiagram } from './playerSkeletonDiagram'
import { mountScene } from './threeHelper'

const meta: Meta<{ motion: MotionDemo; side: 0 | 1; source: 'procedural' | 'hdm05'; clipId: string; fullTake: boolean }> = {
  title: '渲染/动作骨架',
  args: { motion: 'lateral', side: 0, source: 'procedural', clipId: 'dg-04-smash', fullTake: false },
  argTypes: { motion: { control: 'select', options: MOTION_DEMOS }, side: { control: 'inline-radio', options: [0, 1] },
    source: { control: 'inline-radio', options: ['procedural', 'hdm05'] }, clipId: { control: 'select', options: HDM05_CLIPS }, fullTake: { control: 'boolean' } },
  render: ({ motion, side, source, clipId, fullTake }) => {
    const container = document.createElement('div')
    container.style.cssText = 'height:min(640px,100vh);min-height:340px;position:relative;background:#101d28;color:#edf3ec;font:14px sans-serif'
    const ctx = mountScene(container)
    ctx.scene.background = new THREE.Color(0x101d28)
    ctx.camera.position.set(3.4, 2.3, 4.8)
    ctx.camera.lookAt(0, 0.95, 0)
    const skeleton = createPlayerSkeleton()
    let rig = createPlayerMotion(skeleton)
    const player = createPlayer(side)
    ctx.scene.add(skeleton.group)
    const diagram = createSkeletonDiagram(ctx.scene)
    const panel = document.createElement('div')
    panel.style.cssText = 'position:absolute;left:12px;top:12px;width:290px;padding:12px;background:#102a34e8;border:1px solid #365765;border-radius:8px'
    panel.innerHTML = '<b>动作骨架 · 独立验证</b><p style="margin:8px 0">青色右侧 · 紫色左侧 · 黄色拍轴 · 橙色拍面法线 · 灰色落脚轨迹<br>Controls 切换程序动作 / HDM05、录制片段和完整回放；无人物模型加载。</p><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button data-play>暂停</button><button data-step>前进一帧</button><button data-reset>重播</button><label>速度 <select data-rate><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label><label>时间 <input data-time type="range" min="0" max="12" step="0.0166667" value="0"></label><output data-clock>0.00 s</output></div><div data-metrics style="margin-top:10px;font:12px monospace"></div>'
    container.appendChild(panel)
    const play = panel.querySelector<HTMLButtonElement>('[data-play]')!
    const timeline = panel.querySelector<HTMLInputElement>('[data-time]')!
    const rate = panel.querySelector<HTMLSelectElement>('[data-rate]')!
    const clock = panel.querySelector<HTMLOutputElement>('[data-clock]')!
    const metrics = panel.querySelector<HTMLElement>('[data-metrics]')!
    let playing = true
    let time = 0
    let capture: Hdm05Motion | null = null
    let duration = 12
    let loadError = ''
    if (source === 'hdm05') {
      void loadHdm05Motion(clipId).then(recording => {
        if (!ctx.animating) return
        capture = fullTake ? recording : createHdm05StrikeClip(recording)
        duration = sampleHdm05Playback(capture, 0).duration
        timeline.max = String(duration)
        time = 0
        dirty = true
      }).catch(error => { loadError = String(error); dirty = true })
    }
    let previous = performance.now()
    let dirty = true
    const reset = () => { rig = createPlayerMotion(skeleton); diagram.trails.forEach(path => path.length = 0); dirty = true }
    play.onclick = () => { playing = !playing; play.textContent = playing ? '暂停' : '播放'; previous = performance.now() }
    panel.querySelector<HTMLButtonElement>('[data-step]')!.onclick = () => {
      playing = false; play.textContent = '播放'; time += 1 / (capture?.fps ?? 60); dirty = true
    }
    panel.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => { time = 0; reset() }
    timeline.oninput = () => { playing = false; play.textContent = '播放'; time = Number(timeline.value); reset() }
    function animate(now: number) {
      if (!ctx.animating) return
      if (!container.isConnected) { diagram.dispose(); ctx.dispose(); return }
      requestAnimationFrame(animate)
      if (playing) { time += Math.min((now - previous) / 1000, 0.05) * Number(rate.value); dirty = true }
      previous = now
      if (!dirty) return
      if (time >= duration) { time = 0; reset() }
      let sourceFrame = 0
      let loopBlend = false
      if (capture) {
        skeleton.group.rotation.y = side === 0 ? Math.PI / 2 : -Math.PI / 2
        const sample = applyHdm05PlayerMotion(skeleton, capture, time)
        sourceFrame = sample.frame
        loopBlend = sample.loopBlend
      } else if (source === 'procedural') {
        sampleMotionDemo(player, motion, time, 0)
        updatePlayerMotion(rig, player, time)
      }
      diagram.update(skeleton)
      let error = 0
      for (const limb of [rig.rightArm, rig.leftArm, rig.rightLeg, rig.leftLeg]) {
        const root = limb.root.getWorldPosition(new THREE.Vector3())
        const joint = limb.joint.getWorldPosition(new THREE.Vector3())
        const end = limb.end.getWorldPosition(new THREE.Vector3())
        error = Math.max(error, Math.abs(root.distanceTo(joint) - limb.lengths[0]), Math.abs(joint.distanceTo(end) - limb.lengths[1]))
      }
      const feet = [rig.rightLeg, rig.leftLeg].map(limb => limb.end.getWorldPosition(new THREE.Vector3()).y - ANKLE_HEIGHT)
      const action = capture ? `HDM05 ${capture.id} · ${sourceFrame} 帧 / ${capture.fps} fps · ${fullTake ? '完整录制' : '单次片段'}`
        : source === 'hdm05' ? loadError || '加载 HDM05…' : `动作 ${motion}`
      metrics.textContent = `${action}  |  骨长误差 ${(error * 1000).toFixed(5)} mm  |  足底参考 R ${feet[0].toFixed(3)} / L ${feet[1].toFixed(3)} m  |  ${capture ? loopBlend ? "循环衔接" : "原始采样" : player.body.phase}`
      metrics.dataset.boneError = String(error)
      metrics.dataset.time = String(time)
      timeline.value = String(time)
      clock.value = `${time.toFixed(2)} s`
      dirty = false
    }
    requestAnimationFrame(animate)
    return container
  },
}

export default meta
export const Default: StoryObj<typeof meta> = {}

export const HDM05: StoryObj<{ source: 'procedural' | 'hdm05' }> = { args: { source: 'hdm05' } }
