import * as THREE from 'three'
import { getAIConfig } from '../ai/difficulty'
import type { AIConfig } from '../ai/types'
import { DemoController } from '../demo/demoController'
import { createPlayer } from '../game/playerFactory'
import { gameReducer, type PlayerGameAction } from '../game/reducer'
import { createFullGameState, type GameState } from '../game/types'
import { createKeyboardAdapter, type InputEvent } from '../input'
import { Recorder } from '../recording/recorder'
import { createGameCamera } from '../render/camera'
import { createCourt } from '../render/court'
import { connectPlayHotkeys } from './hotkeys'
import { stepFrame, syncFrameView, type PlaySceneObjects } from './frame'
import { createGameHUD } from '../render/hud'
import { createGroundMarker, createPlayerMesh } from '../render/playerMesh'
import { createShuttlecockMesh } from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { createViewState } from './viewState'

const STATUS_TEXT = '🧑 Human vs 🤖 AI  -  WASD + J + Space'
const RECORD_SAVE_FILENAME = 'badminton-demo.webm'

interface PlayStartObjects extends PlaySceneObjects {
  renderer: THREE.WebGLRenderer
}

export function startGame(): void {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  const objects = createPlayObjects(scene)
  const hud = createGameHUD(scene, STATUS_TEXT)
  const recorder = new Recorder()
  const viewState = createViewState()
  const homeConfig: AIConfig = getAIConfig('medium')
  const awayConfig: AIConfig = getAIConfig('medium')
  const demo = new DemoController(homeConfig, awayConfig, true)

  let gameState = createFullGameState()
  gameState = gameReducer(gameState, { type: 'SET_PLAYERS', players: createMatchPlayers() })
  ;(window as any).__badminton_game_ready__ = false

  console.log('[game] Demo mode - both players AI')

  const keyboard = createKeyboardAdapter(0)
  keyboard.connect((event) => {
    const previousShuttle = gameState.shuttle
    gameState = gameReducer(gameState, toPlayerAction(event))
    if (event.action.type === 'SERVE' && !previousShuttle && gameState.shuttle) {
      objects.trail.reset()
      viewState.rallyHits = 0
    }
  })

  connectPlayHotkeys(() => {
    if (recorder.isRecording()) {
      stopRecording(`badminton-${Date.now()}.webm`, false)
      return
    }

    startRecording('🔴 录像中... (R: 停止)')
  })

  setTimeout(() => {
    startRecording('🔴 录像中... (自动停止)')
    console.log('[recorder] started at', viewState.recordingStartTime)
  }, 2000)

  function animate(): void {
    requestAnimationFrame(animate)

    const now = performance.now()
    gameState = stepFrame(now, gameState, viewState, {
      demo,
      hud,
      objects,
      onAutoStopRecording: () => stopRecording(RECORD_SAVE_FILENAME, true),
      recorder,
    })
    syncFrameView(now, gameState, viewState, hud, objects)
    objects.renderer.render(scene, objects.camera)
  }

  animate()
  installAnimationFallback(animate)

  window.addEventListener('resize', () => {
    objects.camera.aspect = window.innerWidth / window.innerHeight
    objects.camera.updateProjectionMatrix()
    objects.renderer.setSize(window.innerWidth, window.innerHeight)
  })

  function startRecording(text: string): void {
    if (recorder.isRecording()) return
    recorder.start(objects.renderer.domElement)
    viewState.recordingStartTime = performance.now()
    hud.setStatusText(text)
  }

  function stopRecording(filename: string, exposeForCapture: boolean): void {
    if (!recorder.isRecording()) return

    viewState.recordingStartTime = 0
    recorder.stop().then((blob: Blob) => {
      console.log('[recorder] stopped, blob size:', blob.size)
      downloadBlob(blob, filename)

      if (exposeForCapture) {
        const reader = new FileReader()
        reader.onload = () => {
          ;(window as any).__badminton_recording__ = reader.result
          console.log('[recorder] exposed on window.__badminton_recording__')
        }
        reader.readAsDataURL(blob)
      }

      hud.setStatusText('✅ 录像已保存')
      setTimeout(() => {
        hud.resetStatusText()
      }, 2500)
    })
  }
}

function createMatchPlayers(): GameState['players'] {
  return [createPlayer(0), createPlayer(1)]
}

function createPlayObjects(scene: THREE.Scene): PlayStartObjects {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  const camera = createGameCamera()
  createCourt(scene)

  const ambient = new THREE.AmbientLight(0x404060, 0.5)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
  dirLight.position.set(10, 15, 10)
  dirLight.castShadow = true
  scene.add(dirLight)

  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5)
  fillLight.position.set(-5, 5, -5)
  scene.add(fillLight)

  const shuttleGroup = createShuttlecockMesh()
  scene.add(shuttleGroup)

  const trail = createTrailSystem(scene)
  const homeMesh = createPlayerMesh({ body: 0x00ddff, head: 0xffcc99, racket: 0xcccccc, marker: 0x00ffff }, 'A')
  const awayMesh = createPlayerMesh({ body: 0xff2255, head: 0xffcc99, racket: 0xcccccc, marker: 0xff44aa }, 'B')
  scene.add(homeMesh)
  scene.add(awayMesh)

  const homeGroundMarker = createGroundMarker(0x00ddff)
  const awayGroundMarker = createGroundMarker(0xff2255)
  scene.add(homeGroundMarker)
  scene.add(awayGroundMarker)

  return {
    awayGroundMarker,
    awayMesh,
    camera,
    homeGroundMarker,
    homeMesh,
    renderer,
    scene,
    shuttleGroup,
    trail,
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function installAnimationFallback(animate: () => void): void {
  let rafLastTime = performance.now()
  const originalRAF = window.requestAnimationFrame

  window.requestAnimationFrame = function rAFWrap(callback: FrameRequestCallback): number {
    rafLastTime = performance.now()
    return originalRAF.call(window, callback)
  }

  setInterval(() => {
    if (performance.now() - rafLastTime > 300) {
      requestAnimationFrame(animate)
    }
  }, 500)
}

function toPlayerAction(event: InputEvent): PlayerGameAction {
  return { ...event.action, playerIndex: event.playerIndex }
}
