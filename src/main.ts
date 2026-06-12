/**
 * Badminton Web — 入口文件
 * @entry
 * 完整游戏：场景 + 双球员 + AI + 计分 + 自动演示 + 录像
 */

import * as THREE from 'three'
import { createCourt } from './render/court'
import { createShuttlecockMesh } from './render/shuttlecockMesh'
import { createGameCamera, updateCamera } from './render/camera'
import { createTrailSystem } from './render/trajectory'
import { createPlayerMesh, updatePlayerMesh, createGroundMarker } from './render/playerMesh'
import { gameReducer } from './game/reducer'
import type { GameAction } from './game/reducer'
import { createFullGameState } from './game/types'
import { createPlayer } from './game/playerFactory'
import { DemoController } from './demo/demoController'
import { getAIConfig } from './ai/difficulty'
import { Recorder } from './recording/recorder'
import { createScoreHUD } from './render/scoreHUD'
import { spawnImpactEffect, updateEffects } from './render/effects'
import { handleSetEnd } from './game/match'


// --- Scene Setup ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a2e)

const camera = createGameCamera()

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// Disable shadow map for software-renderer (SwiftShader) compatibility
document.body.appendChild(renderer.domElement)

// --- Court ---
createCourt(scene)

// --- Lighting ---
const ambient = new THREE.AmbientLight(0x404060, 0.5)
scene.add(ambient)

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
dirLight.position.set(10, 15, 10)
dirLight.castShadow = true
scene.add(dirLight)

const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5)
fillLight.position.set(-5, 5, -5)
scene.add(fillLight)

// --- Shuttlecock ---
const shuttleGroup = createShuttlecockMesh()
scene.add(shuttleGroup)

// --- Trail System ---
const trail = createTrailSystem(scene)

// --- Player Meshes (高饱和+标记色，便于视频中区分) ---
// 左侧(Home) = 亮蓝/青色系，右侧(Away) = 亮红/粉系，确保在低分辨率视频中也能区分
const homeMesh = createPlayerMesh({
  body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff,
}, 'A')
const awayMesh = createPlayerMesh({
  body: 0xff2255, head: 0xffcc99, racket: 0xcccccc, marker: 0xff44aa,
}, 'B')
scene.add(homeMesh)
scene.add(awayMesh)

// --- Ground position markers (跟随球员的彩色光环，提升 SwiftShader 下可见性) ---
const homeGroundMarker = createGroundMarker(0x00ddff)
const awayGroundMarker = createGroundMarker(0xff2255)
scene.add(homeGroundMarker)
scene.add(awayGroundMarker)

// --- Game State ---
let gameState = createFullGameState()
// 注入双方球员
gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: [createPlayer(0), createPlayer(1)] })

const cameraTarget = new THREE.Vector3(0, 1, 0)

// --- Demo Controller (auto-start for AI vs AI demo) ---
const demoController = new DemoController(getAIConfig('medium'), getAIConfig('medium'))
demoController.toggle() // auto-activate demo mode on load
console.log('[demo] AI vs AI demo started')

// --- Recorder ---
const recorder = new Recorder()
const RECORD_DURATION_MS = 25_000  // 25s to ensure multiple rallies captured
const RECORD_SAVE_FILENAME = 'badminton-demo.webm'
// Signal for Puppeteer capture script — set to true when game is init and running
;(window as any).__badminton_game_ready__ = false

// --- Rally stats ---
let rallyHits = 0
let lastRallyHits = 0

// --- Safety: force-serve if idle for too long ---
let idleSince = performance.now()

// --- Game ready signal (for Puppeteer capture script) ---
let gameReadySignaled = false

// --- Point scored timer ---
let pointScoredAt = 0

// --- Debug counter for game phase tracking ---
let phaseChangeCount = 0
const LOG_INTERVAL_MS = 3000 // log game status every 3s
let lastLogTime = 0

// --- 3D Score HUD (替代 HTML overlay，确保录像可见) ---
const scoreHUD = createScoreHUD()
// Attach directly to camera so it always stays in view (syncPosition handles this)
scene.add(scoreHUD.mesh)

  // --- 3D Game Status Mesh (PlaneGeometry + Canvas Texture) ---
  const statusCanvas = document.createElement('canvas')
  statusCanvas.width = 512
  statusCanvas.height = 128
  const sctx = statusCanvas.getContext('2d')!
  sctx.fillStyle = 'rgba(0,0,0,0.6)'
  roundRectPolyfill(sctx, 0, 0, 512, 128, 16)
  sctx.fill()
  sctx.fillStyle = '#00ff88'
  sctx.font = 'bold 36px monospace'
  sctx.textAlign = 'center'
  sctx.textBaseline = 'middle'
  sctx.fillText('🤖 AI DEMO — 自动对战', 256, 52)
  sctx.fillStyle = '#aaaaaa'
  sctx.font = '20px monospace'
  sctx.fillText('SPACE:发球  D:停止AI  R:录像', 256, 96)
  const statusTexture = new THREE.CanvasTexture(statusCanvas)
  const statusMat = new THREE.MeshBasicMaterial({
    map: statusTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const statusMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), statusMat)
  statusMesh.position.set(0, 1.2, 3.0)
  statusMesh.renderOrder = 998
  scene.add(statusMesh)
