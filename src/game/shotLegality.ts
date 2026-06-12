/** 球路合法性检查 — 确保击球结果符合规则 */

import type { ShuttlecockState } from '../physics/shuttlecock'
import type { ShotType, ShotIntent } from '../character/shotSynthesis'
import type { PlayerState } from '../character/types'

export interface ShotLegality {
  valid: boolean
  reason?: string
}

export function validateShot(
  intent: ShotIntent,
  player: PlayerState,
  shuttle: ShuttlecockState,
): ShotLegality {
  const [px, , pz] = player.pos
  const [bx, by, bz] = shuttle.pos

  if (by < 0) return { valid: false, reason: '球已落地' }
  if (by > 4) return { valid: false, reason: '球过高，超出击球范围' }

  const dist = Math.sqrt((bx - px) ** 2 + (bz - pz) ** 2)
  if (dist > 4) return { valid: false, reason: '距离球过远' }

  return validateShotType(intent.type, player, shuttle)
}

function validateShotType(
  type: ShotType,
  _player: PlayerState,
  shuttle: ShuttlecockState,
): ShotLegality {
  const [_, by] = [shuttle.pos[0], shuttle.pos[1]]

  switch (type) {
    case 'SMASH':
      if (by < 1.5) return { valid: false, reason: '扣杀需高点' }
      return { valid: true }
    case 'DROP':
      if (by < 1.0) return { valid: false, reason: '吊球需高点' }
      return { valid: true }
    case 'NET_DROP':
      if (by > 1.2) return { valid: false, reason: '网前小球需低点' }
      return { valid: true }
    case 'CLEAR':
    case 'DRIVE':
    case 'LIFT':
      return { valid: true }
  }
}

export function isBallInCourt(
  pos: [number, number, number],
): boolean {
  const COURT_HALF_X = 6.7
  const COURT_HALF_Z = 3.05
  return Math.abs(pos[0]) <= COURT_HALF_X && Math.abs(pos[2]) <= COURT_HALF_Z
}

export function isBallOverNet(
  pos: [number, number, number],
  prevPos: [number, number, number],
): boolean {
  return !(prevPos[0] < 0 && pos[0] >= 0 && pos[1] < 1.55)
}
