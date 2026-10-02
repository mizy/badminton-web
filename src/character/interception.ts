/** A bounded incoming-shot preview shared by human assistance and the court cue. */
import { stepShuttlecock, type ShuttlecockState } from '../physics/shuttlecock'
import type { PlayerState } from './types'
import type { ShotType } from './shotSynthesis'
import { advanceBody } from './body'
import { canPlayShot, SHOT_BUFFER_SECONDS } from './stroke'
import { createReachableRacketPose, distance3, getShuttleCorkCenter, type Vec3 } from './racketKinematics'
import { MAX_PLAYABLE_CONTACT_ERROR } from './contact'

export interface ShotOpportunity {
  position: Vec3
  time: number
  distance: number
}

/** @entry Predicts a legal contact; never moves a player or advances the real shuttle. */
export function predictShotOpportunity(player: PlayerState, shuttle: ShuttlecockState, shot: ShotType): ShotOpportunity | null {
  const forward = player.side === 0 ? 1 : -1
  if (shuttle.vel[0] * forward > 0.1) return null
  let sample = shuttle
  let best: ShotOpportunity | null = null
  let bestScore = Infinity
  for (let t = 0; t <= SHOT_BUFFER_SECONDS; t += 0.03) {
    if (sample.pos[1] < 0.2) break
    const contact = getShuttleCorkCenter(sample.pos, sample.vel)
    const body = advanceBody(player, t)
    if (contact[0] * forward < -0.08 && canPlayShot(shot, contact, body.pos[1])
      && (shot !== 'SMASH' || contact[1] >= 2.05)) {
      const current = createReachableRacketPose({ desiredContact: contact, playerPos: body.pos, playerSide: player.side, racketFaceDeg: 0 })
      const forwardReach = (contact[0] - player.pos[0]) * forward
      const close = distance3(current.stringCenter, contact) < MAX_PLAYABLE_CONTACT_ERROR * 0.5
        && forwardReach > 0.25 && forwardReach < (shot === 'SMASH' ? 0.78 : 0.9)
      const position: Vec3 = close ? [player.pos[0], 0, player.pos[2]] : [
        -forward * Math.max(0.3, Math.min(6.65, -forward * (contact[0] - forward * 0.5))),
        0, Math.max(-2.45, Math.min(2.45, contact[2] - forward * 0.12)),
      ]
      const distance = Math.hypot(position[0] - player.pos[0], position[2] - player.pos[2])
      const height = contact[1] - body.pos[1]
      const preferred = shot === 'SMASH' ? 2.3 : shot === 'CLEAR' || shot === 'DROP' ? 2 : shot === 'DRIVE' ? 1.4 : 1
      const score = Math.abs(height - preferred) + distance * 0.25 + t * 0.08
      if (score < bestScore) {
        bestScore = score
        best = { position, time: t, distance }
      }
    }
    sample = stepShuttlecock(sample, 0.03, undefined, 4)
  }
  return best
}