// --- HTML Score Overlay (交互时可见，补充 3D Sprite HUD) ---
const scoreOverlay = document.createElement('div')
scoreOverlay.id = 'score-overlay'
scoreOverlay.style.cssText = [
  'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
  'color:#fff', 'font:bold 28px/1.2 monospace', 'text-shadow:0 2px 8px rgba(0,0,0,0.9)',
  'z-index:10', 'text-align:center', 'pointer-events:none', 'user-select:none',
  'background:rgba(0,0,0,0.5)', 'padding:8px 24px', 'border-radius:12px',
  'backdrop-filter:blur(4px)', 'letter-spacing:2px',
].join(';')
scoreOverlay.textContent = '0 : 0'
document.body.appendChild(scoreOverlay)

// --- Score set info (under score) ---
const setOverlay = document.createElement('div')
setOverlay.id = 'set-overlay'
setOverlay.style.cssText = [
  'position:fixed', 'top:60px', 'left:50%', 'transform:translateX(-50%)',
  'color:#aaa', 'font:14px monospace', 'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
  'z-index:10', 'text-align:center', 'pointer-events:none', 'user-select:none',
].join(';')
setOverlay.textContent = ''
document.body.appendChild(setOverlay)

// --- Rally count overlay ---
const rallyOverlay = document.createElement('div')
rallyOverlay.id = 'rally-overlay'
rallyOverlay.style.cssText = [
  'position:fixed', 'top:85px', 'left:50%', 'transform:translateX(-50%)',
  'color:#ffcc00', 'font:16px monospace', 'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
  'z-index:10', 'text-align:center', 'pointer-events:none', 'user-select:none',
].join(';')
rallyOverlay.textContent = ''
document.body.appendChild(rallyOverlay)

// --- Minimal status text (仅交互时可见，录像不包含) ---
const statusEl = document.createElement('div')
statusEl.id = 'status'
statusEl.style.cssText = [
  'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
  'color:#aaa', 'font:14px monospace', 'text-shadow:0 1px 4px rgba(0,0,0,0.8)',
  'z-index:10', 'text-align:center', 'pointer-events:none', 'user-select:none',
].join(';')
statusEl.textContent = '🤖 AI 自动对战 (D: 关闭)'
document.body.appendChild(statusEl)

// --- Keyboard ---
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault()
    if (!gameState.shuttle) {
      trail.reset()
      const server = gameState.match?.server ?? 0
      gameState = gameReducer(gameState, { type: 'SERVE', playerIndex: server })
    }
  }
  if (e.code === 'KeyD') {
    e.preventDefault()
    const active = demoController.toggle()
    statusEl.textContent = active
      ? '🤖 AI 自动对战 (D: 关闭)'
      : 'SPACE: 发球 ｜ D: 自动对战 ｜ R: 录像'
  }
  if (e.code === 'KeyR') {
    e.preventDefault()
    if (recorder.isRecording()) {
      recorder.stop().then((blob: Blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `badminton-${Date.now()}.webm`
        a.click()
        URL.revokeObjectURL(url)
        statusEl.textContent = '✅ 录像已保存'
        setTimeout(() => {
          statusEl.textContent = 'SPACE: 发球 ｜ D: 自动对战 ｜ R: 录像'
        }, 2500)
      })
    } else {
      recorder.start(renderer.domElement)
      recordingStartTime = performance.now()
      statusEl.textContent = '🔴 录像中... (R: 停止)'
    }
  }
})

// --- Auto-serve when demo mode and shuttle is null ---
function autoServe(): void {
  if (demoController.isActive() && gameState.phase === 'idle' && !gameState.shuttle) {
    const server = gameState.match?.server ?? 0
    const st = gameReducer(gameState, { type: 'SERVE', playerIndex: server })
    if (st.shuttle) {
      trail.reset()
      rallyHits = 0
      gameState = st
      console.log(`[game] serve #${++phaseChangeCount} — server=${server}, shuttle=(${st.shuttle.pos[0].toFixed(1)}, ${st.shuttle.pos[1].toFixed(1)}, ${st.shuttle.pos[2].toFixed(1)}) vel=(${st.shuttle.vel[0].toFixed(1)}, ${st.shuttle.vel[1].toFixed(1)}, ${st.shuttle.vel[2].toFixed(1)})`)
    }
  }
  // Signal game ready after first serve attempt (even if it failed, the loop is running)
  if (!gameReadySignaled) {
    gameReadySignaled = true
    ;(window as any).__badminton_game_ready__ = true
  }
}

