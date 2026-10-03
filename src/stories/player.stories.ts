import type { Meta, StoryObj } from '@storybook/html'
import { createPlayerMesh, syncPlayerMotion, syncPlayerMocap } from '../render/playerMesh'
import { createPlayer } from '../game/playerFactory'
import { MOTION_DEMOS, sampleMotionDemo, type MotionDemo } from './playerMotionDemo'
import { HDM05_CLIPS, loadHdm05Motion, createHdm05StrikeClip, type Hdm05Motion } from '../render/hdm05BadmintonMocap'
import { createCourt } from '../render/court'
import { mountScene } from './threeHelper'
import type { MultiSenseCapture } from '../render/multisensePlayerMotion'

const meta: Meta<{ motion: MotionDemo; modelUrl: string; modelTextureUrl: string; source: 'procedural' | 'hdm05' | 'multisense'; clipId: string; fullTake: boolean; paused: boolean; time: number }> = {
  title: '渲染/球员展示',
  tags: ['autodocs'],
  args: { motion: 'sixPoints', modelUrl: '/models/anime-player.glb', modelTextureUrl: '', source: 'procedural', clipId: 'dg-04-smash', fullTake: false, paused: false, time: 0 },
  argTypes: { motion: { control: 'select', options: MOTION_DEMOS }, modelUrl: { control: 'text' },
    modelTextureUrl: { control: 'text' },
    paused: { control: 'boolean' }, time: { control: { type: 'range', min: 0, max: 18, step: 0.01 } },
    source: { control: 'inline-radio', options: ['procedural', 'hdm05', 'multisense'] }, clipId: { control: 'select', options: HDM05_CLIPS }, fullTake: { control: 'boolean' } },
  render: ({ motion, modelUrl, modelTextureUrl, source, clipId, fullTake, paused, time }) => {
    const container = document.createElement('div')
    container.style.cssText = 'width:100%;height:min(600px,100vh);min-height:340px;position:relative'
    const legend = document.createElement('div')
    legend.style.cssText = 'position:absolute;top:16px;left:16px;z-index:10;background:#14332ed9;padding:12px 18px;border-radius:8px;font:14px sans-serif;color:#edf3ec'
    legend.textContent = `模型绑定 · ${motion} · modelUrl 留空查看默认外观 · 共用动作骨架`
    container.appendChild(legend)
    const ctx = mountScene(container)
    createCourt(ctx.scene)
    const narrow = window.innerWidth < 600
    const meshes = [
      createPlayerMesh({ body: 0x2f6fe0, head: 0xf3c9a4, racket: 0xf2f2f2, marker: 0x5ce1ff }, '', { labelScale: 0, modelUrl: modelUrl || undefined, modelTextureUrl: modelTextureUrl || undefined }),
    ]
    if (!narrow) meshes.push(createPlayerMesh({ body: 0xe0475f, head: 0xd9a97f, racket: 0xf2f2f2, marker: 0xffa14f }, '', { labelScale: 0, modelUrl: modelUrl || undefined, modelTextureUrl: modelTextureUrl || undefined }))
    let capture: Hdm05Motion | MultiSenseCapture | null = null
    if (source === 'multisense') {
      legend.textContent = '加载专家反手动捕…'
      void fetch('/mocap/multisense-badminton/expert-backhand-Sub14.json').then(response => {
        if (!response.ok) throw new Error(`专家动作加载失败：${response.status}`)
        return response.json() as Promise<MultiSenseCapture>
      }).then(recording => {
        if (!ctx.animating) return
        capture = recording
        legend.textContent = 'MultiSense 专家组 Sub14 · 真实全身关节 · 球拍朝向由模型推导'
      }).catch(error => { legend.textContent = String(error) })
    }
    if (source === 'hdm05') {
      legend.textContent = '加载 HDM05…'
      void loadHdm05Motion(clipId).then(recording => {
        if (!ctx.animating) return
        capture = fullTake ? recording : createHdm05StrikeClip(recording)
        legend.textContent = `HDM05 ${clipId} · ${fullTake ? '完整录制' : '单次片段'} · 全幅动捕 · modelUrl 可切换外观`
      }).catch(error => { legend.textContent = String(error) })
    }
    const players = meshes.map((_, index) => createPlayer(index as 0 | 1))
    meshes.forEach(mesh => ctx.scene.add(mesh))
    ctx.camera.position.set(narrow ? -3.2 : -3.45, 2.1, fullTake ? 7.5 : narrow ? 5.2 : 4.6)
    ctx.camera.lookAt(-2.2, 1.2, 0)

    function animate() {
      if (!ctx.animating) return
      if (!container.isConnected) { ctx.dispose(); return }
      requestAnimationFrame(animate)
      const elapsed = paused ? time : ctx.clock.getElapsedTime()
      players.forEach((player, i) => {
        const side = i === 0 ? 1 : -1
        if (capture) {
          meshes[i].position.set(narrow ? -2.2 : -2.2 - side * 0.85, 0, 0)
          meshes[i].rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2
          syncPlayerMocap(meshes[i], capture, elapsed)
        } else if (source === 'procedural') {
          sampleMotionDemo(player, motion, elapsed, narrow ? -2.2 : -2.2 - side * 1.4)
          syncPlayerMotion(meshes[i], player, elapsed)
          if (i === 0 && motion === 'sixPoints') {
            const point = player.movement.footworkPoint
            const depth = point?.startsWith('front') ? '前场' : point?.startsWith('back') ? '后场' : '中场'
            const step = { ready: '准备', start: '分腿启动', chasse: '并步', cross: '交叉步', lunge: '跨步到位', retreat: '退步', recover: '蹬地回位' }[player.movement.footwork]
            legend.textContent = `六点步法 · ${point ? depth + (point.endsWith('left') ? '左侧' : '右侧') : '中心'} · ${step}`
          }
        }
      })
    }
    requestAnimationFrame(animate)
    return container
  },
}

export default meta
export const Default: StoryObj<typeof meta> = {}
export const BackhandDrive: StoryObj<{ motion: MotionDemo }> = { args: { motion: 'backhandDrive' } }
export const BackhandClear: StoryObj<{ motion: MotionDemo }> = { args: { motion: 'backhandClear' } }
export const ForehandLunge: StoryObj<{ motion: MotionDemo }> = { args: { motion: 'forehandLunge' } }
export const BackhandLunge: StoryObj<{ motion: MotionDemo }> = { args: { motion: 'backhandLunge' } }
export const ExpertBackhand: StoryObj<{ source: 'multisense' }> = { args: { source: 'multisense' } }

export const HDM05: StoryObj<{ source: 'procedural' | 'hdm05' }> = { args: { source: 'hdm05' } }
