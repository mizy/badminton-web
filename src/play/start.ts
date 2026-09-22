import * as THREE from 'three'
import { createPlayer } from '../game/playerFactory'
import { gameReducer, type GameAction } from '../game/reducer'
import { createFullGameState, type GameState } from '../game/types'
import { createKeyboardAdapter, type InputEvent } from '../input'
import { getAIConfig } from '../ai/difficulty'
import { getPersona } from '../ai/personas'
import { Recorder } from '../recording/recorder'
import { createGameCamera } from '../render/camera'
import { createCourt } from '../render/court'
import { connectPlayHotkeys } from './hotkeys'
import { stepFrame, syncFrameView, type PlaySceneObjects } from './frame'
import { createGroundMarker, createPlayerMesh } from '../render/playerMesh'
import { createShuttlecockMesh } from '../render/shuttlecockMesh'
import { createTrailSystem } from '../render/trajectory'
import { createViewState } from './viewState'
import { createPlayUI, type SessionOptions } from './ui'

interface PlayStartObjects extends PlaySceneObjects { renderer: THREE.WebGLRenderer }

export function startGame(): () => void {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c2423)
  const objects = createPlayObjects(scene)
  const recorder = new Recorder()
  const view = createViewState()
  let state = gameReducer(createFullGameState(), { type: 'START_SESSION', mode: 'match', players: [createPlayer(0), createPlayer(1)] })
  let options: SessionOptions = { mode: 'training', persona: 'chen-wen', difficulty: 'medium', style: 'rally', loadout: 'balanced' }
  let active = false
  let prediction = true
  let soundEnabled = true
  let audio: AudioContext | null = null
  let animation = 0
  let recordingBusy = false
  let keyboard = createKeyboardAdapter(0, undefined, () => state.players[0]?.side ?? 0)
  const ui = createPlayUI({
    start: startSession,
    pause: () => dispatch({ type: 'PAUSE', playerIndex: 0 }),
    restart: () => startSession(options),
    nextSet: () => dispatch({ type: 'RESOLVE_SET_END' }),
    menu: () => {
      if (state.phase !== 'paused') dispatch({ type: 'PAUSE', playerIndex: 0 })
      active = false
      keyboard.disconnect()
      ui.showMenu()
    },
    record: () => { void toggleRecording() },
    sound: enabled => { soundEnabled = enabled; if (enabled) unlockAudio() },
    prediction: enabled => { prediction = enabled },
  })
  const disconnectHotkeys = connectPlayHotkeys(() => { if (active) void toggleRecording() })

  function dispatch(action: GameAction): void {
    const wasPaused = state.phase === 'paused'
    state = gameReducer(state, action)
    if (!wasPaused && state.phase === 'paused') keyboard.disconnect()
    if (wasPaused && state.phase !== 'paused' && active) keyboard.connect(handleInput)
    ui.update(state)
    if (wasPaused && state.phase !== 'paused' && active) objects.renderer.domElement.focus({ preventScroll: true })
  }

  function handleInput(event: InputEvent): void {
    if (!active || state.controls[event.playerIndex] !== 'human') return
    dispatch({ ...event.action, playerIndex: event.playerIndex })
  }

  function startSession(nextOptions: SessionOptions): void {
    options = nextOptions
    keyboard.disconnect()
    const players: GameState['players'] = [createPlayer(0), createPlayer(1)]
    players[0]!.loadout = nextOptions.loadout
    players[1]!.loadout = nextOptions.loadout
    const persona = getPersona(nextOptions.persona)
    players[1]!.serveSelection = persona.serve
    state = gameReducer(state, { type: 'START_SESSION', mode: options.mode, players })
    active = true
    prediction = options.mode === 'training'
    view.accumulator = 0
    view.lastTime = performance.now()
    view.lastRallyId = -1
    keyboard = createKeyboardAdapter(0, undefined, () => state.players[0]?.side ?? 0)
    keyboard.connect(handleInput)
    ui.update(state)
    objects.renderer.domElement.focus({ preventScroll: true })
    unlockAudio()
  }

  function unlockAudio(): void {
    if (!soundEnabled) return
    audio ??= new AudioContext()
    void audio.resume()
  }

  function playTone(frequency: number, duration: number): void {
    if (!soundEnabled || !audio || audio.state !== 'running') return
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.5, audio.currentTime + duration)
    gain.gain.setValueAtTime(0.035, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + duration)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }

  async function toggleRecording(): Promise<void> {
    if (recordingBusy) return
    if (!recorder.isRecording()) {
      try {
        recorder.start(objects.renderer.domElement)
        ui.setRecording(true)
      } catch {
        const status = document.getElementById('status')
        if (status) status.textContent = '当前浏览器不支持录像，请使用桌面 Chrome'
      }
      return
    }
    recordingBusy = true
    ui.setRecording(false)
    try {
      const blob = await recorder.stop()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `badminton-${Date.now()}.webm`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      recordingBusy = false
    }
  }

  function animate(): void {
    animation = requestAnimationFrame(animate)
    const now = performance.now()
    const previous = state
    if (active) {
      state = stepFrame(now, state, view, { away: getAIConfig(options.difficulty, options.style, options.mode === 'training') , home: undefined })
      if (state.rallyHits > previous.rallyHits) playTone(1050, 0.055)
      if (state.lastPoint && state.lastPoint !== previous.lastPoint) playTone(state.lastPoint.winner === 0 ? 660 : 220, 0.23)
    } else {
      view.lastTime = now
      view.accumulator = 0
    }
    syncFrameView(now, state, view, objects, prediction)
    ui.update(state)
    objects.renderer.render(scene, objects.camera)
    if (recorder.isRecording()) {
      const text = (id: string) => document.getElementById(id)?.textContent ?? ''
      recorder.updateHud({ scoreText: text('score-overlay'), setText: text('set-overlay'), rallyText: text('rally-overlay'), statusText: text('status'), controlsText: 'WASD 移动 · J 挥拍 · 1–6 球路' })
      recorder.composite(objects.renderer.domElement)
    }
  }

  function onResize(): void {
    objects.camera.aspect = window.innerWidth / window.innerHeight
    objects.camera.updateProjectionMatrix()
    objects.renderer.setSize(window.innerWidth, window.innerHeight)
  }
  function onHidden(): void {
    if (document.hidden && active && state.phase !== 'paused') dispatch({ type: 'PAUSE', playerIndex: 0 })
    view.lastTime = performance.now()
    view.accumulator = 0
  }
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onHidden)
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__badminton__', { configurable: true, value: { getState: () => structuredClone(state), isRecording: () => recorder.isRecording() } })
  }
  animate()
  return () => {
    cancelAnimationFrame(animation)
    keyboard.disconnect()
    disconnectHotkeys()
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onHidden)
    ui.destroy()
    if (recorder.isRecording()) void recorder.stop()
    if (audio) void audio.close()
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
      }
    })
    objects.renderer.dispose()
    objects.renderer.domElement.remove()
  }
}

