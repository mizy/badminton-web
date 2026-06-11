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

/** 计算球与拍的碰撞响应 */
export function resolveRacketCollision(
  ballVel: [number, number, number],
  ballSpin: [number, number, number],
  racket: RacketState,
): CollisionResult | null {
  // 相对速度
  const relVel = sub(ballVel, racket.vel)
  const n = racket.normal

  const vn = dot(relVel, n)

  // 球正在远离拍面，不处理
  if (vn > 0) return null

  // 法向：拍线形变反弹
  const vnOut = -RESTITUTION * vn

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
