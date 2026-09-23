/** 触屏输入适配 — Pointer Events → InputEvent（虚拟摇杆 + 击球按钮 + 拖动瞄准） */

import type { ShotAim } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import { isEditableTarget } from './keyboard'
import type { InputAction, InputAdapter, InputListener, MoveDirection } from './types'

/** 摇杆死区（相对半径比例）：小于该幅度视为松手，避免手指微抖触发移动。 */
export const STICK_DEADZONE = 0.2
/** 瞄准死区（相对半径比例）：超过该幅度才把落点推到该方向。 */
export const AIM_DEADZONE = 0.32

/**
 * 摇杆偏移 → 移动方向。方向语义与 keyboard.ts 一致：
 * 上 = 前场方向、右 = 己方视角右侧，side=1 时整体镜像。
 * 幅度保留模拟量（推到底 = 1），movement.ts 会按幅度缩放速度，实现走/跑区分。
 */
export function moveVectorFromStick(
  dx: number,
  dy: number,
  radius: number,
  side: 0 | 1,
): MoveDirection | null {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const nx = dx / radius
  const ny = dy / radius
  const length = Math.hypot(nx, ny)
  if (!(length > STICK_DEADZONE)) return null
  const magnitude = Math.min(1, length) / length
  const forward = -ny * magnitude
  const right = nx * magnitude
  const sign = side === 0 ? 1 : -1
  // `|| 0` 去掉 -0，保证纯函数输出可比较。
  return { x: forward * sign || 0, z: right * sign || 0 }
}

/** 拖动偏移 → 落点。屏幕方向即直觉方向：右拖 = 右路，上拖 = 更深。 */
export function aimFromDrag(dx: number, dy: number, radius: number): ShotAim {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { lateral: 0, depth: 0 }
  const threshold = radius * AIM_DEADZONE
  return {
    lateral: dx >= threshold ? 1 : dx <= -threshold ? -1 : 0,
    depth: dy <= -threshold ? 1 : dy >= threshold ? -1 : 0,
  }
}

/** 摇杆手柄的视觉偏移，限制在底盘半径内。 */
export function clampStickOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 }
  const length = Math.hypot(dx, dy)
  if (length <= radius) return { x: dx, y: dy }
  const scale = radius / length
  return { x: dx * scale, y: dy * scale }
}

/** 按住球路按钮即开始蓄力；slice 仅键盘 Shift 提供，触屏不参与。 */
export function swingStartAction(shot: ShotType, aim: ShotAim): InputAction {
  return { type: 'SWING_START', shot, slice: false, aim }
}

export interface TouchCapability {
  matchMedia?: (query: string) => { matches: boolean }
  ontouchstart?: unknown
}

/** 粗指针或触屏设备优先用触屏层；桌面（细指针、无触点）保持键盘。 */
export function isTouchDevice(target: TouchCapability | null = typeof window === 'undefined' ? null : window): boolean {
  if (!target) return false
  if (typeof target.matchMedia === 'function' && target.matchMedia('(pointer: coarse)').matches) return true
  return 'ontouchstart' in target
}

export interface TouchControlsOptions {
  /** 承载摇杆 / 击球按钮 / 功能按钮的容器，按 data-touch 属性查找。 */
  root: HTMLElement
  getSide?: () => 0 | 1
  stickRadius?: number
  aimRadius?: number
}

interface HeldShot {
  shot: ShotType
  originX: number
  originY: number
}

const DEFAULT_STICK_RADIUS = 58
const DEFAULT_AIM_RADIUS = 64

/**
 * 多指并发触屏适配：摇杆、击球按钮、功能按钮各自绑定 pointer 事件并用
 * setPointerCapture 独占自己的手指，互不干扰。松开 / 失焦 / 页面隐藏时补齐
 * SWING_RELEASE 与 STOP_MOVE，避免挥拍状态卡死。
 */
