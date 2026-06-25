import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { createCourt } from '../render/court'
import { mountScene } from './threeHelper'

const meta: Meta = {
  title: '渲染/击球特效',
  tags: ['autodocs'],
  render: () => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    const ctx = mountScene(container)
    createCourt(ctx.scene)
    ctx.camera.position.set(0, 3, 6)
    ctx.camera.lookAt(0, 1.5, 0)

    // Control buttons
    const btnGroup = document.createElement('div')
    btnGroup.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:10px;'

    const btnSingle = document.createElement('button')
    btnSingle.textContent = '💥 单次击球'
    btnSingle.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#ffcc00;color:#000;font:bold 14px sans-serif;cursor:pointer;'
    btnSingle.addEventListener('click', () => {
      spawnImpactEffect([0, 1.5, 0], 1.0)
    })
    btnGroup.appendChild(btnSingle)

    const btnMulti = document.createElement('button')
    btnMulti.textContent = '💥💥 连续击球'
    btnMulti.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#ff6644;color:#fff;font:bold 14px sans-serif;cursor:pointer;'
    btnMulti.addEventListener('click', () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          const x = (Math.random() - 0.5) * 4
          const z = (Math.random() - 0.5) * 3
          spawnImpactEffect([x, 1.0 + Math.random(), z], 0.6 + Math.random() * 0.5)
        }, i * 300)
      }
    })
    btnGroup.appendChild(btnMulti)

    const btnClear = document.createElement('button')
    btnClear.textContent = '✕ 清除'
    btnClear.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#555;color:#fff;font:bold 14px sans-serif;cursor:pointer;'
    btnClear.addEventListener('click', () => {
      // Re-create scene effects by removing all children with RingGeometry
      const toRemove: THREE.Mesh[] = []
      ctx.scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) {
          toRemove.push(child)
        }
      })
      toRemove.forEach(m => {
        ctx.scene.remove(m)
        m.geometry.dispose()
      })
    })
    btnGroup.appendChild(btnClear)

    container.appendChild(btnGroup)

    // Info text
    const info = document.createElement('div')
    info.style.cssText = 'position:absolute;top:8px;left:8px;color:#ccc;font:13px monospace;z-index:10;background:rgba(0,0,0,0.6);padding:6px 12px;border-radius:4px;'
    info.textContent = '点击「单次击球」触发冲击波特效，动画自动缩放 + 淡出'
    container.appendChild(info)

    // Auto-trigger one effect on mount for demo
    setTimeout(() => {
      spawnImpactEffect([0, 1.5, 0], 1.0)
      info.textContent = '💥 首次击球效果展示 — 试试点击按钮！'
    }, 500)

    // Main loop to update effects
    function loop() {
      if (!ctx.animating) return
      requestAnimationFrame(loop)
      updateEffects(performance.now(), ctx.scene)
    }
    loop()

    return container
  },
}

export default meta
export const Default: StoryObj = {}
