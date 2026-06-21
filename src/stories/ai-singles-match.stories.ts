import type { Meta, StoryObj } from '@storybook/html'
import GUI from 'lil-gui'
import * as THREE from 'three'
import { getAIConfig } from '../ai/difficulty'
import type { AIDifficulty } from '../ai/types'
import {
  createBasicRallyOptions,
  createBasicRallyState,
  stepBasicRally,
  type BasicRallyOptions,
  type BasicRallyState,
} from '../play/basicRally'
import { updatePlayerRacketPose } from '../render/playerMesh'
import { createRallyView, disposeRallyView, syncRallyView } from '../render/rallyView'
import type { ShuttlecockState } from '../physics/shuttlecock'
import { mountScene } from './threeHelper'

interface AISinglesMatchArgs {
  awayDifficulty: AIDifficulty
  homeDifficulty: AIDifficulty
  showTangentDebug: boolean
  showTrail: boolean
}

interface AISinglesControls extends AISinglesMatchArgs {
  autoServeDelaySeconds: number
  cameraDistance: number
  cameraHeight: number
  paused: boolean
  playSpeed: number
  pointPauseSeconds: number
  reset: () => void
}

const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard']
const SWING_SECONDS = 0.28

const meta: Meta<AISinglesMatchArgs> = {
  title: 'Play/AI vs AI Singles',
  tags: ['autodocs'],
  argTypes: {
    awayDifficulty: { control: 'select', options: DIFFICULTIES },
    homeDifficulty: { control: 'select', options: DIFFICULTIES },
    showTangentDebug: { control: 'boolean' },
    showTrail: { control: 'boolean' },
  },
  render: (args: AISinglesMatchArgs) => {
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '720px'
    container.style.position = 'relative'
    container.style.overflow = 'hidden'
    container.style.background = '#101625'

    const overlay = createMatchOverlay(container)
    const ctx = mountScene(container)
    const view = createRallyView(ctx.scene)
    const tangentArrow = createTangentArrow()
    ctx.scene.add(tangentArrow)

    const controls: AISinglesControls = {
      autoServeDelaySeconds: 0.08,
      awayDifficulty: args.awayDifficulty,
      cameraDistance: 8.8,
      cameraHeight: 10.5,
      homeDifficulty: args.homeDifficulty,
      paused: false,
      playSpeed: 1,
      pointPauseSeconds: 0.25,
      reset: () => resetMatch(),
      showTangentDebug: args.showTangentDebug,
      showTrail: args.showTrail,
    }

    let rally = createBasicRallyState()
    let options = createSinglesOptions(controls)
    let homeSwingSeconds = 0
    let awaySwingSeconds = 0

    const gui = createMatchGui(container, controls, () => {
      options = createSinglesOptions(controls)
      view.trail.setVisible(controls.showTrail)
      syncCamera(ctx.camera, controls)
    })

    view.trail.setVisible(controls.showTrail)
    syncCamera(ctx.camera, controls)
    syncRallyView(view, rally.game)
    updateMatchOverlay(overlay, rally, controls)
    ;(window as any).__badminton_ai_singles_ready__ = false

    function resetMatch() {
      rally = createBasicRallyState()
      options = createSinglesOptions(controls)
      homeSwingSeconds = 0
      awaySwingSeconds = 0
      view.trail.reset()
      ;(window as any).__badminton_ai_singles_ready__ = false
    }

    function step() {
      if (!ctx.animating) return
      requestAnimationFrame(step)

      const dt = Math.min(ctx.clock.getDelta(), 1 / 30)
      if (!controls.paused) {
        const result = stepBasicRally(rally, dt * controls.playSpeed, options)
        rally = result.rally
        if (result.events.served || result.events.restarted) view.trail.reset()
        if (result.events.hit) {
          if ((rally.game.shuttle?.vel[0] ?? 0) >= 0) homeSwingSeconds = SWING_SECONDS
          else awaySwingSeconds = SWING_SECONDS
        }
      }

      homeSwingSeconds = Math.max(0, homeSwingSeconds - dt)
      awaySwingSeconds = Math.max(0, awaySwingSeconds - dt)

      syncRallyView(view, rally.game)
      updatePlayerRacketPose(view.homeMesh, swingProgress(homeSwingSeconds))
      updatePlayerRacketPose(view.awayMesh, swingProgress(awaySwingSeconds))
      syncTangentArrow(tangentArrow, rally.game.shuttle, controls.showTangentDebug)
      syncCamera(ctx.camera, controls)
      updateMatchOverlay(overlay, rally, controls)
      publishDiagnostics(rally)

      if (rally.game.shuttle) {
        ;(window as any).__badminton_ai_singles_ready__ = true
      }
    }
    step()

    const originalDispose = ctx.dispose
    ctx.dispose = () => {
      gui.destroy()
      ctx.scene.remove(tangentArrow)
      disposeTangentArrow(tangentArrow)
      disposeRallyView(view)
      originalDispose()
    }

    return container
  },
}

