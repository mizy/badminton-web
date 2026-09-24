/** 单打六点步法 — 把移动意图投射到本方半场的前 / 中 / 后 × 左 / 右六个区域。
 *
 * 六点不是六个固定站位，而是比赛中最常被调动到的六个方向：
 *   前左 / 前右（网前两角）· 中左 / 中右（中场两侧）· 后左 / 后右（后场两角）
 * 判定看“按当前移动方向再跑一小段后会到哪”，而不是只看当前位置，
 * 这样球员提前启动时动作层就能预判是跨步上网还是交叉步后退。 */

export type FootworkDepth = 'front' | 'mid' | 'back'
export type FootworkSide = 'left' | 'right'
export type FootworkPoint = `${FootworkDepth}-${FootworkSide}`

export const FOOTWORK_POINTS: readonly FootworkPoint[] = [
  'front-left', 'front-right',
  'mid-left', 'mid-right',
  'back-left', 'back-right',
]

export interface FootworkPointOptions {
  /** 前场分界：距网这么近算前场（米）。 */
  frontDepth?: number
  /** 后场分界：距底线这么近算后场（米）。 */
  backDepth?: number
  /** 按移动方向向前预判的距离（米），让启动瞬间的步型提前切换。 */
  projection?: number
}

const DEFAULTS = { frontDepth: 2.5, backDepth: 2.5, projection: 0.7 }

/** 将世界坐标转换成本方半场坐标：towardNet 从 0（网前）到 7.4（底线），lateral 右为正。 */
function localCourt(pos: { x: number; z: number }, side: 0 | 1) {
  return side === 0
    ? { towardNet: -pos.x, lateral: pos.z }
    : { towardNet: pos.x, lateral: -pos.z }
}

export function classifyFootworkPoint(
  pos: { x: number; z: number },
  direction: { x: number; z: number },
  side: 0 | 1,
  options: FootworkPointOptions = {},
): FootworkPoint | null {
  // 向网方向 = 距网距离减小的方向：side 0 是 +x，side 1 是 -x。
  const towardNetDir = side === 0 ? -direction.x : direction.x
  const lateralDir = side === 0 ? direction.z : -direction.z
  const length = Math.hypot(towardNetDir, lateralDir)
  if (length < 0.01) return null

  const { frontDepth, backDepth, projection } = { ...DEFAULTS, ...options }
  const here = localCourt(pos, side)
  const projectedTowardNet = here.towardNet + towardNetDir / length * projection
  const projectedLateral = here.lateral + lateralDir / length * projection
  const depthOf = (towardNet: number): FootworkDepth => towardNet <= frontDepth ? 'front'
    : towardNet >= 7.4 - backDepth ? 'back' : 'mid'

  // 已在前/后场就以当前站位为准；只有中场启动时，才用投射方向提前读成要去的角。
  const currentDepth = depthOf(here.towardNet)
  const depth = currentDepth === 'mid' ? depthOf(projectedTowardNet) : currentDepth
  // 六点步法没有“中路”这一档：压在中线时按移动方向决定左右，否则按球所在半区。
  const lateral = Math.abs(here.lateral) > 0.35 ? here.lateral : projectedLateral
  const sideName: FootworkSide = Math.abs(lateral) > 0.05 ? (lateral < 0 ? 'left' : 'right') : (lateralDir < 0 ? 'left' : 'right')
  return `${depth}-${sideName}`
}
