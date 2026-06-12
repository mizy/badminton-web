/** 拍面碰撞模型 */

export interface RacketState {
  pos: [number, number, number]
  vel: [number, number, number]        // 拍面线速度
  normal: [number, number, number]     // 拍面法向量
  angularVel: [number, number, number] // 角速度
}

export interface CollisionResult {
  outgoingVel: [number, number, number]
  outgoingSpin: [number, number, number]
  impactSpeed: number
}

const RESTITUTION = 0.75     // 反弹系数
const FRICTION = 0.3         // 切向摩擦

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function scale(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** 
 * 计算球与拍的碰撞响应
 * 
 * 注意：此函数被调用时已由 AABB 碰撞检测确认球在球员可达范围内，
 * 因此始终执行碰撞响应，不再校验相对运动方向。
 * 碰撞结果始终使球沿拍面法向弹出。
 */
export function resolveRacketCollision(
  ballVel: [number, number, number],
  ballSpin: [number, number, number],
  racket: RacketState,
  /** 球的位置（用于计算碰撞深度，可选） */
  _ballPos?: [number, number, number],
): CollisionResult | null {
  const relVel = sub(ballVel, racket.vel)
  // 归一化法向量：确保无论传入的 normal 是否为单位向量，碰撞计算都正确
  const rawN = racket.normal
  const nLen = Math.sqrt(dot(rawN, rawN))
  if (nLen < 1e-8) return null
  const n: [number, number, number] = [rawN[0] / nLen, rawN[1] / nLen, rawN[2] / nLen]
  const vn = dot(relVel, n)

  // 法向：拍线形变反弹（沿法向弹出）
  const approachSpeed = Math.abs(vn)
  const vnOut = RESTITUTION * approachSpeed

  // 切向：摩擦
  const vt = sub(relVel, scale(n, vn))
  const vtLen = Math.sqrt(dot(vt, vt))
  let vtOut: [number, number, number]
  if (vtLen > 0.001) {
    const frictionImpulse = Math.min(FRICTION * Math.abs(vn), vtLen)
    vtOut = scale(vt, (vtLen - frictionImpulse) / vtLen)
  } else {
    vtOut = [0, 0, 0]
  }

  const outgoingVel = add(scale(n, vnOut), vtOut)

  // 旋转传递
  const outgoingSpin: [number, number, number] = [
    ballSpin[0] + 0.1 * (racket.angularVel[0] - ballSpin[0]),
    ballSpin[1] + 0.1 * (racket.angularVel[1] - ballSpin[1]),
    ballSpin[2] + 0.1 * (racket.angularVel[2] - ballSpin[2]),
  ]

  const impactSpeed = Math.abs(vn)

  return { outgoingVel, outgoingSpin, impactSpeed }
}
