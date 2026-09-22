import { describe, expect, it, vi } from 'vitest'
import { getAIConfig } from './difficulty'
import { decideTactical, getLegalShots, predictInterception, SMASH_MIN_CONTACT_HEIGHT } from './tactical'
import type { AIConfig, AIStyle } from './types'
import { createPlayer } from '../game/playerFactory'
import type { PlayerState } from '../character/types'
import {
  createReachableRacketPose,
  getShuttleCorkCenter,
  placeShuttleForCorkCenter,
  type Vec3,
} from '../character/racketKinematics'
import * as physics from '../physics/shuttlecock'
import type { ShuttlecockState } from '../physics/shuttlecock'

const STYLES: AIStyle[] = ['attacker', 'rally', 'placement']

function shuttleAt(pos: Vec3, vel: Vec3 = [0, -1, 0]): ShuttlecockState {
  return { pos: placeShuttleForCorkCenter(pos, vel), vel, spin: [0, 0, 0] }
}

function atContact(player: PlayerState, height = 1.95): ShuttlecockState {
  return shuttleAt([player.pos[0] + (player.side === 0 ? 0.65 : -0.65), height, player.pos[2]])
}

describe('AI configuration compatibility', () => {
  it('defaults to placement and supports independent training/style overrides', () => {
    expect(getAIConfig('medium')).toMatchObject({ style: 'placement', cooperative: false })
    expect(getAIConfig('hard', 'attacker', true)).toMatchObject({
      difficulty: 'hard', style: 'attacker', cooperative: true,
    })
    const config = getAIConfig('easy', 'rally', true)
    config.accuracy = 0
    expect(getAIConfig('easy').accuracy).toBe(0.4)
    expect(getAIConfig('easy').cooperative).toBe(false)
  })

  it('accepts old configs without style or cooperative fields', () => {
    const config: AIConfig = {
      difficulty: 'medium', reactionDelay: 0.15, accuracy: 0.65, aggressiveness: 0.5, errorRate: 0.15,
    }
    const player = createPlayer(0)
    expect(decideTactical(player, createPlayer(1), atContact(player), config)).toEqual(
      decideTactical(player, createPlayer(1), atContact(player), getAIConfig('medium')),
    )
  })
})

describe('legal AI shots use shared body constraints', () => {
  it.each([0, 1] as const)('selects shots by height on side %s', (side) => {
    const player = createPlayer(side)
    expect(getLegalShots(player, atContact(player, 2.3))).toEqual(expect.arrayContaining(['SMASH', 'CLEAR', 'DROP']))
    expect(getLegalShots(player, atContact(player, 1.2))).toContain('DRIVE')
    expect(getLegalShots(player, atContact(player, 0.85))).toContain('LIFT')
    expect(getLegalShots(player, atContact(player, 0.85))).not.toContain('SMASH')
    expect(getLegalShots(player, atContact(player, 0.85))).not.toContain('NET_DROP')
    player.pos[0] = side === 0 ? -1.3 : 1.3
    expect(getLegalShots(player, atContact(player, 0.85))).toContain('NET_DROP')
  })

  it('rejects distant, too high, landed, behind-body and across-net contacts', () => {
    const player = createPlayer(0)
    for (const point of [[-6, 1.9, 0], [-2.35, 3.2, 0], [-2.35, 0, 0], [-3.8, 1.9, 0]] as Vec3[]) {
      const shuttle = shuttleAt(point)
      expect(getLegalShots(player, shuttle)).toEqual([])
      for (const style of STYLES) {
        expect(decideTactical(player, createPlayer(1), shuttle, getAIConfig('hard', style, true)).shotType).toBeNull()
      }
    }
    player.pos[0] = -0.4
    expect(getLegalShots(player, shuttleAt([0.25, 1.8, 0]))).toEqual([])
  })

  it('never offers a shot rejected by the shared racket IK', () => {
    const player = createPlayer(0)
    for (const height of [0.2, 0.5, 0.85, 1.2, 1.6, 2, 2.5, 2.8]) {
      for (const z of [-1.4, -0.5, 0, 0.5, 1.4]) {
        const shuttle = shuttleAt([-2.35, height, z])
        const legal = getLegalShots(player, shuttle)
        const pose = createReachableRacketPose({
          desiredContact: getShuttleCorkCenter(shuttle.pos, shuttle.vel),
          playerPos: player.pos, playerSide: player.side, racketFaceDeg: 0,
        })
        if (!pose.reachable) expect(legal).toEqual([])
      }
    }
  })
})

