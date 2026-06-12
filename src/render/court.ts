/** 球场3D场景 — 场地、网、边界线、球员位置标记 */

import * as THREE from 'three'

const COURT_WIDTH = 6.1   // 双打宽度 (z)
const COURT_LENGTH = 13.4 // 双打长度 (x)
const NET_HEIGHT = 1.55
const LINE_WIDTH = 0.03

/** 创建球场并添加到场景 */
export function createCourt(scene: THREE.Scene): void {
  // --- Court floor ---
  const courtGeo = new THREE.PlaneGeometry(COURT_LENGTH, COURT_WIDTH)
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 })
  const court = new THREE.Mesh(courtGeo, courtMat)
  court.rotation.x = -Math.PI / 2
  court.receiveShadow = true
  scene.add(court)

  // --- Boundary lines (white) — use opaque material for clear video visibility ---
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

  // Two long side lines (along x)
  const longGeo = new THREE.BoxGeometry(COURT_LENGTH, 0.01, LINE_WIDTH)
  const sideLine1 = new THREE.Mesh(longGeo, lineMat)
  sideLine1.position.set(0, 0.01, -COURT_WIDTH / 2)
  scene.add(sideLine1)

  const sideLine2 = new THREE.Mesh(longGeo, lineMat)
  sideLine2.position.set(0, 0.01, COURT_WIDTH / 2)
  scene.add(sideLine2)

  // Two short base lines (along z)
  const shortGeo = new THREE.BoxGeometry(LINE_WIDTH, 0.01, COURT_WIDTH)
  const baseLine1 = new THREE.Mesh(shortGeo, lineMat)
  baseLine1.position.set(-COURT_LENGTH / 2, 0.01, 0)
  scene.add(baseLine1)

  const baseLine2 = new THREE.Mesh(shortGeo, lineMat)
  baseLine2.position.set(COURT_LENGTH / 2, 0.01, 0)
  scene.add(baseLine2)

  // --- Net (thick panel + grid lines, SwiftShader-compatible) ---
  // Use a solid BoxGeometry (non-zero thickness) instead of PlaneGeometry
  // to guarantee visibility in headless SwiftShader rendering
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: false,
    side: THREE.DoubleSide,
  })
  const NET_THICKNESS = 0.12
  const netGeo = new THREE.BoxGeometry(NET_THICKNESS, NET_HEIGHT, COURT_WIDTH)
  const net = new THREE.Mesh(netGeo, netMat)
  net.position.set(0, NET_HEIGHT / 2, 0)
  scene.add(net)

  // --- Net grid lines (thick red lines, highly visible against white net) ---
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xff4444 })
  // Vertical net lines (along Y axis) — evenly spaced across net width (Z)
  const NUM_VERT_LINES = 9
  for (let i = 0; i < NUM_VERT_LINES; i++) {
    const zPos = -COURT_WIDTH / 2 + (COURT_WIDTH / (NUM_VERT_LINES - 1)) * i
    const vl = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, NET_HEIGHT, 0.06),
      gridMat,
    )
    vl.position.set(0, NET_HEIGHT / 2, zPos)
    scene.add(vl)
  }
  // Horizontal net lines (along Z axis) — 5 rows, red for visibility
  for (const yFrac of [0.15, 0.35, 0.55, 0.75, 0.92]) {
    const hl = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.06, COURT_WIDTH),
      gridMat,
    )
    hl.position.set(0, NET_HEIGHT * yFrac, 0)
    scene.add(hl)
  }

  // --- Net top tape (thick white bar across top, clearly visible) ---
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const topTape = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.10, COURT_WIDTH + 0.2),
    tapeMat,
  )
  topTape.position.set(0, NET_HEIGHT + 0.05, 0)
  scene.add(topTape)

  // --- Net bottom tape ---
  const bottomTape = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.08, COURT_WIDTH + 0.1),
    tapeMat,
  )
  bottomTape.position.set(0, 0.04, 0)
  scene.add(bottomTape)

  // --- Net center stripe (red) ---
  const centerStripeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 })
  const centerStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, NET_HEIGHT, 0.06),
    centerStripeMat,
  )
  centerStripe.position.set(0, NET_HEIGHT / 2, 0)
  scene.add(centerStripe)

  // --- Net posts (thicker, taller with cap) ---
  const postMat = new THREE.MeshBasicMaterial({ color: 0xdddddd })
  const postGeo = new THREE.CylinderGeometry(0.12, 0.15, NET_HEIGHT + 0.4, 8)
  const postCapGeo = new THREE.SphereGeometry(0.15, 6, 6)

  for (const zSide of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(0, (NET_HEIGHT + 0.4) / 2, zSide * COURT_WIDTH / 2)
    scene.add(post)

    const cap = new THREE.Mesh(postCapGeo, postMat)
    cap.position.set(0, NET_HEIGHT + 0.4, zSide * COURT_WIDTH / 2)
    scene.add(cap)
  }

  // --- Court center line (runs along X from net to baseline on each side, at Z=0) ---
  const clMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const CENTER_LINE_LEN = COURT_LENGTH / 2  // from net to baseline
  for (const xSign of [-1, 1]) {
    const cl = new THREE.Mesh(
      new THREE.BoxGeometry(CENTER_LINE_LEN, 0.01, 0.12),
      clMat,
    )
    cl.position.set(xSign * CENTER_LINE_LEN / 2, 0.01, 0)
    scene.add(cl)
  }

  // --- Service lines (full-width white lines perpendicular to net at 1.98m) ---
  const slMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  for (const xSign of [-1, 1]) {
    const sl = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.01, COURT_WIDTH),
      slMat,
    )
    sl.position.set(xSign * 1.98, 0.01, 0)
    scene.add(sl)
  }

}