export default meta

type Story = StoryObj<AISinglesMatchArgs>

export const Match: Story = {
  name: '单打多回合',
  args: {
    awayDifficulty: 'medium',
    homeDifficulty: 'medium',
    showTangentDebug: false,
    showTrail: true,
  },
}

function createSinglesOptions(controls: AISinglesControls): BasicRallyOptions {
  const options = createBasicRallyOptions('medium')
  options.autoServeDelaySeconds = controls.autoServeDelaySeconds
  options.awayAI = getAIConfig(controls.awayDifficulty)
  options.homeAI = getAIConfig(controls.homeDifficulty)
  options.pointPauseSeconds = controls.pointPauseSeconds
  return options
}

function createMatchGui(
  container: HTMLElement,
  controls: AISinglesControls,
  onChange: () => void,
): GUI {
  installGuiStyles()

  const host = document.createElement('div')
  host.className = 'ai-singles-gui-host'
  host.style.position = 'absolute'
  host.style.top = '12px'
  host.style.right = '12px'
  host.style.zIndex = '20'
  container.appendChild(host)

  const gui = new GUI({ container: host, title: 'AI Singles' })
  gui.domElement.classList.add('ai-singles-gui')
  gui.add(controls, 'homeDifficulty', DIFFICULTIES).name('home AI').onChange(onChange)
  gui.add(controls, 'awayDifficulty', DIFFICULTIES).name('away AI').onChange(onChange)
  gui.add(controls, 'playSpeed', 0.35, 2, 0.05).name('speed').onChange(onChange)
  gui.add(controls, 'autoServeDelaySeconds', 0, 1.2, 0.02).name('serve delay').onChange(onChange)
  gui.add(controls, 'pointPauseSeconds', 0, 2, 0.05).name('point pause').onChange(onChange)
  gui.add(controls, 'cameraHeight', 5, 14, 0.1).name('camera y').onChange(onChange)
  gui.add(controls, 'cameraDistance', 5, 14, 0.1).name('camera z').onChange(onChange)
  gui.add(controls, 'showTrail').name('trail').onChange(onChange)
  gui.add(controls, 'showTangentDebug').name('tangent').onChange(onChange)
  gui.add(controls, 'paused').name('paused')
  gui.add(controls, 'reset').name('reset')
  if (window.matchMedia('(max-width: 640px)').matches) gui.close()
  return gui
}

function createMatchOverlay(container: HTMLElement): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:absolute',
    'top:12px',
    'left:12px',
    'z-index:10',
    'color:#f4f7fb',
    'background:rgba(5,10,18,0.72)',
    'border:1px solid rgba(255,255,255,0.14)',
    'border-radius:6px',
    'padding:10px 12px',
    'font:13px/1.45 monospace',
    'white-space:pre',
    'pointer-events:none',
    'user-select:none',
  ].join(';')
  container.appendChild(overlay)
  return overlay
}

function updateMatchOverlay(
  overlay: HTMLDivElement,
  rally: BasicRallyState,
  controls: AISinglesControls,
): void {
  const match = rally.game.match
  const points = match ? `${match.points[0]} : ${match.points[1]}` : '0 : 0'
  const sets = match
    ? match.sets.map((set) => `${set.home}-${set.away}`).join(' / ')
    : '0-0 / 0-0 / 0-0'
  overlay.textContent = [
    `AI Singles  ${controls.homeDifficulty} vs ${controls.awayDifficulty}`,
    `phase ${rally.game.phase}`,
    `score ${points}`,
    `sets ${sets}`,
    `serve ${rally.stats.serveCount}`,
    `rally hits ${rally.stats.hitCount || rally.stats.lastRallyHits}`,
  ].join('\n')
}