// --- Game Loop ---
let lastTime = performance.now()
let recordingStartTime = 0

// --- Auto-start recording after demo init (give game time for first serve) ---
setTimeout(() => {
  recorder.start(renderer.domElement)
  recordingStartTime = performance.now()
  statusEl.textContent = '🔴 录像中... (自动停止)'
  console.log('[recorder] started at', recordingStartTime)
}, 2000)

function animate(): void {
  requestAnimationFrame(animate)

  const now = performance.now()
  const dt = Math.min((now - lastTime) / 1000, 1 / 30)
  lastTime = now

  // Periodic status log for debugging (every 3s)
  if (now - lastLogTime > LOG_INTERVAL_MS) {
    lastLogTime = now
    const phase = gameState.phase
    const shuttle = gameState.shuttle
    const p0 = gameState.players[0]
    const p1 = gameState.players[1]
    console.log(`[status] phase=${phase} shuttle=${shuttle ? `(${shuttle.pos[0].toFixed(1)},${shuttle.pos[1].toFixed(1)},${shuttle.pos[2].toFixed(1)})` : 'null'} p0=(${p0?.pos[0].toFixed(1)},${p0?.pos[2].toFixed(1)}) p1=(${p1?.pos[0].toFixed(1)},${p1?.pos[2].toFixed(1)}) rally=${rallyHits} serves=${phaseChangeCount}`)
  }

  // --- Point scored timer (P1) ---
  if (gameState.phase === 'point_scored') {
    if (pointScoredAt === 0) {
      pointScoredAt = performance.now()
      lastRallyHits = rallyHits
      if (phaseChangeCount % 5 === 0) {
        console.log(`[game] point_scored — match pts=${gameState.match?.points[0]}:${gameState.match?.points[1]}`)
      }
    } else if (performance.now() - pointScoredAt >= 800) {
      gameState = { ...gameState, phase: 'idle' }
      pointScoredAt = 0
        idleSince = performance.now()
    }
  } else {
    pointScoredAt = 0
  }

  // --- Handle set_end: advance to next set or detect match end ---
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

  // --- Handle match_end: auto-reset after 4s ---
  if (gameState.phase === 'match_end' && gameState.match) {
    if (pointScoredAt > 0 && performance.now() - pointScoredAt >= 4000) {
      gameState = createFullGameState()
      gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: [createPlayer(0), createPlayer(1)] })
      pointScoredAt = 0
      rallyHits = 0
      lastRallyHits = 0
      statusEl.textContent = '🔄 新比赛开始!'
    }
  }

  // Demo AI: generate MOVE actions
  if (demoController.isActive()) {
    const actions = demoController.getActions(gameState)
    for (const action of actions) {
      gameState = gameReducer(gameState, action)
    }
  }

  // Auto-serve when ball is dead
  autoServe()

  // Safety: force serve if demo is stuck in idle without shuttle for >3s
  if (demoController.isActive() && gameState.phase === 'idle' && !gameState.shuttle) {
    if (performance.now() - idleSince > 3000) {
      const server = gameState.match?.server ?? 0
      const st = gameReducer(gameState, { type: 'SERVE', playerIndex: server })
      if (st.shuttle) {
        trail.reset()
        rallyHits = 0
        gameState = st
      }
      idleSince = performance.now()
      console.log('[safety] force-serve after idle timeout')
    }
  } else if (gameState.shuttle) {
    idleSince = performance.now()
  }

  // Game tick (physics + collision + scoring)
  const tickAction: GameAction & { type: 'TICK' } = {
    type: 'TICK',
    dt,
    aiConfigs: demoController.isActive() ? demoController.getAIConfigs() : undefined,
  }
  const prevShuttle = gameState.shuttle
  gameState = gameReducer(gameState, tickAction)

  // --- Rally hit tracking (P6) ---
  if (gameState.shuttle && prevShuttle) {
    const pv = prevShuttle.vel
    const cv = gameState.shuttle.vel
    const pSpeed2 = pv[0]*pv[0] + pv[1]*pv[1] + pv[2]*pv[2]
    const cSpeed2 = cv[0]*cv[0] + cv[1]*cv[1] + cv[2]*cv[2]
    // Detect hit: significant velocity magnitude change or direction reversal
    if (pSpeed2 > 0.5 && cSpeed2 > 0.5) {
      const dot = pv[0]*cv[0] + pv[1]*cv[1] + pv[2]*cv[2]
      const pSpeed = Math.sqrt(pSpeed2)
      const cSpeed = Math.sqrt(cSpeed2)
      // Direction reversal (dot < 0) or large speed change (>3x or <0.3x)
      if (dot < -pSpeed * cSpeed * 0.2 || cSpeed > pSpeed * 3 || cSpeed < pSpeed * 0.3) {
        rallyHits++
        spawnImpactEffect(gameState.shuttle.pos, Math.min(cSpeed / 40, 1))
      }
    }
  }

  // --- Auto-stop recording after duration (P5) ---
    if (recorder.isRecording() && recordingStartTime > 0 && (performance.now() - recordingStartTime) > RECORD_DURATION_MS) {
      recorder.stop().then((blob: Blob) => {
        console.log('[recorder] stopped, blob size:', blob.size)
        // Download for interactive use
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = RECORD_SAVE_FILENAME
        a.click()
        URL.revokeObjectURL(url)
        // Expose blob data for external capture script (Puppeteer)
        const reader = new FileReader()
        reader.onload = () => {
          (window as any).__badminton_recording__ = reader.result
          console.log('[recorder] exposed on window.__badminton_recording__')
        }
        reader.readAsDataURL(blob)
        statusEl.textContent = '✅ 录像已保存'
        setTimeout(() => {
          statusEl.textContent = 'SPACE: 发球  |  D: 自动对战  |  R: 录像'
        }, 2500)
      })
    }

  // --- Update visuals ---

  // Shuttle mesh + trail
  if (gameState.shuttle) {
    const pos = gameState.shuttle.pos
    shuttleGroup.position.set(pos[0], pos[1], pos[2])
    shuttleGroup.visible = true
    trail.update(pos)
  } else {
    shuttleGroup.visible = false
  }

  // Player meshes + ground markers
  if (gameState.players[0]) {
    updatePlayerMesh(homeMesh, gameState.players[0].pos, gameState.players[0].facing)
    homeGroundMarker.position.set(gameState.players[0].pos[0], 0.02, gameState.players[0].pos[2])
  }
  if (gameState.players[1]) {
    updatePlayerMesh(awayMesh, gameState.players[1].pos, gameState.players[1].facing)
    awayGroundMarker.position.set(gameState.players[1].pos[0], 0.02, gameState.players[1].pos[2])
  }

  // --- Score HUD (3D sprite, 被 canvas.captureStream 捕获) ---
  if (gameState.match) {
    const { points, sets, currentSet, isDeuce } = gameState.match
    const p0 = points[0]
    const p1 = points[1]
    const setStr = sets
      .slice(0, currentSet + 1)
      .map((s, idx) => `S${idx + 1}  ${s.home}-${s.away}`)
      .join('  |  ')
    const rally = gameState.shuttle ? rallyHits : (lastRallyHits > 0 ? lastRallyHits : 0)
    scoreHUD.update(p0, p1, setStr, rally, isDeuce)
    // HTML overlay
    scoreOverlay.textContent = isDeuce ? `${p0} : ${p1}  DEUCE` : `${p0} : ${p1}`
    setOverlay.textContent = setStr
    rallyOverlay.textContent = rally > 0 ? `🏸 ${rally}` : ''
  } else {
    scoreHUD.update(0, 0, '', 0, false)
    scoreOverlay.textContent = '0 : 0'
    setOverlay.textContent = ''
    rallyOverlay.textContent = ''
  }
  scoreHUD.syncPosition(camera)

  // Camera: fixed overview (no ball follow) — see camera.ts
  updateCamera(camera, cameraTarget)

  // Visual effects
  updateEffects(performance.now(), scene)

  renderer.render(scene, camera)
}

animate()

// --- Headless-mode safety: rAF fallback ---
// In headless Chrome (SwiftShader), requestAnimationFrame can stall.
// This interval ensures the game loop never stops.
let rafLastTime = performance.now()
const origRAF = window.requestAnimationFrame
window.requestAnimationFrame = function rAFWrap(cb: FrameRequestCallback): number {
  rafLastTime = performance.now()
  return origRAF.call(window, cb)
}
setInterval(() => {
  if (performance.now() - rafLastTime > 300) {
    // rAF stuck — re-invoke animate directly
    requestAnimationFrame(animate)
  }
}, 500)

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

/** roundRect polyfill for Canvas2D (compatible with older Chrome) */
function roundRectPolyfill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  // Manual path fallback
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
