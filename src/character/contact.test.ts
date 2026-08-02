import { describe, expect, it } from 'vitest'
import { evaluateContact, idealContactPoint, type ContactInput } from './contact'
import {
  createReachableRacketPose,
  distance3,
  placeShuttleForCorkCenter,
  RACKET_STRING_CENTER_DISTANCE,
  type Vec3,
} from './racketKinematics'

const PLAYER_POS: Vec3 = [-2.65, 0, -0.16]
const INCOMING_VELOCITY: Vec3 = [-17.55, -2.16, -3.24]
const DRIVE_CONTACT = idealContactPoint(PLAYER_POS, 0, 'DRIVE')

const baseInput = createInput(DRIVE_CONTACT, 'DRIVE', 0)

describe('shot contact model', () => {
  it('turns centered timing and actual string contact into an in-court drive', () => {
    const result = evaluateContact(baseInput)

    expect(result.outcome).toBe('hit')
    expect(result.technique).toBe('DRIVE')
    expect(result.timing).toBe('perfect')
    expect(result.contactError).toBeLessThan(0.001)
    expect(result.quality).toBeGreaterThan(0.9)
    expect(result.netClearance).toBeGreaterThan(0.05)
    expect(result.landingPoint[0]).toBeGreaterThan(0)
    expect(result.landingPoint[0]).toBeLessThanOrEqual(6.7)
    expect(Math.abs(result.landingPoint[2])).toBeLessThanOrEqual(3.05)
    expect(result.targetError).toBeLessThan(0.22)
  })

  it('misses when the swing is far outside the timing window', () => {
    const result = evaluateContact({ ...baseInput, swingOffsetMs: 310 })

    expect(result.outcome).toBe('miss')
    expect(result.timing).toBe('miss')
    expect(result.reason).toBe('timing')
    expect(result.outgoingVel).toEqual(baseInput.shuttle.vel)
  })

  it('changes launch attitude when the racket face opens or closes', () => {
    const closed = evaluateContact(createInput(DRIVE_CONTACT, 'DRIVE', -20))
    const open = evaluateContact(createInput(DRIVE_CONTACT, 'DRIVE', 20))

    expect(closed.outcome).toBe('hit')
    expect(open.outcome).toBe('hit')
    expect(open.outgoingVel[1]).toBeGreaterThan(closed.outgoingVel[1] + 2)
    expect(open.netClearance).toBeGreaterThan(closed.netClearance ?? 0)
    expect(closed.reason).toContain('net risk')
  })

  it('maps high descending contact to smash in auto mode', () => {
    const contact = idealContactPoint(PLAYER_POS, 0, 'SMASH')
    const result = evaluateContact(createInput(contact, 'AUTO', -18, [16, -6, 0.2]))

    expect(result.outcome).toBe('hit')
    expect(result.technique).toBe('SMASH')
    expect(result.outgoingVel[1]).toBeLessThan(0)
  })

  it('maps low contact to lift in auto mode', () => {
    const contact = idealContactPoint(PLAYER_POS, 0, 'LIFT')
    const result = evaluateContact(createInput(contact, 'AUTO', 24, [8, -3.5, 0]))

    expect(result.outcome).toBe('hit')
    expect(result.technique).toBe('LIFT')
    expect(result.outgoingVel[1]).toBeGreaterThan(5)
  })

  it('does not report contact for an unreachable shuttle', () => {
    const desired: Vec3 = [-0.8, 3.45, 1.3]
    const input = createInput(desired, 'SMASH', -18)

    expect(input.racket.reachable).toBe(false)
    expect(distance3(input.racket.gripPoint, input.racket.stringCenter))
      .toBeCloseTo(RACKET_STRING_CENTER_DISTANCE, 5)
    const result = evaluateContact(input)
    expect(result.outcome).toBe('miss')
    expect(result.reason).toBe('unreachable')
    expect(result.reachable).toBe(false)
  })

  it('punishes a visible off-center cork even when the technique is valid', () => {
    const input = createInput(DRIVE_CONTACT, 'DRIVE', 0)
    const offCenter: Vec3 = [DRIVE_CONTACT[0], DRIVE_CONTACT[1] + 0.035, DRIVE_CONTACT[2]]
    input.shuttle = {
      ...input.shuttle,
      pos: placeShuttleForCorkCenter(offCenter, INCOMING_VELOCITY),
    }
    const result = evaluateContact(input)

    expect(result.outcome).toBe('hit')
    expect(result.contactError).toBeCloseTo(0.035, 3)
    expect(result.sweetSpot).toBeLessThan(0.35)
    expect(result.quality).toBeLessThan(0.35)
    expect(result.reason).toBe('off center')
  })
})

function createInput(
  desiredContact: Vec3,
  intent: ContactInput['intent'],
  racketFaceDeg: number,
  incomingVelocity: Vec3 = INCOMING_VELOCITY,
): ContactInput {
  const racket = createReachableRacketPose({
    desiredContact,
    playerPos: PLAYER_POS,
    playerSide: 0,
    racketFaceDeg,
  })
  return {
    intent,
    playerPos: PLAYER_POS,
    playerSide: 0,
    power: 0.78,
    racket,
    racketFaceDeg,
    shuttle: {
      pos: placeShuttleForCorkCenter(desiredContact, incomingVelocity),
      spin: [0, 45, 0],
      vel: [...incomingVelocity],
    },
    swingOffsetMs: 0,
    targetZ: -0.35,
  }
}
