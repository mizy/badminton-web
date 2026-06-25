import type { Meta, StoryObj } from '@storybook/html'
import * as THREE from 'three'
import { createCourt } from '../render/court'
import { createShuttlecockMesh } from '../render/shuttlecockMesh'
import { updateCamera, toggleCameraMode, getCameraMode } from '../render/camera'
import { createTrailSystem } from '../render/trajectory'
import { createPlayerMesh, updatePlayerMesh, createGroundMarker } from '../render/playerMesh'
import { gameReducer } from '../game/reducer'
import type { GameAction } from '../game/reducer'
import { createFullGameState } from '../game/types'
import { createPlayer } from '../game/playerFactory'
import { decideTactical } from '../ai/tactical'
import type { AIConfig } from '../ai/types'
import { getAIConfig } from '../ai/difficulty'
import { createScoreHUD } from '../render/scoreHUD'
import { spawnImpactEffect, updateEffects } from '../render/effects'
import { handleSetEnd } from '../game/match'
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

    // Players
    const homeMesh = createPlayerMesh({
      body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff,
    }, 'A')
    const awayMesh = createPlayerMesh({
      body: 0xff2255, head: 0xffcc99, racket: 0xcccccc, marker: 0xff44aa,
    }, 'B')
    ctx.scene.add(homeMesh)
    ctx.scene.add(awayMesh)

    const homeMarker = createGroundMarker(0x00ddff)
    const awayMarker = createGroundMarker(0xff2255)
    ctx.scene.add(homeMarker)
    ctx.scene.add(awayMarker)

    // Game state
    let gameState = createFullGameState()
    gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: [createPlayer(0), createPlayer(1)] })

    const homeConfig: AIConfig = getAIConfig(args.homeDifficulty)
    const awayConfig: AIConfig = getAIConfig(args.awayDifficulty)

    // Score HUD
    const scoreHUD = createScoreHUD()
    ctx.scene.add(scoreHUD.mesh)

    // Game stats
    let rallyHits = 0
    let lastRallyHits = 0
    let pointScoredAt = 0
    let idleSince = performance.now()

    // Control panel
    const controls = document.createElement('div')
    controls.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:8px;'
    const btnReset = document.createElement('button')
    btnReset.textContent = '🔄 重置比赛'
    btnReset.style.cssText = 'padding:6px 14px;border:none;border-radius:4px;background:#555;color:#fff;font:13px sans-serif;cursor:pointer;'
    btnReset.addEventListener('click', () => {
      gameState = createFullGameState()
      gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: [createPlayer(0), createPlayer(1)] })
      rallyHits = 0
      lastRallyHits = 0
      pointScoredAt = 0
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

      // --- Point scored timer ---
      if (gameState.phase === 'point_scored') {
        if (pointScoredAt === 0) {
          pointScoredAt = performance.now()
          lastRallyHits = rallyHits
        } else if (performance.now() - pointScoredAt >= 800) {
          gameState = { ...gameState, phase: 'idle' }
          pointScoredAt = 0
          idleSince = performance.now()
        }
      } else {
        pointScoredAt = 0
      }

      // --- Handle set_end ---
      if (gameState.phase === 'set_end' && gameState.match) {
        const newMatch = handleSetEnd(gameState.match)
        const homeSets = newMatch.sets.filter(s => s.home > s.away).length
        const awaySets = newMatch.sets.filter(s => s.away > s.home).length
        if (homeSets >= 2 || awaySets >= 2) {
          gameState = { ...gameState, match: newMatch, phase: 'match_end' }
          pointScoredAt = performance.now()
          lastRallyHits = rallyHits
        } else {
          gameState = { ...gameState, match: newMatch, phase: 'idle' }
          rallyHits = 0
          lastRallyHits = 0
        }
      }

      // --- Handle match_end: auto-reset ---
      if (gameState.phase === 'match_end' && gameState.match) {
        if (pointScoredAt > 0 && performance.now() - pointScoredAt >= 3000) {
          gameState = createFullGameState()
          gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: [createPlayer(0), createPlayer(1)] })
          pointScoredAt = 0
          rallyHits = 0
          lastRallyHits = 0
        }
      }

      // --- AI decisions ---
      if (gameState.phase === 'playing' && gameState.shuttle && gameState.players[0] && gameState.players[1]) {
        const p0 = gameState.players[0]
        const p1 = gameState.players[1]
        const shuttle = gameState.shuttle
        for (const pi of [0, 1] as const) {
          const config = pi === 0 ? homeConfig : awayConfig
          const player = pi === 0 ? p0 : p1
          const opponent = pi === 0 ? p1 : p0
          const decision = decideTactical(player, opponent, shuttle, config)
          const dx = decision.moveTarget[0] - player.pos[0]
          const dz = decision.moveTarget[2] - player.pos[2]
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist > 0.2) {
            gameState = gameReducer(gameState, { type: 'MOVE', playerIndex: pi as 0 | 1, dir: { x: dx / dist, z: dz / dist } })
          } else {
            gameState = gameReducer(gameState, { type: 'STOP_MOVE', playerIndex: pi as 0 | 1 })
          }
        }
      }

      // --- Auto-serve ---
      if (gameState.phase === 'idle' && !gameState.shuttle) {
        if (performance.now() - idleSince > 500) {
          const server = gameState.match?.server ?? 0
          const st = gameReducer(gameState, { type: 'SERVE', playerIndex: server })
          if (st.shuttle) {
            trail.reset()
            rallyHits = 0
            gameState = st
          }
          idleSince = performance.now()
        }
      } else if (gameState.shuttle) {
        idleSince = performance.now()
      }

      // --- Game tick ---
      const prevShuttle = gameState.shuttle
      const tickAction: GameAction & { type: 'TICK' } = {
        type: 'TICK',
        dt,
        aiConfigs: { home: homeConfig, away: awayConfig },
      }
      gameState = gameReducer(gameState, tickAction)

      // --- Rally hit tracking ---
      const currentShuttle = gameState.shuttle
      if (currentShuttle && prevShuttle) {
        const pv = prevShuttle.vel
        const cv = currentShuttle.vel
        const pSpeed2 = pv[0]*pv[0] + pv[1]*pv[1] + pv[2]*pv[2]
        const cSpeed2 = cv[0]*cv[0] + cv[1]*cv[1] + cv[2]*cv[2]
        if (pSpeed2 > 0.5 && cSpeed2 > 0.5) {
          const dot = pv[0]*cv[0] + pv[1]*cv[1] + pv[2]*cv[2]
          const pSpeed = Math.sqrt(pSpeed2)
          const cSpeed = Math.sqrt(cSpeed2)
          if (dot < -pSpeed * cSpeed * 0.2 || cSpeed > pSpeed * 3 || cSpeed < pSpeed * 0.3) {
            rallyHits++
            spawnImpactEffect(currentShuttle.pos, Math.min(cSpeed / 40, 1))
          }
        }
      }

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
        updatePlayerMesh(homeMesh, gameState.players[0].pos, gameState.players[0].facing)
        homeMarker.position.set(gameState.players[0].pos[0], 0.02, gameState.players[0].pos[2])
      }
      if (gameState.players[1]) {
        updatePlayerMesh(awayMesh, gameState.players[1].pos, gameState.players[1].facing)
        awayMarker.position.set(gameState.players[1].pos[0], 0.02, gameState.players[1].pos[2])
      }

      // --- Score HUD ---
      if (gameState.match) {
        const { points, sets, currentSet, isDeuce } = gameState.match
        const setStr = sets
          .slice(0, currentSet + 1)
          .map((s, idx) => `S${idx + 1}  ${s.home}-${s.away}`)
          .join('  |  ')
        const rally = gameState.shuttle ? rallyHits : (lastRallyHits > 0 ? lastRallyHits : 0)
        scoreHUD.update(points[0], points[1], setStr, rally, isDeuce)
      }
      scoreHUD.syncPosition(ctx.camera)

      const cameraTargetPlayer = gameState.players[0]
      updateCamera(ctx.camera, cameraTargetPlayer?.pos)

      // Effects
      updateEffects(performance.now(), ctx.scene)

      ctx.renderer.render(ctx.scene, ctx.camera)
    }
    animate()

    // Override cleanup
    const origDispose = ctx.dispose
    ctx.dispose = () => {
      origDispose()
      trail.dispose()
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
