import * as THREE from 'three'
import { createPlayer } from '../game/playerFactory'
import { gameReducer, type GameAction } from '../game/reducer'
import { createFullGameState, type GameState } from '../game/types'
import { createKeyboardAdapter, createTouchControlsAdapter, isTouchDevice, type InputAdapter, type InputEvent } from '../input'
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
  scene.background = new THREE.Color(0x061b19)
  // 雾只压很远处的背景（球场全长约 13.4m，相机距近端 ~10m）：远端不至于把对手糊掉。
  scene.fog = new THREE.Fog(0x071d1a, 24, 64)
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
  // 打击感：命中重杀 / 丢分时抖一下画布（transform 只动 canvas，录像取样不受影响）。
  let shakePower = 0
  let shakeUntil = 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // 粗指针 / 有触点 = 触屏设备：只挂触屏层，不注册键盘，避免两套输入打架。
  const touchDevice = isTouchDevice()
  const ui = createPlayUI({
    start: startSession,
    pause: () => dispatch({ type: 'PAUSE', playerIndex: 0 }),
    restart: () => startSession(options),
    nextSet: () => dispatch({ type: 'RESOLVE_SET_END' }),
    menu: () => {
      if (state.phase !== 'paused') dispatch({ type: 'PAUSE', playerIndex: 0 })
      active = false
      input.disconnect()
      ui.showMenu()
    },
    record: () => { void toggleRecording() },
    sound: enabled => { soundEnabled = enabled; if (enabled) unlockAudio() },
    prediction: enabled => { prediction = enabled },
  }, { touch: touchDevice })
  const input: InputAdapter = touchDevice
    // 等待发球时击球盘要按下-拖动选发球种类-松手才发出，所以把当前阶段告诉适配层（见 isAwaitingServe）。
    ? createTouchControlsAdapter(0, {
      root: ui.touchRoot,
      getSide: () => state.players[0]?.side ?? 0,
      isAwaitingServe: () => state.phase === 'idle',
    })
    : createKeyboardAdapter(0, undefined, () => state.players[0]?.side ?? 0)
  const disconnectHotkeys = connectPlayHotkeys(() => { if (active) void toggleRecording() })

  function dispatch(action: GameAction): void {
    const wasPaused = state.phase === 'paused'
    state = gameReducer(state, action)
    if (!wasPaused && state.phase === 'paused') input.disconnect()
    if (wasPaused && state.phase !== 'paused' && active) input.connect(handleInput)
    ui.update(state)
    if (wasPaused && state.phase !== 'paused' && active) objects.renderer.domElement.focus({ preventScroll: true })
  }

  function handleInput(event: InputEvent): void {
    if (!active || state.controls[event.playerIndex] !== 'human') return
    dispatch({ ...event.action, playerIndex: event.playerIndex })
  }

  function startSession(nextOptions: SessionOptions): void {
    options = nextOptions
    input.disconnect()
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
    input.connect(handleInput)
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

  function shake(power: number): void {
    if (reduceMotion) return
    shakePower = Math.max(shakePower, power)
    shakeUntil = performance.now() + 220
  }

  /** 画布抖动：指数衰减 + 双频正弦，scale(1.02) 保证位移时不会露出画布边缘。 */
  function applyShake(now: number): void {
    const element = objects.renderer.domElement
    if (now < shakeUntil) {
      const decay = (shakeUntil - now) / 220
      const x = Math.sin(now * 0.09) * shakePower * 7 * decay
      const y = Math.cos(now * 0.127) * shakePower * 5 * decay
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.02)`
      return
    }
    shakePower = 0
    if (element.style.transform) element.style.transform = ''
  }

  function animate(): void {
    animation = requestAnimationFrame(animate)
    const now = performance.now()
    const previous = state
    if (active) {
      state = stepFrame(now, state, view, { away: getAIConfig(options.difficulty, options.style, options.mode === 'training') , home: undefined })
      if (state.rallyHits > previous.rallyHits) {
        playTone(1050, 0.055)
        // 重杀命中抖得更狠，普通击球也有一点回馈。
        const hitter = state.players[state.lastHitter ?? 0]
        shake(hitter?.swing.shot === 'SMASH' ? 0.85 : 0.28)
      }
      if (state.lastPoint && state.lastPoint !== previous.lastPoint) {
        playTone(state.lastPoint.winner === 0 ? 660 : 220, 0.23)
        shake(state.lastPoint.winner === 0 ? 0.7 : 0.5)
      }
    } else {
      view.lastTime = now
      view.accumulator = 0
    }
    syncFrameView(now, state, view, objects, prediction)
    ui.update(state)
    applyShake(now)
    objects.renderer.render(scene, objects.camera)
    if (recorder.isRecording()) {
      const text = (id: string) => document.getElementById(id)?.textContent ?? ''
      recorder.updateHud({ scoreText: text('score-overlay'), setText: text('set-overlay'), rallyText: text('rally-overlay'), statusText: text('status'), controlsText: touchDevice ? '左摇杆移动 · 按住右半屏瞄准 · 松手出拍' : 'WASD 移动 · J 挥拍 · 1–6 球路' })
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
  // 转屏时部分浏览器先改 innerWidth 再改 innerHeight，延迟再取一次保证 canvas 尺寸正确。
  const onOrientationChange = () => setTimeout(onResize, 300)
  window.addEventListener('orientationchange', onOrientationChange)
  document.addEventListener('visibilitychange', onHidden)
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__badminton__', { configurable: true, value: { getState: () => structuredClone(state), isRecording: () => recorder.isRecording() } })
  }
  animate()
  return () => {
    cancelAnimationFrame(animation)
    input.disconnect()
    disconnectHotkeys()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onOrientationChange)
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
  scene.add(new THREE.HemisphereLight(0xe8fbff, 0x2f5148, 2))
  const light = new THREE.DirectionalLight(0xffffff, 2.1)
  light.position.set(-5, 12, 5)
  // 冷暖双补光：青色的背光把球场边缘压出层次，暖色侧光让球员皮肤不至于发绿。
  const rimLight = new THREE.DirectionalLight(0x6ff0d0, 0.7)
  rimLight.position.set(7, 5, -9)
  const warmFill = new THREE.DirectionalLight(0xffb073, 0.4)
  warmFill.position.set(-8, 3, -4)
  scene.add(light, rimLight, warmFill)
  const shuttleGroup = createShuttlecockMesh()
  shuttleGroup.scale.setScalar(1.65)
  // 队服配色：主场电光蓝+青霓虹、客场猩红+琥珀，和绿色球场拉开对比。
  const homeMesh = createPlayerMesh({ body: 0x2f6fe0, head: 0xf3c9a4, racket: 0xf2f2f2, marker: 0x5ce1ff }, '你', { glowScale: 0, labelScale: 0.5 })
  const awayMesh = createPlayerMesh({ body: 0xe0475f, head: 0xd9a97f, racket: 0xf2f2f2, marker: 0xffa14f }, 'AI', { glowScale: 0, labelScale: 0.45 })
  const homeGroundMarker = createGroundMarker(0x5ce1ff)
  const awayGroundMarker = createGroundMarker(0xffa14f)
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
