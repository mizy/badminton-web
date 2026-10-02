import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createArenaAnimation } from './arenaAnimation'

describe('playable arena animation', () => {
  it('reuses dynamic crowd instances for idle motion and rally anticipation', () => {
    const scene = new THREE.Scene()
    const arena = createArenaAnimation(scene)
    const bodies = scene.getObjectByName('crowd-bodies') as THREE.InstancedMesh
    const before = new THREE.Matrix4()
    const after = new THREE.Matrix4()

    expect(bodies.count).toBe(272)
    expect(bodies.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage)
    arena.update(0, 0)
    bodies.getMatrixAt(0, before)
    arena.update(0.8, 12)
    bodies.getMatrixAt(0, after)

    expect(before.elements.every(Number.isFinite)).toBe(true)
    expect(after.elements.every(Number.isFinite)).toBe(true)
    expect(after.equals(before)).toBe(false)
  })

  it('signals an out call with both line-judge arms and points the umpire to the winner', () => {
    const scene = new THREE.Scene()
    const arena = createArenaAnimation(scene)
    const judgeNegative = scene.getObjectByName('left-judge-negative-arm')!
    const judgePositive = scene.getObjectByName('left-judge-positive-arm')!
    const umpireNegative = scene.getObjectByName('umpire-negative-arm')!

    arena.update(2, 10)
    arena.reactToPoint({ reason: 'out', rallyHits: 10, winnerSide: 0 })
    arena.update(2.3, 0)

    expect(judgeNegative.rotation.z).toBeLessThan(-1.4)
    expect(judgePositive.rotation.z).toBeGreaterThan(1.4)
    expect(umpireNegative.rotation.z).toBeLessThan(-1.2)

    arena.update(3.4, 0)
    expect(judgeNegative.rotation.z).toBe(0)
    expect(judgePositive.rotation.z).toBe(0)
  })
})
