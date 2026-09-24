/** 触屏输入适配 — Pointer Events → InputEvent（左虚拟摇杆移动 + 右侧固定球路键出拍）。
 *
 * 右手是王者荣耀 / 原神那套「技能键」：右下角固定排着六个球路键（data-touch="shot"，
 * 每键一个 ShotType），位置不随手指变，拇指靠肌肉记忆盲按。每个键两种用法：
 *   - 短按（< TAP_RELEASE_MS）：一键出招，用 TAP_CHARGE 的固定力量直接打这个球路，落点走默认中路
 *   - 按住不放 / 按住拖动：开始蓄力（力量随按住时长涨），拖动改落点——
 *     横向拖动 = 左右落点（连续值，见 aimFromDrag），向上拖 = 落点更深，松手出拍
 * 拖动过程中用 SWING_SELECT 只改落点，不改球路（球路由按下的那个键定死），不重开计时。
 * 舞台上落点圆环（play/frame.ts 的 targetMarker）会跟着拖动连续移动，指哪打哪。
 */

import type { ShotAim } from '../character/types'
import type { ShotType } from '../character/shotSynthesis'
import { isEditableTarget } from './keyboard'
import type { InputAction, InputAdapter, InputListener, MoveDirection } from './types'

/** 摇杆死区（相对半径比例）：小于该幅度视为松手，避免手指微抖触发移动。 */
export const STICK_DEADZONE = 0.2
/** 拖动单位（像素）：落点从中间拖到满格需要的距离；越小越灵敏。 */
export const AIM_DRAG_UNIT = 72
/** 落点死区（相对拖动单位）：横向拖动超过该幅度才开始把落点推离中路。 */
export const AIM_DEADZONE = 0.25
/** 横向落点拖满（±1）所需的拖动距离（相对拖动单位）。 */
export const AIM_LATERAL_SPAN = 1
/** 纵深拖满（+1）所需的拖动距离（相对拖动单位）：向上拖这么远落点就压到最深。 */
export const AIM_DEPTH_SPAN = 1
/** 短按判定（ms）：按住不足这么久算「一键出招」，用 TAP_CHARGE 出拍而不是最软的一拍。
 *  留得比一次点按稍宽（250ms），免得手一抖就掉进蓄力那条路。 */
export const TAP_RELEASE_MS = 250
/** 一键出招的固定力量（0–1）：点一下就是实打实的一拍，不必先蓄力。 */
export const TAP_CHARGE = 0.65
/** 触屏瞄准宽限（秒）：蓄力窗口之外多留这么久让拇指拖完落点再松手（键盘为 0）。 */
export const TOUCH_AIM_HOLD_GRACE = 1.6
/** 起跳键长按判定（ms）：超过即改为蹬转。 */
export const JUMP_LONG_PRESS_MS = 300

/**
 * 球路键拖动 → 落点（纯函数）。屏幕方向即直觉方向：右拖 = 右路，往上拖 = 落点更深。
 * 横向取死区外的线性连续值，纵深只向上累计（向下拖视为标准深度，不主动打得更浅）。
 */
export function aimFromDrag(dx: number, dy: number, unit: number): ShotAim {
  if (!(unit > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { lateral: 0, depth: 0 }
  const nx = dx / unit
  const magnitude = Math.abs(nx)
  const ratio = magnitude <= AIM_DEADZONE ? 0 : Math.min(1, (magnitude - AIM_DEADZONE) / (AIM_LATERAL_SPAN - AIM_DEADZONE))
  // `ratio === 0` 显式短路，避免 -0 让纯函数输出比较失败。
  const lateral = ratio === 0 ? 0 : nx > 0 ? ratio : -ratio
  const depth = Math.min(1, Math.max(0, -dy / unit / AIM_DEPTH_SPAN))
  return { lateral, depth }
}

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

/** 摇杆手柄的视觉偏移，限制在底盘半径内。 */
export function clampStickOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 }
  const length = Math.hypot(dx, dy)
  if (length <= radius) return { x: dx, y: dy }
  const scale = radius / length
  return { x: dx * scale, y: dy * scale }
}