export function createTouchControlsAdapter(
  playerIndex: 0 | 1 = 0,
  options: TouchControlsOptions,
): InputAdapter {
  const { root } = options
  const getSide = options.getSide ?? (() => playerIndex)
  const stickRadius = options.stickRadius ?? DEFAULT_STICK_RADIUS
  const aimRadius = options.aimRadius ?? DEFAULT_AIM_RADIUS
  const stick = root.querySelector<HTMLElement>('[data-touch="stick"]')
  const knob = root.querySelector<HTMLElement>('[data-touch="stick-knob"]')
  const shotButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-touch="shot"]'))
  const actionButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-touch="action"]'))

  let listener: InputListener | null = null
  let connected = false
  let stickPointer: number | null = null
  let stickCenter = { x: 0, y: 0 }
  let stickOffset = { x: 0, y: 0 }
  let lastMoveKey: string | null = 'stopped'
  let aim: ShotAim = { lateral: 0, depth: 0 }
  const held = new Map<number, HeldShot>()
  const actionPointers = new Set<number>()
  const cleanups: Array<() => void> = []

  function emit(action: InputAction): void {
    listener?.({ action, source: 'touch', timestamp: performance.now(), playerIndex })
  }

  function emitAim(next: ShotAim): void {
    if (next.lateral === aim.lateral && next.depth === aim.depth) return
    aim = next
    emit({ type: 'AIM', aim: { ...next } })
  }

  function emitMove(dir: MoveDirection | null): void {
    const key = dir ? `${dir.x.toFixed(3)},${dir.z.toFixed(3)}` : 'stopped'
    if (key === lastMoveKey) return
    lastMoveKey = key
    emit(dir ? { type: 'MOVE', dir } : { type: 'STOP_MOVE' })
  }

  function setKnob(x: number, y: number): void {
    if (knob) knob.style.transform = `translate(${x}px, ${y}px)`
  }

  function centerOf(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  function capture(element: HTMLElement, pointerId: number): void {
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(pointerId)
  }

  function releaseAll(): void {
    if (stickPointer !== null) {
      stickPointer = null
      stickOffset = { x: 0, y: 0 }
      setKnob(0, 0)
      emitMove(null)
    }
    for (const [pointerId] of held) {
      held.delete(pointerId)
      emit({ type: 'SWING_RELEASE' })
    }
    actionPointers.clear()
    for (const button of shotButtons) delete button.dataset.pressed
  }

  function sampleStickAim(): ShotAim | null {
    if (stickPointer === null) return null
    const sampled = aimFromDrag(stickOffset.x, stickOffset.y, stickRadius)
    return sampled.lateral || sampled.depth ? sampled : null
  }

  function updateStick(clientX: number, clientY: number): void {
    const dx = clientX - stickCenter.x
    const dy = clientY - stickCenter.y
    stickOffset = clampStickOffset(dx, dy, stickRadius)
    setKnob(stickOffset.x, stickOffset.y)
    emitMove(moveVectorFromStick(dx, dy, stickRadius, getSide()))
    // 按住球路时，摇杆方向同时作为落点（与键盘按住 WASD 定落点一致）。
    if (held.size > 0) emitAim(aimFromDrag(dx, dy, stickRadius))
  }

  function onStickDown(event: PointerEvent): void {
    if (!listener || stickPointer !== null || isEditableTarget(event.target)) return
    event.preventDefault()
    stickPointer = event.pointerId
    stickCenter = stick ? centerOf(stick) : { x: event.clientX, y: event.clientY }
    if (stick) capture(stick, event.pointerId)
    updateStick(event.clientX, event.clientY)
  }

  function onStickMove(event: PointerEvent): void {
    if (stickPointer !== event.pointerId) return
    event.preventDefault()
    updateStick(event.clientX, event.clientY)
  }

  function onStickUp(event: PointerEvent): void {
    if (stickPointer !== event.pointerId) return
    stickPointer = null
    stickOffset = { x: 0, y: 0 }
    setKnob(0, 0)
    emitMove(null)
  }

  function onShotDown(event: PointerEvent, shot: ShotType): void {
    if (!listener || held.has(event.pointerId) || isEditableTarget(event.target)) return
    event.preventDefault()
    const element = event.currentTarget as HTMLElement
    capture(element, event.pointerId)
    held.set(event.pointerId, { shot, originX: event.clientX, originY: event.clientY })
    element.dataset.pressed = 'true'
    emit(swingStartAction(shot, sampleStickAim() ?? aim))
  }

  function onShotMove(event: PointerEvent): void {
    const entry = held.get(event.pointerId)
    if (!entry) return
    event.preventDefault()
    emitAim(aimFromDrag(event.clientX - entry.originX, event.clientY - entry.originY, aimRadius))
  }

  function onShotUp(event: PointerEvent): void {
    const entry = held.get(event.pointerId)
    if (!entry) return
    held.delete(event.pointerId)
    const element = event.currentTarget as HTMLElement
    delete element.dataset.pressed
    emit({ type: 'SWING_RELEASE' })
  }

  function onActionDown(event: PointerEvent, action: string): void {
    if (!listener || actionPointers.has(event.pointerId) || isEditableTarget(event.target)) return
    event.preventDefault()
    actionPointers.add(event.pointerId)
    if (action === 'serve') emit({ type: 'SERVE_OR_JUMP' })
    else if (action === 'scissor') emit({ type: 'SCISSOR_STEP' })
    else if (action === 'pause') emit({ type: 'PAUSE' })
  }

  function onActionUp(event: PointerEvent): void {
    actionPointers.delete(event.pointerId)
  }

  function listen(element: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', handler: (event: PointerEvent) => void): void {
    element.addEventListener(type, handler as EventListener)
    cleanups.push(() => element.removeEventListener(type, handler as EventListener))
  }

  function bind(): void {
    if (stick) {
      listen(stick, 'pointerdown', onStickDown)
      listen(stick, 'pointermove', onStickMove)
      listen(stick, 'pointerup', onStickUp)
      listen(stick, 'pointercancel', onStickUp)
    }
    for (const button of shotButtons) {
      const shot = button.dataset.shot as ShotType | undefined
      if (!shot) continue
      listen(button, 'pointerdown', event => onShotDown(event, shot))
      listen(button, 'pointermove', onShotMove)
      listen(button, 'pointerup', onShotUp)
      listen(button, 'pointercancel', onShotUp)
    }
    for (const button of actionButtons) {
      const action = button.dataset.action
      if (!action) continue
      listen(button, 'pointerdown', event => onActionDown(event, action))
      listen(button, 'pointerup', onActionUp)
      listen(button, 'pointercancel', onActionUp)
    }
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibilityChange)
    cleanups.push(() => window.removeEventListener('blur', releaseAll))
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange))
  }

  function onVisibilityChange(): void {
    if (document.hidden || document.visibilityState === 'hidden') releaseAll()
  }

  return {
    connect(nextListener: InputListener): void {
      if (connected) return
      connected = true
      listener = nextListener
      bind()
    },
    disconnect(): void {
      if (!connected) return
      connected = false
      releaseAll()
      while (cleanups.length > 0) cleanups.pop()?.()
      listener = null
    },
  }
}
