import type { ShotType } from './shotSynthesis'
import { solveTargetedShot } from './shotTargeting'
import type { Vec3 } from './racketKinematics'

export type ServeType = 'FOREHAND_HIGH' | 'FOREHAND_SHORT' | 'BACKHAND_SHORT' | 'BACKHAND_FLICK'

export const SERVE_NAMES: Record<ServeType, string> = {
  FOREHAND_HIGH: '正手高远', FOREHAND_SHORT: '正手小球', BACKHAND_SHORT: '反手小球', BACKHAND_FLICK: '反手平射',
}
/** 等待发球时的选择键位：与常用击球键共用，Space 执行当前发球。 */
export const SERVE_BY_SHOT: Record<ShotType, ServeType> = {
  CLEAR: 'FOREHAND_HIGH', DROP: 'FOREHAND_SHORT', NET_DROP: 'BACKHAND_SHORT', SMASH: 'BACKHAND_FLICK',
  DRIVE: 'FOREHAND_HIGH', LIFT: 'FOREHAND_SHORT',
}
export const SERVE_ORDER: ServeType[] = ['FOREHAND_HIGH', 'FOREHAND_SHORT', 'BACKHAND_SHORT', 'BACKHAND_FLICK']

interface ServeProfile {
  elevationDeg: number
  maxSpeed: number
  depth: number
  lateral: number
  contactHeight: number
  spin: [number, number, number]
}

const SERVES: Record<ServeType, ServeProfile> = {
  FOREHAND_HIGH: { elevationDeg: 40, maxSpeed: 36, depth: 5.2, lateral: 1.1, contactHeight: 1.15, spin: [0, 8, 0] },
  FOREHAND_SHORT: { elevationDeg: 20, maxSpeed: 11.5, depth: 2.45, lateral: 0.3, contactHeight: 1.05, spin: [0, 6, 0] },
  BACKHAND_SHORT: { elevationDeg: 20, maxSpeed: 11, depth: 2.35, lateral: 0.2, contactHeight: 0.85, spin: [0, 5, 0] },
  BACKHAND_FLICK: { elevationDeg: 22, maxSpeed: 23, depth: 5.6, lateral: 1.3, contactHeight: 0.9, spin: [0, 9, 0] },
}

export function solveServe(serve: ServeType, origin: Vec3, forward: number, courtZ: number) {
  const profile = SERVES[serve]
  const solution = solveTargetedShot({
    corkCenter: origin,
    elevationDeg: profile.elevationDeg,
    maxSpeed: profile.maxSpeed,
    spin: profile.spin,
    target: [forward * profile.depth, 0, -courtZ * profile.lateral],
  })
  return { solution, contactHeight: profile.contactHeight }
}