/** 按下球路键即开始蓄力；slice 仅键盘 Shift 提供，触屏不参与。
 *  holdGrace 是自动出拍的额外宽限：拇指要拖完落点再松手，不能被蓄力窗口强制出拍。 */
export function swingStartAction(shot: ShotType, aim: ShotAim, holdGrace = TOUCH_AIM_HOLD_GRACE): InputAction {
  return { type: 'SWING_START', shot, slice: false, aim, holdGrace }
}

/** 蓄力中只改落点（球路由按下的那个键定死，不受拖动影响）。 */
export function swingSelectAction(shot: ShotType, aim: ShotAim): InputAction {
  return { type: 'SWING_SELECT', shot, aim }
}

/** 松开球路键出拍：短按走点按力量，长按走实际蓄力（minimumCharge=0）。 */
export function swingReleaseAction(tapped: boolean): InputAction {
  return { type: 'SWING_RELEASE', minimumCharge: tapped ? TAP_CHARGE : 0 }
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
  /** 承载摇杆 / 球路键 / 起跳键 / 暂停键的容器，按 data-touch 属性查找。 */
  root: HTMLElement
  getSide?: () => 0 | 1
  /** 是否处于等待发球：发球的球路由松手那一刻的键决定，所以按住期间不提交挥拍。 */
  isAwaitingServe?: () => boolean
  stickRadius?: number
  /** 拖动单位（像素）覆盖，默认 AIM_DRAG_UNIT。 */
  aimUnit?: number
}

interface Point { x: number; y: number }

const DEFAULT_STICK_RADIUS = 52

/**
 * 多指并发触屏适配：摇杆、六个球路键、起跳键、暂停键各自绑定 pointer 事件并用
 * setPointerCapture 独占自己的手指，互不干扰。松开 / 失焦 / 页面隐藏时补齐
 * SWING_RELEASE 与 STOP_MOVE，避免挥拍状态卡死。
 */