function syncCamera(camera: THREE.PerspectiveCamera, controls: AISinglesControls): void {
  const narrowViewport = camera.aspect < 0.75
  const height = controls.cameraHeight + (narrowViewport ? 2.2 : 0)
  const distance = controls.cameraDistance + (narrowViewport ? 4.8 : 0)
  camera.position.set(0, height, distance)
  camera.lookAt(0, 1, 0)
}

function createTangentArrow(): THREE.ArrowHelper {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    0.65,
    0xffdd66,
    0.13,
    0.06,
  )
  arrow.visible = false
  return arrow
}

function syncTangentArrow(
  arrow: THREE.ArrowHelper,
  shuttle: ShuttlecockState | null,
  visible: boolean,
): void {
  arrow.visible = visible && shuttle !== null
  if (!arrow.visible || !shuttle) return

  const direction = new THREE.Vector3(shuttle.vel[0], shuttle.vel[1], shuttle.vel[2])
  if (direction.lengthSq() < 0.000001) return
  direction.normalize()
  arrow.position.set(shuttle.pos[0], shuttle.pos[1], shuttle.pos[2])
  arrow.setDirection(direction)
}

function swingProgress(remainingSeconds: number): number {
  if (remainingSeconds <= 0) return 0
  return 1 - remainingSeconds / SWING_SECONDS
}

function publishDiagnostics(rally: BasicRallyState): void {
  ;(window as any).__badminton_ai_singles_stats__ = {
    phase: rally.game.phase,
    score: rally.game.match?.points ?? [0, 0],
    serves: rally.stats.serveCount,
    shuttle: rally.game.shuttle?.pos ?? null,
  }
}

function disposeTangentArrow(arrow: THREE.ArrowHelper): void {
  arrow.line.geometry.dispose()
  arrow.cone.geometry.dispose()
  ;(arrow.line.material as THREE.Material).dispose()
  ;(arrow.cone.material as THREE.Material).dispose()
}

function installGuiStyles(): void {
  if (document.getElementById('ai-singles-lil-gui-style')) return

  const style = document.createElement('style')
  style.id = 'ai-singles-lil-gui-style'
  style.textContent = `
    .lil-gui {
      --background-color: rgba(10, 14, 22, 0.88);
      --title-background-color: rgba(4, 8, 14, 0.94);
      --text-color: #eef4ff;
      --widget-color: rgba(255,255,255,0.12);
      --hover-color: rgba(255,255,255,0.18);
      --focus-color: rgba(255,255,255,0.24);
      --number-color: #57d4ff;
      --string-color: #b7f36f;
      --font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-size: 12px;
      --widget-height: 22px;
      color: var(--text-color);
      font-family: var(--font-family);
      font-size: var(--font-size);
      user-select: none;
    }
    .lil-gui, .lil-gui * { box-sizing: border-box; }
    .lil-gui.lil-root {
      width: 268px;
      background: var(--background-color);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 6px;
      overflow: hidden;
    }
    .lil-gui .lil-title {
      background: var(--title-background-color);
      padding: 8px 10px;
      font-weight: 700;
    }
    .lil-controller {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
    }
    .lil-controller .lil-name {
      flex: 0 0 88px;
      line-height: var(--widget-height);
      white-space: nowrap;
    }
    .lil-controller .lil-widget {
      flex: 1;
      min-height: var(--widget-height);
      display: flex;
      align-items: center;
    }
    .lil-controller input,
    .lil-controller select,
    .lil-controller button {
      width: 100%;
      min-height: var(--widget-height);
      border: 0;
      border-radius: 3px;
      background: var(--widget-color);
      color: var(--text-color);
      font: inherit;
      padding: 2px 6px;
    }
    .lil-controller input[type="checkbox"] {
      width: 16px;
      min-height: 16px;
    }
    .lil-controller input[type="number"] {
      color: var(--number-color);
      text-align: right;
    }
    .lil-controller button {
      cursor: pointer;
      text-align: left;
    }
    .lil-controller input:hover,
    .lil-controller select:hover,
    .lil-controller button:hover {
      background: var(--hover-color);
    }
    @media (max-width: 640px) {
      .ai-singles-gui-host {
        top: auto !important;
        right: 12px !important;
        bottom: 12px !important;
        left: 12px !important;
      }
      .lil-gui.ai-singles-gui.lil-root {
        width: min(268px, calc(100vw - 24px));
        margin-left: auto;
      }
    }
  `
  document.head.appendChild(style)
}
