import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createCourt } from '../render/court'
import { createShuttlecockMesh } from '../render/shuttlecockMesh'
import { updateCamera, toggleCameraMode, getCameraMode } from '../render/camera'
import { createTrailSystem } from '../render/trajectory'
import { createGroundMarker } from '../render/playerMesh'
import { createSkeletalPlayer } from '../render/skeletalPlayer'
import type { BadmintonAction } from '../render/skeletalBadminton'
import { createBasicRallyOptions, createBasicRallyState, stepBasicRally } from '../play/basicRally'
import { getAIConfig } from '../ai/difficulty'
import { createScoreHUD } from '../render/scoreHUD'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { mountScene } from './threeHelper'

type Difficulty = 'easy' | 'medium' | 'hard'

const meta: Meta<{ homeDifficulty: Difficulty; awayDifficulty: Difficulty; camera: 'overhead' | 'third_person' }> = {
  title: '游戏/完整比赛演示',
  tags: ['autodocs'],
  argTypes: {
    homeDifficulty: { control: 'select', options: ['easy', 'medium', 'hard'], defaultValue: 'medium' },
    awayDifficulty: { control: 'select', options: ['easy', 'medium', 'hard'], defaultValue: 'medium' },
    camera: { control: 'select', options: ['overhead', 'third_person'], defaultValue: 'overhead' },
  },
  render: (args) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '600px'
    container.style.position = 'relative'

    // Overlay: score + controls info
    const infoEl = document.createElement('div')
    infoEl.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;background:rgba(0,0,0,0.7);padding:8px 14px;border-radius:6px;font:13px monospace;color:#aaa;text-align:right;'
    infoEl.innerHTML = `
      <div>🏠 ${args.homeDifficulty} vs 🤖 ${args.awayDifficulty}</div>
      <div style="color:#666;font-size:11px;">C: 切换视角 · R: 重置</div>
    `
    container.appendChild(infoEl)

    const ctx = mountScene(container)
    ctx.scene.background = new THREE.Color(0x1a1a2e)
    ctx.camera.position.set(0, 7, 8)
    ctx.camera.lookAt(0, 0, 0)

    // Set initial camera mode from args
    if (args.camera === 'third_person') {
      while (getCameraMode() !== 'third_person') toggleCameraMode()
    } else {
      while (getCameraMode() !== 'overhead') toggleCameraMode()
    }

    // Court
    createCourt(ctx.scene)

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.5)
    ctx.scene.add(ambient)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(10, 15, 10)
    ctx.scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5)
    fillLight.position.set(-5, 5, -5)
    ctx.scene.add(fillLight)

    // Shuttle
    const shuttleGroup = createShuttlecockMesh()
    ctx.scene.add(shuttleGroup)

    // Trail
    const trail = createTrailSystem(ctx.scene)

    // Players — 骨骼模型（xbot.glb + 羽毛球动作状态机）
    const homePlayer = createSkeletalPlayer(ctx.scene)
    const awayPlayer = createSkeletalPlayer(ctx.scene)

    const homeMarker = createGroundMarker(0x00ddff)
    const awayMarker = createGroundMarker(0xff2255)
    ctx.scene.add(homeMarker)
    ctx.scene.add(awayMarker)

    // The demo owns its pacing; rules, positioning and AI stay in the reducer.
    let rally = createBasicRallyState()
    const options = createBasicRallyOptions(args.homeDifficulty)
    options.awayAI = getAIConfig(args.awayDifficulty)
    options.autoServeDelaySeconds = 0.5
    options.pointPauseSeconds = 0.8
    let matchEndSeconds = 0

    // Score HUD
    const scoreHUD = createScoreHUD()
    ctx.scene.add(scoreHUD.mesh)

    // Control panel
    const controls = document.createElement('div')
    controls.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:8px;'
    const btnReset = document.createElement('button')
    btnReset.textContent = '🔄 重置比赛'
    btnReset.style.cssText = 'padding:6px 14px;border:none;border-radius:4px;background:#555;color:#fff;font:13px sans-serif;cursor:pointer;'
    btnReset.addEventListener('click', () => {
      rally = createBasicRallyState()
      matchEndSeconds = 0
      trail.reset()
      homePlayer.play('ready')
      awayPlayer.play('ready')
    })
    controls.appendChild(btnReset)

    const btnCam = document.createElement('button')
    btnCam.textContent = '📷 切换视角'
    btnCam.style.cssText = 'padding:6px 14px;border:none;border-radius:4px;background:#4488cc;color:#fff;font:13px sans-serif;cursor:pointer;'
    btnCam.addEventListener('click', () => {
      toggleCameraMode()
      btnCam.textContent = `📷 ${getCameraMode() === 'overhead' ? '俯瞰' : '第三人称'}`
    })
    controls.appendChild(btnCam)

    // Difficulty display
    const diffDisplay = document.createElement('div')
    diffDisplay.style.cssText = 'color:#888;font:12px monospace;padding:6px 12px;background:rgba(0,0,0,0.5);border-radius:4px;'
    diffDisplay.textContent = `🏠 ${args.homeDifficulty}  ·  🤖 ${args.awayDifficulty}`
    controls.appendChild(diffDisplay)

    container.appendChild(controls)

    // Keyboard shortcut hint
    const hint = document.createElement('div')
    hint.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:10;color:#666;font:12px sans-serif;background:rgba(0,0,0,0.4);padding:4px 12px;border-radius:4px;'
    hint.textContent = 'C: 切换视角  |  R: 重置比赛'
    container.appendChild(hint)

    // Game loop
    let lastTime = performance.now()

    function animate() {
      if (!ctx.animating) return
      requestAnimationFrame(animate)

      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 1 / 30)
      lastTime = now

      // Only this story loops completed matches; the main game keeps match_end.
      if (rally.game.phase === 'match_end') matchEndSeconds += dt
      else matchEndSeconds = 0
      if (rally.game.phase !== 'match_end' || matchEndSeconds >= 3) {
        const result = stepBasicRally(rally, dt, options)
        rally = result.rally
        if (result.events.served || result.events.restarted) trail.reset()
        if (result.events.restarted) {
          matchEndSeconds = 0
          homePlayer.play('ready')
          awayPlayer.play('ready')
        }
        if (result.events.served) {
          const serverPlayer = rally.game.match?.server === 1 ? awayPlayer : homePlayer
          serverPlayer.play('serve')
        }
        if (result.events.hit) triggerSwing()
      }
      const gameState = rally.game

      // --- Update visuals ---
      if (gameState.shuttle) {
        const pos = gameState.shuttle.pos
        shuttleGroup.position.set(pos[0], pos[1], pos[2])
        shuttleGroup.visible = true
        trail.update(pos)
      } else {
        shuttleGroup.visible = false
      }

      if (gameState.players[0]) {
        homePlayer.place(gameState.players[0].pos, gameState.players[0].facing)
        homeMarker.position.set(gameState.players[0].pos[0], 0.02, gameState.players[0].pos[2])
      }
      if (gameState.players[1]) {
        awayPlayer.place(gameState.players[1].pos, gameState.players[1].facing)
        awayMarker.position.set(gameState.players[1].pos[0], 0.02, gameState.players[1].pos[2])
      }
      homePlayer.update(dt)
      awayPlayer.update(dt)

      // --- Score HUD ---
      if (gameState.match) {
        const { points, sets, currentSet, isDeuce } = gameState.match
        const setStr = sets
          .slice(0, currentSet + 1)
          .map((s, idx) => `S${idx + 1}  ${s.home}-${s.away}`)
          .join('  |  ')
        const hits = gameState.shuttle ? rally.stats.hitCount : rally.stats.lastRallyHits
        scoreHUD.update(points[0], points[1], setStr, hits, isDeuce)
      }
      scoreHUD.syncPosition(ctx.camera)

      const cameraTargetPlayer = gameState.players[0]
      updateCamera(ctx.camera, cameraTargetPlayer?.pos)

      // Effects
      updateEffects(performance.now(), ctx.scene)

      ctx.renderer.render(ctx.scene, ctx.camera)
    }
    animate()

    /** Animate the recorded contact, independent of court end or shuttle velocity. */
    function triggerSwing(): void {
      const hitterIndex = rally.game.lastHitter
      if (hitterIndex === null) return
      const hitter = rally.game.players[hitterIndex]
      if (!hitter) return
      const action: BadmintonAction = ({
        CLEAR: hitter.grip === 'backhand' ? 'backhand_clear' : 'forehand_clear',
        DRIVE: hitter.grip === 'backhand' ? 'backhand_drive' : 'forehand_drive',
        SMASH: 'smash',
        DROP: 'drop',
        NET_DROP: 'net_shot',
        LIFT: 'lift',
      } as const)[hitter.swing.shot]
      const contactPos = hitter.contactPose?.stringCenter
      if (contactPos) spawnImpactEffect(contactPos, Math.min(Math.hypot(...hitter.racket.vel) / 40, 1))
      const player = hitterIndex === 0 ? homePlayer : awayPlayer
      player.play(action)
    }

    // Override cleanup
    const origDispose = ctx.dispose
    ctx.dispose = () => {
      origDispose()
      trail.dispose()
      scoreHUD.detach(ctx.scene)
      homePlayer.dispose()
      awayPlayer.dispose()
    }

    return container
  },
}

export default meta
export const MediumVsMedium: StoryObj = {
  args: { homeDifficulty: 'medium', awayDifficulty: 'medium', camera: 'overhead' },
}
export const HardVsHard: StoryObj = {
  args: { homeDifficulty: 'hard', awayDifficulty: 'hard', camera: 'overhead' },
}
export const EasyVsHard: StoryObj = {
  args: { homeDifficulty: 'easy', awayDifficulty: 'hard', camera: 'third_person' },
}
export const ThirdPersonView: StoryObj = {
  args: { homeDifficulty: 'medium', awayDifficulty: 'medium', camera: 'third_person' },
}