export function createTouchControlsAdapter(
  playerIndex: 0 | 1 = 0,
  options: TouchControlsOptions,
): InputAdapter {
  const { root } = options
  const getSide = options.getSide ?? (() => playerIndex)
  const isAwaitingServe = options.isAwaitingServe ?? (() => false)
  const stickZone = root.querySelector<HTMLElement>('[data-touch="stick-zone"]')
  const stick = root.querySelector<HTMLElement>('[data-touch="stick"]')
  const knob = root.querySelector<HTMLElement>('[data-touch="stick-knob"]')
  /** 固定球路键：一次只允许一根手指按住其中一个。 */
  const shotButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-touch="shot"]'))
  const jump = root.querySelector<HTMLElement>('[data-touch="jump"]')
  const actionButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-touch="action"]'))

  let listener: InputListener | null = null
  let connected = false
  let stickPointer: number | null = null
  let stickCenter: Point = { x: 0, y: 0 }
  let stickOffset: Point = { x: 0, y: 0 }
  let lastMoveKey: string | null = 'stopped'
  let shotPointer: number | null = null
  /** 被按住的那个球路键与它的球路：拖动只改落点，不改球路。 */
  let shotButton: HTMLElement | null = null
  let shotType: ShotType | null = null
  let shotOrigin: Point = { x: 0, y: 0 }
  let shotAim: ShotAim = { lateral: 0, depth: 0 }
  let shotStartedAt = 0
  /** 等待发球时按住不提交挥拍，等松手一次性发出选中的发球。 */
  let shotDeferred = false
  const aimUnit = options.aimUnit ?? AIM_DRAG_UNIT
  let jumpPointer: number | null = null
  let jumpTimer: ReturnType<typeof setTimeout> | null = null
  const actionPointers = new Set<number>()
  const cleanups: Array<() => void> = []

  function emit(action: InputAction): void {
    listener?.({ action, source: 'touch', timestamp: performance.now(), playerIndex })
  }

  function emitMove(dir: MoveDirection | null): void {
    const key = dir ? `${dir.x.toFixed(3)},${dir.z.toFixed(3)}` : 'stopped'
    if (key === lastMoveKey) return
    lastMoveKey = key
    emit(dir ? { type: 'MOVE', dir } : { type: 'STOP_MOVE' })
  }

  function setKnob(node: HTMLElement | null, x: number, y: number): void {
    if (node) node.style.transform = `translate(${x}px, ${y}px)`
  }

  function resetStickVisual(): void {
    if (!stick) return
    delete stick.dataset.active
    stick.style.removeProperty('left')
    stick.style.removeProperty('top')
    stick.style.removeProperty('right')
    stick.style.removeProperty('bottom')
  }

  function centerOf(element: HTMLElement): Point {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  function capture(element: HTMLElement, pointerId: number): void {
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(pointerId)
  }

  function clearJumpTimer(): void {
    if (jumpTimer !== null) clearTimeout(jumpTimer)
    jumpTimer = null
  }

  function resetShot(): void {
    shotPointer = null
    shotButton = null
    shotType = null
    shotAim = { lateral: 0, depth: 0 }
    shotDeferred = false
    for (const button of shotButtons) {
      delete button.dataset.aiming
      delete button.dataset.lateral
      delete button.dataset.depth
    }
  }

  function releaseAll(): void {
    if (stickPointer !== null) {
      stickPointer = null
      stickOffset = { x: 0, y: 0 }
      setKnob(knob, 0, 0)
      resetStickVisual()
      emitMove(null)
    }
    if (shotPointer !== null) {
      resetShot()
      emit(swingReleaseAction(false))
    }
    clearJumpTimer()
    jumpPointer = null
    if (jump) delete jump.dataset.pressed
    actionPointers.clear()
  }

  function updateStick(clientX: number, clientY: number): void {
    const dx = clientX - stickCenter.x
    const dy = clientY - stickCenter.y
    stickOffset = clampStickOffset(dx, dy, stickRadius())
    setKnob(knob, stickOffset.x, stickOffset.y)
    emitMove(moveVectorFromStick(dx, dy, stickRadius(), getSide()))
  }

  function stickRadius(): number {
    const width = stick?.getBoundingClientRect().width ?? 0
    return options.stickRadius ?? (width > 0 ? width / 2 : DEFAULT_STICK_RADIUS)
  }

  /** 把当前落点写进按住的球路键 dataset（ui.ts 据此显示落点读数与瞄准高亮）。 */
  function reflectShot(button: HTMLElement, aim: ShotAim): void {
    button.dataset.aiming = 'true'
    button.dataset.lateral = aim.lateral.toFixed(3)
    button.dataset.depth = aim.depth.toFixed(3)
  }

  /** 拖动中只改落点：球路已由按下的键定死（等待发球时不提交，松手才发出）。 */
  function updateShot(clientX: number, clientY: number): void {
    if (!shotButton || !shotType) return
    const next = aimFromDrag(clientX - shotOrigin.x, clientY - shotOrigin.y, aimUnit)
    if (next.lateral === shotAim.lateral && next.depth === shotAim.depth) return
    shotAim = next
    reflectShot(shotButton, next)
    if (shotDeferred) return
    emit(swingSelectAction(shotType, next))
  }

  function onShotDown(event: PointerEvent, button: HTMLElement): void {
    if (!listener || shotPointer !== null || isEditableTarget(event.target)) return
    const shot = button.dataset.shot as ShotType | undefined
    if (!shot) return
    event.preventDefault()
    shotPointer = event.pointerId
    shotButton = button
    shotType = shot
    // 参照点是键心而不是按下点：同一个键无论拇指按在哪个像素上，拖动语义都一样。
    shotOrigin = centerOf(button)
    shotAim = { lateral: 0, depth: 0 }
    shotStartedAt = performance.now()
    shotDeferred = isAwaitingServe()
    capture(button, event.pointerId)
    reflectShot(button, shotAim)
    // 蓄力从按下这一刻开始（长按沿用按住时长定力量，短按走点按力量）；发球等待期按住不提交，见 onShotUp。
    if (!shotDeferred) emit(swingStartAction(shot, shotAim))
  }

  function onShotMove(event: PointerEvent): void {
    if (shotPointer !== event.pointerId) return
    event.preventDefault()
    updateShot(event.clientX, event.clientY)
  }

  function onShotUp(event: PointerEvent): void {
    if (shotPointer !== event.pointerId) return
    const deferred = shotDeferred
    const shot = shotType
    const aim = shotAim
    const tapped = performance.now() - shotStartedAt < TAP_RELEASE_MS
    resetShot()
    if (deferred && shot) emit(swingStartAction(shot, aim))
    emit(swingReleaseAction(tapped))
  }

  function onStickDown(event: PointerEvent): void {
    if (!listener || stickPointer !== null || isEditableTarget(event.target)) return
    event.preventDefault()
    stickPointer = event.pointerId
    stickCenter = { x: event.clientX, y: event.clientY }
    if (stick && stickZone) {
      const bounds = stickZone.getBoundingClientRect()
      const radius = stickRadius()
      const x = Math.max(bounds.left + radius, Math.min(bounds.right - radius, event.clientX))
      const y = Math.max(bounds.top + radius, Math.min(bounds.bottom - radius, event.clientY))
      stick.style.left = `${x}px`
      stick.style.top = `${y}px`
      stick.style.right = 'auto'
      stick.style.bottom = 'auto'
      stick.dataset.active = 'true'
      capture(stickZone, event.pointerId)
    }
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
    setKnob(knob, 0, 0)
    resetStickVisual()
    emitMove(null)
  }

  /** 起跳键：轻点 = 起跳 / 发球，按住不放 = 蹬转（触屏不再单开一个蹬转键）。 */
  function onJumpDown(event: PointerEvent): void {
    if (!listener || jumpPointer !== null || !jump || isEditableTarget(event.target)) return
    event.preventDefault()
    jumpPointer = event.pointerId
    capture(jump, event.pointerId)
    jump.dataset.pressed = 'true'
    clearJumpTimer()
    jumpTimer = setTimeout(() => {
      jumpTimer = null
      if (jumpPointer === null) return
      emit({ type: 'SCISSOR_STEP' })
    }, JUMP_LONG_PRESS_MS)
  }

  function onJumpUp(event: PointerEvent): void {
    if (jumpPointer !== event.pointerId) return
    jumpPointer = null
    if (jump) delete jump.dataset.pressed
    if (jumpTimer !== null) {
      clearJumpTimer()
      emit({ type: 'SERVE_OR_JUMP' })
    }
  }

  function onActionDown(event: PointerEvent, action: string): void {
    if (!listener || actionPointers.has(event.pointerId) || isEditableTarget(event.target)) return
    event.preventDefault()
    actionPointers.add(event.pointerId)
    if (action === 'pause') emit({ type: 'PAUSE' })
  }

  function onActionUp(event: PointerEvent): void {
    actionPointers.delete(event.pointerId)
  }

  function listen(element: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', handler: (event: PointerEvent) => void): void {
    element.addEventListener(type, handler as EventListener)
    cleanups.push(() => element.removeEventListener(type, handler as EventListener))
  }

  function bind(): void {
    const stickSurface = stickZone ?? stick
    if (stickSurface) {
      listen(stickSurface, 'pointerdown', onStickDown)
      listen(stickSurface, 'pointermove', onStickMove)
      listen(stickSurface, 'pointerup', onStickUp)
      listen(stickSurface, 'pointercancel', onStickUp)
    }
    for (const button of shotButtons) {
      listen(button, 'pointerdown', event => onShotDown(event, button))
      listen(button, 'pointermove', onShotMove)
      listen(button, 'pointerup', onShotUp)
      listen(button, 'pointercancel', onShotUp)
    }
    if (jump) {
      listen(jump, 'pointerdown', onJumpDown)
      listen(jump, 'pointerup', onJumpUp)
      listen(jump, 'pointercancel', onJumpUp)
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
