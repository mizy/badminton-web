/** 羽毛球物理 — 气动积分 (RK4)
 * 纯数学，无 Three.js 依赖
 */

export interface ShuttlecockState {
  pos: [number, number, number]    // [x, y, z]
  vel: [number, number, number]
  spin: [number, number, number]   // 角速度
}

export interface ShuttlecockConfig {
  mass: number           // kg
  crossSection: number   // m²
  magnusCoef: number
}

export const DEFAULT_SHUTTLECOCK: ShuttlecockConfig = {
  mass: 0.005,
  crossSection: 0.0020,
  magnusCoef: 0.00025,
}

const AIR_DENSITY = 1.225
const GRAVITY: [number, number, number] = [0, -9.81, 0]

/** 根据速度计算实时阻力系数 Cd
 *  羽毛球气动特性: 高速(>50m/s) Cd~0.035, 中速大幅升高, 低速(~0m/s) Cd~0.70
 *  80→20m/s 约 2.5s; 高远球 28m/s 55° 滞空约 1.5s 左右
 */
function dragCoefficient(speed: number): number {
  if (speed > 50) return 0.035
  if (speed > 10) return 0.035 + 0.365 * ((50 - speed) / 40)
  return 0.40 + 0.30 * ((10 - speed) / 10)
}

function derivative(s: ShuttlecockState, cfg: ShuttlecockConfig): ShuttlecockState {
  const vx = s.vel[0], vy = s.vel[1], vz = s.vel[2]
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
  const cd = dragCoefficient(speed)

  const dragMag = 0.5 * AIR_DENSITY * cd * cfg.crossSection / cfg.mass
  const ax = -dragMag * speed * vx
  const ay = -dragMag * speed * vy + GRAVITY[1]
  const az = -dragMag * speed * vz

  // 马格努斯效应: Cm * (ω × v)
  const mx = cfg.magnusCoef * (s.spin[1] * s.vel[2] - s.spin[2] * s.vel[1])
  const my = cfg.magnusCoef * (s.spin[2] * s.vel[0] - s.spin[0] * s.vel[2])
  const mz = cfg.magnusCoef * (s.spin[0] * s.vel[1] - s.spin[1] * s.vel[0])

  return {
    pos: [s.vel[0], s.vel[1], s.vel[2]],
    vel: [ax + mx, ay + my, az + mz],
    spin: [0, 0, 0],  // 角速度衰减暂忽略
  }
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function mul(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/** RK4 积分一步 */
function rk4Step(s: ShuttlecockState, dt: number, cfg: ShuttlecockConfig): ShuttlecockState {
  const k1 = derivative(s, cfg)
  const s2 = { pos: add(s.pos, mul(k1.pos, dt * 0.5)), vel: add(s.vel, mul(k1.vel, dt * 0.5)), spin: s.spin }
  const k2 = derivative(s2, cfg)
  const s3 = { pos: add(s.pos, mul(k2.pos, dt * 0.5)), vel: add(s.vel, mul(k2.vel, dt * 0.5)), spin: s.spin }
  const k3 = derivative(s3, cfg)
  const s4 = { pos: add(s.pos, mul(k3.pos, dt)), vel: add(s.vel, mul(k3.vel, dt)), spin: s.spin }
  const k4 = derivative(s4, cfg)

  return {
    pos: add(s.pos, mul(add(add(mul(k1.pos, 1), mul(k2.pos, 2)), add(mul(k3.pos, 2), mul(k4.pos, 1))), dt / 6)),
    vel: add(s.vel, mul(add(add(mul(k1.vel, 1), mul(k2.vel, 2)), add(mul(k3.vel, 2), mul(k4.vel, 1))), dt / 6)),
    spin: s.spin,
  }
}

/** 物理步进（自动 sub-step 保证精度） */
export function stepShuttlecock(
  state: ShuttlecockState,
  dt: number,
  cfg: ShuttlecockConfig = DEFAULT_SHUTTLECOCK,
  subSteps: number = 16
): ShuttlecockState {
  const h = dt / subSteps
  let s = state
  for (let i = 0; i < subSteps; i++) {
    s = rk4Step(s, h, cfg)
  }
  return s
}

/** 预测羽毛球落点（模拟步进直到球落地） */
export function predictLandingPoint(
  shuttle: ShuttlecockState,
  cfg: ShuttlecockConfig = DEFAULT_SHUTTLECOCK,
  maxSteps: number = 600,
): [number, number, number] {
  const dt = 1 / 60
  let s = shuttle
  for (let i = 0; i < maxSteps; i++) {
    if (s.pos[1] <= 0) break
    s = stepShuttlecock(s, dt, cfg, 4)
  }
  return [s.pos[0], 0, s.pos[2]]
}

/** 发射羽毛球 */
export function launchShuttlecock(
  origin: [number, number, number],
  speed: number,
  angleDeg: number,       // 仰角（度）
  headingDeg: number,     // 水平方向（度）
  spin?: [number, number, number]
): ShuttlecockState {
  const angleRad = angleDeg * Math.PI / 180
  const headingRad = headingDeg * Math.PI / 180
  return {
    pos: [...origin],
    vel: [
      speed * Math.cos(angleRad) * Math.sin(headingRad),
      speed * Math.sin(angleRad),
      speed * Math.cos(angleRad) * Math.cos(headingRad),
    ],
    spin: spin ?? [0, 50, 0],
  }
}
