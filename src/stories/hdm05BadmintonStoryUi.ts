import GUI from 'lil-gui'
import type {
  Hdm05Manifest,
  Hdm05Motion,
  Hdm05MotionSummary,
  Hdm05PlaybackSample,
} from '../render/hdm05BadmintonMocap'

export type Hdm05ViewMode = 'orbit' | 'front' | 'side' | 'back' | 'top'
export type Hdm05ShuttlePhase = 'waiting' | 'incoming' | 'outgoing' | 'landed'

export interface Hdm05StoryControls {
  autoCycle: boolean
  clipSeconds: number
  motionId: string
  paused: boolean
  playbackSpeed: number
  poseScale: number
  rootMotionScale: number
  rootRotationScale: number
  showTrail: boolean
  view: Hdm05ViewMode
}

export interface Hdm05OverlayState {
  autoCycle: boolean
  clipSeconds: number
  contactCount: number
  contactError: number
  error: string
  frame: number
  loaded: boolean
  loopBlend: boolean
  manifest: Hdm05Manifest | null
  motion: Hdm05Motion | null
  racketSpeed: number
  selectedSummary: Hdm05MotionSummary | null
  shuttlePhase: Hdm05ShuttlePhase
  strikeFrame: number
  view: Hdm05ViewMode
}

interface OverlayElement extends HTMLDivElement {
  disposeLayout: () => void
}

const VIEW_MODES: Hdm05ViewMode[] = ['orbit', 'front', 'side', 'back', 'top']

export function createHdm05StoryGui(container: HTMLElement, controls: Hdm05StoryControls): GUI {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;top:12px;right:12px;z-index:20'
  container.appendChild(host)
  const gui = new GUI({ container: host, title: 'HDM05 Badminton Source' })
  gui.add(controls, 'autoCycle').name('auto cycle')
  gui.add(controls, 'clipSeconds', 2, 12, 0.5).name('clip seconds')
  gui.add(controls, 'view', VIEW_MODES).name('view')
  gui.add(controls, 'playbackSpeed', 0.15, 1.8, 0.05).name('speed')
  gui.add(controls, 'poseScale', 0.45, 1.25, 0.01).name('pose scale')
  gui.add(controls, 'rootMotionScale', 0, 1.2, 0.02).name('root motion')
  gui.add(controls, 'rootRotationScale', 0, 1, 0.02).name('root turn')
  gui.add(controls, 'showTrail').name('shuttle trail')
  gui.add(controls, 'paused').name('paused')
  requestAnimationFrame(() => {
    if (container.clientWidth < 640) gui.close()
  })
  return gui
}

export function createHdm05Overlay(container: HTMLElement): OverlayElement {
  const overlay = document.createElement('div') as OverlayElement
  overlay.style.cssText = [
    'position:absolute', 'left:12px', 'top:12px', 'z-index:12',
    'background:rgba(5,9,16,0.78)', 'border:1px solid rgba(255,255,255,0.16)',
    'border-radius:6px', 'padding:10px 12px', 'color:#eff6ff',
    'font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre', 'pointer-events:none', 'user-select:none',
  ].join(';')
  container.appendChild(overlay)
  const syncLayout = () => {
    const compact = container.clientWidth < 640
    overlay.style.top = compact ? 'auto' : '12px'
    overlay.style.bottom = compact ? '12px' : 'auto'
    overlay.style.maxWidth = compact ? '210px' : '330px'
    overlay.style.font = compact
      ? '11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace'
      : '13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace'
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncLayout)
  observer?.observe(container)
  syncLayout()
  overlay.disposeLayout = () => observer?.disconnect()
  return overlay
}

export function updateHdm05Overlay(overlay: HTMLDivElement, state: Hdm05OverlayState): void {
  const index = state.manifest && state.selectedSummary
    ? state.manifest.motions.findIndex((item) => item.id === state.selectedSummary?.id)
    : -1
  const clipProgress = index >= 0 && state.manifest
    ? `${index + 1}/${state.manifest.motions.length}`
    : `${state.manifest?.motions.length ?? 0} clips`
  overlay.textContent = [
    'source   HDM05 3-11 Badminton',
    `rig      ${state.loaded ? 'source skeleton (22 joints)' : state.error || 'loading...'}`,
    `motion   ${state.selectedSummary ? `${state.selectedSummary.label} ${state.selectedSummary.actor}` : 'loading manifest...'}`,
    `clip     ${clipProgress}${state.autoCycle ? ` / ${state.clipSeconds.toFixed(1)}s` : ' / manual'}`,
    `frames   ${state.motion ? `${state.motion.poseBody.length} @ ${state.motion.fps}fps` : '-'}`,
    `frame    ${state.frame}${state.loopBlend ? ' / loop blend' : ''}`,
    `strike   f${state.strikeFrame} / ${state.contactCount} event${state.contactCount === 1 ? '' : 's'}`,
    `shuttle  ${state.shuttlePhase}`,
    `contact  ${Number.isFinite(state.contactError) ? `${(state.contactError * 100).toFixed(1)}cm` : '-'}`,
    `racket   ${state.racketSpeed.toFixed(2)} m/s`,
    `view     ${state.view}`,
  ].join('\n')
}

export function publishHdm05StoryState(
  controls: Hdm05StoryControls,
  motion: Hdm05Motion | null,
  selectedSummary: Hdm05MotionSummary | null,
  sample: Hdm05PlaybackSample | null,
  state: Pick<Hdm05OverlayState, 'contactCount' | 'contactError' | 'racketSpeed' | 'shuttlePhase' | 'strikeFrame'>,
  shuttlePosition: [number, number, number] | null,
): void {
  ;(window as any).__hdm05_badminton_state__ = {
    autoCycle: controls.autoCycle,
    contactCount: state.contactCount,
    contactError: state.contactError,
    frame: sample?.frame ?? 0,
    loaded: motion !== null,
    loopBlend: sample?.loopBlend ?? false,
    motion: selectedSummary?.id ?? null,
    poseScale: controls.poseScale,
    racketSpeed: state.racketSpeed,
    ready: motion !== null,
    rig: 'source-skeleton',
    shuttlePhase: state.shuttlePhase,
    shuttlePosition,
    strikeFrame: state.strikeFrame,
    view: controls.view,
  }
}