function createPlayObjects(scene: THREE.Scene): PlayStartObjects {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.domElement.setAttribute('aria-label', '羽毛球单打球场')
  renderer.domElement.tabIndex = 0
  renderer.domElement.style.outline = 'none'
  document.body.appendChild(renderer.domElement)
  const camera = createGameCamera()
  createCourt(scene)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshStandardMaterial({ color: 0x143332 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.015
  scene.add(floor)
  scene.add(new THREE.HemisphereLight(0xffffed, 0x34554b, 2))
  const light = new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(-5, 12, 5)
  scene.add(light)
  const shuttleGroup = createShuttlecockMesh()
  shuttleGroup.scale.setScalar(1.65)
  const homeMesh = createPlayerMesh({ body: 0xe7eb80, head: 0xf1c8a3, racket: 0xeeeecc, marker: 0xe6ed95 }, '你', { glowScale: 0, labelScale: 0.5 })
  const awayMesh = createPlayerMesh({ body: 0xe48d73, head: 0xd9b08c, racket: 0xeeeecc, marker: 0xf4aa90 }, 'AI', { glowScale: 0, labelScale: 0.45 })
  const homeGroundMarker = createGroundMarker(0xe7eb80)
  const awayGroundMarker = createGroundMarker(0xe48d73)
  const marker = (color: number, inner: number, outer: number, opacity: number) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    scene.add(mesh)
    return mesh
  }
  const shuttleShadow = marker(0x000000, 0, 0.11, 0.75)
  const landingMarker = marker(0xf0eee4, 0.24, 0.3, 0.9)
  const targetMarker = marker(0xe7eb80, 0.3, 0.35, 0.65)
  const serviceMarker = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.5), new THREE.MeshBasicMaterial({ color: 0xe7eb80, transparent: true, opacity: 0.12, depthWrite: false }))
  serviceMarker.rotation.x = -Math.PI / 2
  scene.add(shuttleGroup, homeMesh, awayMesh, homeGroundMarker, awayGroundMarker, serviceMarker)
  return { renderer, camera, scene, shuttleGroup, homeMesh, awayMesh, homeGroundMarker, awayGroundMarker,
    shuttleShadow, landingMarker, targetMarker, serviceMarker, trail: createTrailSystem(scene), predictionAt: 0 }
}
