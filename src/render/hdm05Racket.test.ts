import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { syncHdm05Racket } from './hdm05BadmintonContact'
import { createSkeletalRacket, RACKET_IN_RIGHT_HAND } from './skeletalRacket'

describe('captured racket orientation', () => {
  it('uses calibrated hand axes after world rotation, without a fixed world-facing racket', () => {
    const parent = new THREE.Group()
    parent.rotation.y = 0.7
    const hand = new THREE.Bone()
    hand.position.set(0.3, 1.4, 0.2)
    hand.rotation.set(-0.6, 0.2, 1.1)
    parent.add(hand)
    const racket = createSkeletalRacket()
    syncHdm05Racket({ rightHand: hand }, racket)
    const expected = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(RACKET_IN_RIGHT_HAND)
    expect(racket.quaternion.angleTo(expected)).toBeLessThan(1e-7)
    expect(racket.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-8)
  })
})
