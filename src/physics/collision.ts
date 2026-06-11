/** 碰撞检测工具 */

export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

/** 球与 AABB 相交检测 */
export function sphereAABBIntersect(
  spherePos: [number, number, number],
  sphereRadius: number,
  box: AABB,
): boolean {
  const [px, py, pz] = spherePos
  const [minX, minY, minZ] = box.min
  const [maxX, maxY, maxZ] = box.max

  const closestX = Math.max(minX, Math.min(px, maxX))
  const closestY = Math.max(minY, Math.min(py, maxY))
  const closestZ = Math.max(minZ, Math.min(pz, maxZ))

  const dx = px - closestX
  const dy = py - closestY
  const dz = pz - closestZ

  return (dx * dx + dy * dy + dz * dz) <= (sphereRadius * sphereRadius)
}

/** 球与平面的碰撞检测 */
export function spherePlaneIntersect(
  spherePos: [number, number, number],
  sphereRadius: number,
  planePoint: [number, number, number],
  planeNormal: [number, number, number],
): { depth: number; contact: [number, number, number] } | null {
  const dx = spherePos[0] - planePoint[0]
  const dy = spherePos[1] - planePoint[1]
  const dz = spherePos[2] - planePoint[2]

  const dist = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2]

  if (dist > sphereRadius) return null

  const contact: [number, number, number] = [
    spherePos[0] - planeNormal[0] * dist,
    spherePos[1] - planeNormal[1] * dist,
    spherePos[2] - planeNormal[2] * dist,
  ]

  return { depth: sphereRadius - dist, contact }
}