describe('deterministic tactical choices', () => {
  it('distinguishes attacking, rallying and placement from the same high contact', () => {
    const player = createPlayer(0)
    const opponent = createPlayer(1)
    opponent.pos = [5.8, 0, 1.6]
    const shuttle = atContact(player, 2.3)
    const choices = STYLES.map((style) => decideTactical(player, opponent, shuttle, getAIConfig('hard', style)))
    expect(choices.map((choice) => choice.shotType)).toEqual(['SMASH', 'CLEAR', 'DROP'])
    expect(choices[0].power).toBeGreaterThan(choices[2].power)
    expect(choices[1].target[0]).toBeGreaterThan(5)
    expect(choices[2].target[0]).toBeLessThan(2)
    expect(choices[2].target[2]).toBeLessThan(0)
  })

  it('uses opponent depth and motion instead of randomly changing shots', () => {
    const player = createPlayer(0)
    const opponent = createPlayer(1)
    const config = getAIConfig('hard', 'placement')
    opponent.pos = [1.1, 0, 0]
    expect(decideTactical(player, opponent, atContact(player), config).shotType).toBe('CLEAR')
    opponent.pos = [5.6, 0, 0]
    opponent.movement.currentVel.z = 3
    expect(decideTactical(player, opponent, atContact(player), config).target[2]).toBeLessThan(0)
    opponent.movement.currentVel.z = -3
    expect(decideTactical(player, opponent, atContact(player), config).target[2]).toBeGreaterThan(0)
  })

  it('is repeatable without Math.random or input mutation', () => {
    const player = createPlayer(0)
    const opponent = createPlayer(1)
    const shuttle = atContact(player)
    const before = structuredClone({ player, opponent, shuttle })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random decision') })
    try {
      for (const style of STYLES) {
        const config = getAIConfig('medium', style)
        const expected = decideTactical(player, opponent, shuttle, config)
        for (let i = 0; i < 5; i++) expect(decideTactical(player, opponent, shuttle, config)).toEqual(expected)
      }
      expect({ player, opponent, shuttle }).toEqual(before)
    } finally {
      random.mockRestore()
    }
  })

  it.each([0, 1] as const)('keeps every style/difficulty target within opponent singles court from side %s', (side) => {
    const player = createPlayer(side)
    const opponent = createPlayer(side === 0 ? 1 : 0)
    const forward = side === 0 ? 1 : -1
    for (const style of STYLES) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (const cooperative of [false, true]) {
          for (const height of [0.85, 1.2, 1.65, 1.95, 2.35]) {
            opponent.pos = [forward * 6.6, 0, 3.4]
            opponent.movement.currentVel = { x: forward * 8, z: 8 }
            const shuttle = atContact(player, height)
            const decision = decideTactical(player, opponent, shuttle, getAIConfig(difficulty, style, cooperative))
            expect(decision.shotType).not.toBeNull()
            expect(getLegalShots(player, shuttle)).toContain(decision.shotType)
            expect(decision.target[0] * forward).toBeGreaterThanOrEqual(0.1)
            expect(decision.target[0] * forward).toBeLessThanOrEqual(6.7)
            expect(Math.abs(decision.target[2])).toBeLessThanOrEqual(2.59)
            expect(decision.target[1]).toBe(0)
            expect(decision.power).toBeGreaterThan(0)
            expect(decision.power).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it.each([0, 1] as const)('training aims high and near the receiver on side %s', (side) => {
    const player = createPlayer(side)
    const opponent = createPlayer(side === 0 ? 1 : 0)
    opponent.pos = [side === 0 ? 4.8 : -4.8, 0, 1.7]
    for (const style of STYLES) {
      const config = getAIConfig('hard', style, true)
      const high = decideTactical(player, opponent, atContact(player), config)
      const low = decideTactical(player, opponent, atContact(player, 0.85), config)
      expect(high.shotType).toBe('CLEAR')
      expect(low.shotType).toBe('LIFT')
      for (const decision of [high, low]) {
        expect(Math.hypot(decision.target[0] - opponent.pos[0], decision.target[2] - opponent.pos[2])).toBeLessThan(1.4)
        expect(decision.risk).toBeLessThan(0.2)
      }
      opponent.movement.currentVel.z = -2
      expect(decideTactical(player, opponent, atContact(player), config).target[2]).toBeLessThan(opponent.pos[2])
      opponent.movement.currentVel.z = 0
    }
  })
})

describe('trajectory interception and recovery', () => {
  it.each([0, 1] as const)('intercepts at contact height with a 0.65m forward gap on side %s', (side) => {
    const player = createPlayer(side)
    const sign = side === 0 ? -1 : 1
    const shuttle = shuttleAt([sign * 0.4, 4.3, 0.6], [sign * 4, -1, 0])
    const before = structuredClone({ player, shuttle })
    const interception = predictInterception(player, shuttle)
    expect(interception.reachable).toBe(true)
    expect(interception.contactTime).toBeGreaterThan(0)
    expect(interception.contactTime).toBeLessThanOrEqual(3)
    expect(interception.contactHeight).toBeGreaterThanOrEqual(1.6)
    expect(interception.contactHeight).toBeLessThanOrEqual(2.1)
    expect(interception.moveTarget[0] * sign).toBeGreaterThan(0)
    expect(Math.abs(interception.moveTarget[2])).toBeLessThanOrEqual(2.59)
    let sample = shuttle
    for (let step = 0; step < Math.round(interception.contactTime! * 30); step++) {
      sample = physics.stepShuttlecock(sample, 1 / 30, physics.DEFAULT_SHUTTLECOCK, 4)
    }
    const contact = getShuttleCorkCenter(sample.pos, sample.vel)
    expect(interception.contactHeight).toBeCloseTo(contact[1], 8)
    expect((interception.moveTarget[0] - contact[0]) * sign).toBeCloseTo(0.65, 8)
    expect(interception.moveTarget[2]).toBeCloseTo(contact[2], 8)
    expect(getLegalShots({ ...player, pos: interception.moveTarget }, sample).length).toBeGreaterThan(0)
    expect(Math.abs(contact[0] - physics.predictLandingPoint(shuttle)[0])).toBeGreaterThan(0.2)
    const decision = decideTactical(player, createPlayer(side === 0 ? 1 : 0), shuttle, getAIConfig('hard'))
    expect(decision.moveTarget).toEqual(interception.moveTarget)
    expect(decision.shotType).toBeNull()
    expect({ player, shuttle }).toEqual(before)
  })

  it.each([0, 1] as const)('returns to its own midcourt on an outgoing shot, even before crossing the net, side %s', (side) => {
    const player = createPlayer(side)
    player.pos[2] = 1.8
    const forward = side === 0 ? 1 : -1
    const shuttle = atContact(player)
    shuttle.vel = [forward * 12, 4, 0]
    const config = getAIConfig('hard')
    for (const x of [player.pos[0] + forward * 0.65, forward * 2]) {
      shuttle.pos[0] = x
      const prediction = predictInterception(player, shuttle)
      const decision = decideTactical(player, createPlayer(side === 0 ? 1 : 0), shuttle, config)
      expect(decision.moveTarget).toEqual([-forward * 3.35, 0, 0])
      expect(prediction.moveTarget).toEqual(decision.moveTarget)
      expect(prediction.contactTime).toBeNull()
      expect(decision.shotType).toBeNull()
    }
  })

  it('does not claim a late unreachable interception or cross singles boundaries', () => {
    const player = createPlayer(1)
    player.pos = [6.5, 0, -2.4]
    const prediction = predictInterception(player, shuttleAt([0.3, 0.5, 2.8], [0.2, -8, 0]))
    expect(prediction.reachable).toBe(false)
    expect(prediction.contactTime).toBeNull()
    expect(prediction.contactHeight).toBeNull()
    expect(prediction.moveTarget[0]).toBeGreaterThanOrEqual(0.1)
    expect(prediction.moveTarget[0]).toBeLessThanOrEqual(6.7)
    expect(Math.abs(prediction.moveTarget[2])).toBeLessThanOrEqual(2.59)
  })

  it('accounts for travel time instead of treating an ideal future stance as already reached', () => {
    const shuttle = shuttleAt([2, 1.7, 0], [0, -2, 0])
    const near = createPlayer(1)
    near.pos = [2.65, 0, 0]
    const far = createPlayer(1)
    far.pos = [6.6, 0, -2.4]
    expect(predictInterception(near, shuttle).reachable).toBe(true)
    expect(predictInterception(far, shuttle).reachable).toBe(false)
  })

  it('does not predict a contact through the net or beyond three seconds', () => {
    const player = createPlayer(1)
    expect(predictInterception(player, shuttleAt([-0.2, 1, 0], [5, 0, 0])).reachable).toBe(false)
    const step = vi.spyOn(physics, 'stepShuttlecock')
    try {
      predictInterception(player, shuttleAt([2, 30, 0], [0, 0, 0]))
      expect(step.mock.calls.length).toBeLessThanOrEqual(90)
      expect(step.mock.calls.length).toBeGreaterThan(0)
      for (const call of step.mock.calls) expect(call[1]).toBe(1 / 30)
    } finally {
      step.mockRestore()
    }
  })
})

describe('smash feasibility', () => {
  it('refuses smashes that would fly into the net from low contacts', () => {
    const player = createPlayer(1)
    player.pos = [3.6, 0, -0.9]
    const low = atContact(player, SMASH_MIN_CONTACT_HEIGHT - 0.1)
    expect(getLegalShots(player, low)).not.toContain('SMASH')
    const high = createPlayer(1)
    high.pos = [3.3, 0, -0.9]
    expect(getLegalShots(high, atContact(high, 2.32))).toContain('SMASH')
    const lowDecision = decideTactical(player, createPlayer(0), low, getAIConfig('hard', 'attacker'))
    expect(lowDecision.shotType).not.toBe('SMASH')
  })
  it('shortens the smash as contact height drops so the arc still clears the net', () => {
    const jumping = createPlayer(1)
    jumping.pos = [3.6, 0.45, -0.9]
    const grounded = createPlayer(1)
    grounded.pos = [3.6, 0, -0.9]
    const higher = decideTactical(jumping, createPlayer(0), atContact(jumping, 2.6), getAIConfig('hard', 'attacker'))
    const lower = decideTactical(grounded, createPlayer(0), atContact(grounded, 2.3), getAIConfig('hard', 'attacker'))
    expect(higher.shotType).toBe('SMASH')
    expect(lower.shotType).toBe('SMASH')
    expect(Math.abs(lower.target[0])).toBeLessThan(Math.abs(higher.target[0]))
  })
})
