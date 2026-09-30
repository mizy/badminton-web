/** Joint and foot-trail presentation reused by animation inspection pages. */
import * as THREE from 'three'
import type { PlayerSkeleton } from '../render/playerSkeleton'

export function createSkeletonDiagram(parent: THREE.Object3D) {
  const group = new THREE.Group()
  parent.add(group)
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(17 * 6)
  const colors = new Float32Array(17 * 6)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })
  const lines = new THREE.LineSegments(geometry, material)
  lines.frustumCulled = false
  group.add(lines)
  const jointGeometry = new THREE.SphereGeometry(0.025, 8, 6)
  const jointMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const joints = Array.from({ length: 15 }, () => { const node = new THREE.Mesh(jointGeometry, jointMaterial); group.add(node); return node })
  const trails: THREE.Vector3[][] = [[], []]
  const paths = trails.map(() => {
    const pathGeometry = new THREE.BufferGeometry()
    pathGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3))
    pathGeometry.setDrawRange(0, 0)
    const path = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: 0x677c86 }))
    path.frustumCulled = false
    group.add(path)
    return path
  })
  return {
    group,
    trails,
    update(rig: PlayerSkeleton, showRacket = true) {
      rig.group.updateWorldMatrix(true, true)
      joints.forEach(node => { node.visible = true })
      let segment = 0
      let joint = 0
      const line = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
        positions.set([...from.toArray(), ...to.toArray()], segment * 6)
        const rgb = new THREE.Color(color).toArray()
        colors.set([...rgb, ...rgb], segment++ * 6)
      }
      const hips = rig.hips.getWorldPosition(new THREE.Vector3())
      const chest = rig.chest.localToWorld(new THREE.Vector3(0, 1.42, 0))
      const head = rig.head.getWorldPosition(new THREE.Vector3())
      line(hips, chest, 0xd9e6eb); line(chest, head, 0xd9e6eb)
      joints[joint++].position.copy(head)
      for (const [i, limb] of [rig.rightArm, rig.leftArm, rig.rightLeg, rig.leftLeg].entries()) {
        const root = limb.root.getWorldPosition(new THREE.Vector3())
        const middle = limb.joint.getWorldPosition(new THREE.Vector3())
        const end = limb.end.getWorldPosition(new THREE.Vector3())
        const color = i % 2 === 0 ? 0x58ddff : 0xd7a6ff
        line(i < 2 ? chest : hips, root, color); line(root, middle, color); line(middle, end, color)
        for (const point of [root, middle, end]) joints[joint++].position.copy(point)
        if (i >= 2) {
          const trail = trails[i - 2]
          if (!trail.length || trail[trail.length - 1].distanceTo(end) > 0.005) trail.push(end.clone())
          if (trail.length > 240) trail.shift()
          const attribute = paths[i - 2].geometry.attributes.position
          trail.forEach((point, index) => { attribute.setXYZ(index, point.x, point.y, point.z) })
          attribute.needsUpdate = true
          paths[i - 2].geometry.setDrawRange(0, trail.length)
        }
      }
      if (showRacket) {
        const grip = rig.racket.getWorldPosition(new THREE.Vector3())
        const strings = rig.racket.localToWorld(new THREE.Vector3(0, 0.46, 0))
        line(grip, strings, 0xffdf72)
        const face = rig.racket.localToWorld(new THREE.Vector3(0, 0.46, 0.16))
        line(strings, face, 0xff9858)
        line(rig.racket.localToWorld(new THREE.Vector3(-0.10, 0.46, 0)), rig.racket.localToWorld(new THREE.Vector3(0.10, 0.46, 0)), 0xffdf72)
        joints[joint++].position.copy(strings)
      }
      while (joint < joints.length) joints[joint++].visible = false
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true
      geometry.setDrawRange(0, segment * 2)
    },
    dispose() {
      geometry.dispose(); material.dispose(); jointGeometry.dispose(); jointMaterial.dispose()
      paths.forEach(path => { path.geometry.dispose(); (path.material as THREE.Material).dispose() })
    },
  }
}
