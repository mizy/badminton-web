import type { Meta, StoryObj } from '@storybook/html'
import { createPlayerMesh, syncPlayerMotion, syncPlayerMocap } from '../render/playerMesh'
import { createPlayer } from '../game/playerFactory'
import { MOTION_DEMOS, sampleMotionDemo, type MotionDemo } from './playerMotionDemo'
import { HDM05_CLIPS, loadHdm05Motion, createHdm05StrikeClip, type Hdm05Motion } from '../render/hdm05BadmintonMocap'
import { createCourt } from '../render/court'
import { mountScene } from './threeHelper'

const meta: Meta<{ motion: MotionDemo; modelUrl: string; modelTextureUrl: string; source: 'procedural' | 'hdm05'; clipId: string; fullTake: boolean }> = {
  title: '渲染/球员展示',
  tags: ['autodocs'],
  args: { motion: 'sixPoints', modelUrl: '/models/quaternius-player.glb', modelTextureUrl: '', source: 'procedural', clipId: 'dg-04-smash', fullTake: false },
  argTypes: { motion: { control: 'select', options: MOTION_DEMOS }, modelUrl: { control: 'text' },
    modelTextureUrl: { control: 'text' },
    source: { control: 'inline-radio', options: ['procedural', 'hdm05'] }, clipId: { control: 'select', options: HDM05_CLIPS }, fullTake: { control: 'boolean' } },
  render: ({ motion, modelUrl, modelTextureUrl, source, clipId, fullTake }) => {
    const container = document.createElement('div')
    container.style.cssText = 'width:100%;height:min(600px,100vh);min-height:340px;position:relative'
    const legend = document.createElement('div')
    legend.style.cssText = 'position:absolute;top:16px;left:16px;z-index:10;background:#14332ed9;padding:12px 18px;border-radius:8px;font:14px sans-serif;color:#edf3ec'
    legend.textContent = `模型绑定 · ${motion} · modelUrl 留空查看默认外观 · 共用动作骨架`
    container.appendChild(legend)
    const ctx = mountScene(container)
    createCourt(ctx.scene)
    const meshes = [
      createPlayerMesh({ body: 0x2f6fe0, head: 0xf3c9a4, racket: 0xf2f2f2, marker: 0x5ce1ff }, '', { labelScale: 0, modelUrl: modelUrl || undefined, modelTextureUrl: modelTextureUrl || undefined }),
      createPlayerMesh({ body: 0xe0475f, head: 0xd9a97f, racket: 0xf2f2f2, marker: 0xffa14f }, '', { labelScale: 0, modelUrl: modelUrl || undefined, modelTextureUrl: modelTextureUrl || undefined }),
    ]
    let capture: Hdm05Motion | null = null
    if (source === 'hdm05') {
      legend.textContent = '加载 HDM05…'
      void loadHdm05Motion(clipId).then(recording => {
        if (!ctx.animating) return
        capture = fullTake ? recording : createHdm05StrikeClip(recording)
        legend.textContent = `HDM05 ${clipId} · ${fullTake ? '完整录制' : '单次片段'} · 全幅动捕 · modelUrl 可切换外观`
      }).catch(error => { legend.textContent = String(error) })
    }
    const players = [createPlayer(0), createPlayer(1)]
    meshes.forEach(mesh => ctx.scene.add(mesh))
    ctx.camera.position.set(-3.45, 2.1, fullTake ? 7.5 : 4.6)
    ctx.camera.lookAt(-2.2, 1.2, 0)

    function animate() {
      if (!ctx.animating) return
      if (!container.isConnected) { ctx.dispose(); return }
      requestAnimationFrame(animate)
      const elapsed = ctx.clock.getElapsedTime()
      players.forEach((player, i) => {
        const side = i === 0 ? 1 : -1
        if (capture) {
          meshes[i].position.set(-2.2 - side * 0.85, 0, 0)
          meshes[i].rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2
          syncPlayerMocap(meshes[i], capture, elapsed)
        } else if (source === 'procedural') {
          sampleMotionDemo(player, motion, elapsed, -2.2 - side * 0.85)
          syncPlayerMotion(meshes[i], player, elapsed)
        }
      })
    }
    requestAnimationFrame(animate)
    return container
  },
}

export default meta
export const Default: StoryObj<typeof meta> = {}

export const HDM05: StoryObj<{ source: 'procedural' | 'hdm05' }> = { args: { source: 'hdm05' } }
