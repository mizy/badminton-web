/** 默认己方底线固定机位；C 切换侧面调试机位，不跟随球员摇晃。
 *
 * 取景稳定性策略：
 * - 基准 distance 仅由固定包围角点决定（不随球拉扯）。
 * - 球对 distance 只有弱影响：先把球坐标 clamp 到场地附近（y 压到 ≤4），
 *   再把超出基准的部分截断在基准的 6% 以内。
 * - 最终 distance 用指数逼近（时间常数 0.5s）+ 每帧最大 2% 的变化率限制平滑，
 *   换边（side 变化）或切换模式时一次性跳到位，不做 lerp 拖影。
 */
import * as THREE from 'three'

// 保留 Storybook 使用的旧模式标识：third_person = baseline，overhead = side。
type CameraMode = 'overhead' | 'third_person'
let currentMode: CameraMode = 'third_person'

const TARGET = new THREE.Vector3(0, -0.3, 0)
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const viewDirection = new THREE.Vector3()
const screenRight = new THREE.Vector3()
const screenUp = new THREE.Vector3()
const offset = new THREE.Vector3()

const BASE_DISTANCE = 19
/** 球对 distance 的最大抬升比例（相对基准 distance）。 */
const SHUTTLE_EXTRA_RATIO = 0.06
/** distance 平滑时间常数（秒）。 */
const SMOOTH_TAU = 0.5
/** distance 每秒最大变化率：2%/帧 @60fps。 */
const MAX_RATE_PER_SECOND = 1.2

/** 基准包围角点：覆盖半场（x 由 side 镜像）、双打边线与 y=6 高点。 */
const FRAME_CORNERS: ReadonlyArray<readonly [number, number, number]> = [
  [-7.5, 0, -3.6], [-7.5, 0, 3.6], [7.5, 0, -3.6], [7.5, 0, 3.6],
  [-6, 2.8, -3.6], [-6, 2.8, 3.6], [6, 2.8, -3.6], [6, 2.8, 3.6],
  [-2, 6, -3.6], [-2, 6, 3.6], [2, 6, -3.6], [2, 6, 3.6],
]

interface CameraSmoothingState {
  distance: number
  side: 0 | 1
  mode: CameraMode
}
const cameraState = new WeakMap<THREE.PerspectiveCamera, CameraSmoothingState>()

export function createGameCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 200)
  updateCamera(camera)
  return camera
}

export function toggleCameraMode(): CameraMode {
  currentMode = currentMode === 'third_person' ? 'overhead' : 'third_person'
  return currentMode
}

export function getCameraMode(): CameraMode {
  return currentMode
}

/** 挥拍方向即瞄准：把 (side, aim) 映射为场地坐标系中的水平方向分量。
 * side0 站 -x 半场、面向对方底线（+x）：depth=1 → x>0，lateral=1 → z>0（屏幕右侧）。
 * side1 完全镜像。与 character/stroke.ts getShotTarget 的朝向约定一致。
 */
export interface AimInput { lateral: number; depth: number }

export function getAimHeading(side: 0 | 1, aim: AimInput): { x: number; z: number } {
  const forward = side === 0 ? 1 : -1
  const lateral = THREE.MathUtils.clamp(aim.lateral, -1, 1)
  const depth = THREE.MathUtils.clamp(aim.depth, -1, 1)
  return { x: forward * depth, z: forward * lateral }
}

/** 球影视图参数：贴地圆盘的位置/不透明度/缩放。
 * 高度越高越淡（衰减到 0.3 保底，保证草地上始终可见），
 * 随高度轻微放大，落地瞬间（y≈0）尺寸贴近 landingMarker，可直接衔接。
 * 基于 ring 几何半径 0.11：scale 2.3 → 半径 ≈0.25m（landingMarker 外径 0.3m）。
 */
export interface ShuttleShadowView {
  position: [number, number, number]
  opacity: number
  scale: number
}

const SHADOW_BASE_SCALE = 2.3
const SHADOW_HEIGHT_SCALE = 0.05
const SHADOW_MAX_OPACITY = 0.8
const SHADOW_OPACITY_DECAY = 0.075
const SHADOW_MIN_OPACITY = 0.3

export function getShuttleShadow(shuttle?: { pos: [number, number, number] } | null): ShuttleShadowView {
  if (!shuttle) return { position: [0, 0.035, 0], opacity: SHADOW_MAX_OPACITY, scale: SHADOW_BASE_SCALE }
  const [x, rawY, z] = shuttle.pos
  const y = Math.max(0, rawY)
  return {
    position: [x, 0.035, z],
    opacity: THREE.MathUtils.clamp(SHADOW_MAX_OPACITY - y * SHADOW_OPACITY_DECAY, SHADOW_MIN_OPACITY, SHADOW_MAX_OPACITY),
    scale: SHADOW_BASE_SCALE + Math.min(y, 8) * SHADOW_HEIGHT_SCALE,
  }
}

function requiredDistance(points: ReadonlyArray<readonly [number, number, number]>, camera: THREE.PerspectiveCamera): number {
  const verticalTan = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV() / 2)) * 0.78
  const horizontalTan = verticalTan * Math.max(0.1, camera.aspect)
  let distance = 0
  for (const [x, y, z] of points) {
    offset.set(x, y, z).sub(TARGET)
    distance = Math.max(distance, offset.dot(viewDirection) + Math.max(
      Math.abs(offset.dot(screenRight)) / horizontalTan,
      Math.abs(offset.dot(screenUp)) / verticalTan,
    ))
  }
  return distance
}

export function updateCamera(
  camera: THREE.PerspectiveCamera,
  _playerPos?: [number, number, number],
  playerSide: 0 | 1 = 0,
  shuttlePos?: [number, number, number],
  dt = 1 / 60,
): void {
  if (currentMode === 'third_person') {
    viewDirection.set(playerSide === 0 ? -1 : 1, 0.75, 0).normalize()
  } else {
    viewDirection.set(0, 0.9, 1).normalize()
  }
  screenRight.crossVectors(WORLD_UP, viewDirection).normalize()
  screenUp.crossVectors(viewDirection, screenRight).normalize()

  const base = Math.max(BASE_DISTANCE, requiredDistance(FRAME_CORNERS, camera))
  let target = base
  if (shuttlePos) {
    // 弱影响：球坐标先压回场地附近，超出基准的部分最多抬 6%。
    const clamped: [number, number, number] = [
      THREE.MathUtils.clamp(shuttlePos[0], -8.5, 8.5),
      THREE.MathUtils.clamp(shuttlePos[1], 0, 4),
      THREE.MathUtils.clamp(shuttlePos[2], -4.4, 4.4),
    ]
    target = base + Math.min(
      Math.max(0, requiredDistance([clamped], camera) - base),
      base * SHUTTLE_EXTRA_RATIO,
    )
  }

  const previous = cameraState.get(camera)
  let distance = target
  if (previous && previous.side === playerSide && previous.mode === currentMode) {
    const alpha = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_TAU)
    const step = (target - previous.distance) * alpha
    const maxStep = previous.distance * MAX_RATE_PER_SECOND * Math.max(0, dt)
    distance = previous.distance + THREE.MathUtils.clamp(step, -maxStep, maxStep)
  }
  cameraState.set(camera, { distance, side: playerSide, mode: currentMode })

  camera.position.copy(TARGET).addScaledVector(viewDirection, distance + 2.5)
  camera.up.copy(WORLD_UP)
  camera.lookAt(TARGET)
  camera.far = Math.max(200, distance + 30)
  camera.updateProjectionMatrix()
}
