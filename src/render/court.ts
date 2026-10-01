/** 室内羽毛球馆 — 按 BWF 标准绘制场地、球网及轻量赛事环境 */

import * as THREE from 'three'

const COURT_LENGTH = 13.4
const COURT_WIDTH = 6.1
const SINGLES_WIDTH = 5.18
const LINE_WIDTH = 0.04
const LINE_HEIGHT = 0.012
const HALF_LENGTH = COURT_LENGTH / 2
const HALF_WIDTH = COURT_WIDTH / 2
const SHORT_SERVICE_FROM_NET = 1.98
const DOUBLES_LONG_SERVICE_FROM_BACK = 0.76

const NET_POST_HEIGHT = 1.55
const NET_CENTER_HEIGHT = 1.524
const NET_DEPTH = 0.76
const NET_TAPE_WIDTH = 0.075
const NET_BOTTOM_CORD_WIDTH = 0.025
const NET_MESH_SIZE = 0.02
const NET_SEGMENTS = 48

const APRON_LENGTH = 21.4
const APRON_WIDTH = 11.4
const STAND_FRONT = 6.15
const STAND_DEPTH = 0.72
const STAND_HEIGHT = 0.33
const STAND_ROWS = 4
const CROWD_COLUMNS = 17

const CROWD_COLORS = [0x23485e, 0xa4463f, 0xd19a47, 0x3f6b56, 0x6b527d, 0xd8d2bf]
const SKIN_COLORS = [0xf0c7a4, 0xd8a178, 0xa86f4d, 0x70462f]

/** @entry 创建实际比赛与调试场景共用的完整室内球馆。 */
export function createCourt(scene: THREE.Scene): void {
  addHallFloor(scene)
  addCourtApron(scene)
  addFloor(scene)
  addCourtLines(scene)
  addNet(scene)
  addArenaBackdrop(scene)
  addSpectatorStands(scene)
  addOfficials(scene)
  addCeilingStructure(scene)
}

/**
 * 场地外的一圈馆内地板。没有它，球场远端之外直接露背景色：竖屏时屏幕上会空出
 * 一整条"对着虚空"的死区（实测顶部 1/3 屏是这种黑带，真机上看着像画面被浪费了）。
 * 用比草皮暗得多的绿，配合场景雾在远端淡出成背景，读起来是球馆进深而不是黑洞。
 */
function addHallFloor(scene: THREE.Scene): void {
  // 铺得足够远：远端整片沉进场景雾里淡出成背景色，屏幕上就不会出现一条硬边的空洞。
  const geo = new THREE.PlaneGeometry(COURT_LENGTH + 90, COURT_WIDTH + 44)
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b211f, roughness: 0.94 })
  const floor = new THREE.Mesh(geo, mat)
  floor.rotation.x = -Math.PI / 2
  // 压在草皮下面一点点，避免与球场平面 z-fighting。
  floor.position.y = -0.02
  floor.receiveShadow = true
  scene.add(floor)
}

function addCourtApron(scene: THREE.Scene): void {
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(APRON_LENGTH, APRON_WIDTH),
    new THREE.MeshStandardMaterial({ color: 0x19433f, roughness: 0.86 }),
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.y = -0.012
  apron.receiveShadow = true
  scene.add(apron)

  const border = new THREE.MeshBasicMaterial({ color: 0x75948c })
  addLine(scene, border, APRON_LENGTH, 0.045, 0, APRON_WIDTH / 2)
  addLine(scene, border, APRON_LENGTH, 0.045, 0, -APRON_WIDTH / 2)
  addLine(scene, border, 0.045, APRON_WIDTH, APRON_LENGTH / 2, 0)
  addLine(scene, border, 0.045, APRON_WIDTH, -APRON_LENGTH / 2, 0)
}

function addFloor(scene: THREE.Scene): void {
  const courtGeo = new THREE.PlaneGeometry(COURT_LENGTH, COURT_WIDTH)
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x28644e, roughness: 0.88 })
  const court = new THREE.Mesh(courtGeo, courtMat)
  court.rotation.x = -Math.PI / 2
  court.receiveShadow = true
  scene.add(court)
}

function addCourtLines(scene: THREE.Scene): void {
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

  for (const zSign of [-1, 1]) {
    addLine(scene, lineMat, COURT_LENGTH, LINE_WIDTH, 0, zSign * (HALF_WIDTH - LINE_WIDTH / 2))
    addLine(scene, lineMat, COURT_LENGTH, LINE_WIDTH, 0, zSign * (SINGLES_WIDTH / 2 - LINE_WIDTH / 2))
  }

  for (const xSign of [-1, 1]) {
    addLine(scene, lineMat, LINE_WIDTH, COURT_WIDTH, xSign * (HALF_LENGTH - LINE_WIDTH / 2), 0)
    addLine(scene, lineMat, LINE_WIDTH, COURT_WIDTH, xSign * SHORT_SERVICE_FROM_NET, 0)
    addLine(scene, lineMat, LINE_WIDTH, COURT_WIDTH, xSign * (HALF_LENGTH - DOUBLES_LONG_SERVICE_FROM_BACK), 0)

    const centerLineLength = HALF_LENGTH - SHORT_SERVICE_FROM_NET
    const centerLineX = xSign * (SHORT_SERVICE_FROM_NET + centerLineLength / 2)
    addLine(scene, lineMat, centerLineLength, LINE_WIDTH, centerLineX, 0)
  }
}

function addLine(
  scene: THREE.Scene,
  material: THREE.Material,
  sizeX: number,
  sizeZ: number,
  x: number,
  z: number,
): void {
  const line = new THREE.Mesh(new THREE.BoxGeometry(sizeX, LINE_HEIGHT, sizeZ), material)
  line.position.set(x, LINE_HEIGHT / 2, z)
  scene.add(line)
}

function addNet(scene: THREE.Scene): void {
  const cordTexture = createNetCordTexture()
  cordTexture.repeat.set(COURT_WIDTH / NET_MESH_SIZE, NET_DEPTH / NET_MESH_SIZE)

  const net = new THREE.Mesh(
    createNetPanelGeometry(NET_DEPTH),
    new THREE.MeshBasicMaterial({
      map: cordTexture,
      transparent: true,
      opacity: 0.82,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  scene.add(net)

  const tape = new THREE.Mesh(
    createNetBandGeometry(0, NET_TAPE_WIDTH),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  )
  tape.position.x = -0.006
  scene.add(tape)

  const bottomCord = new THREE.Mesh(
    createNetBandGeometry(NET_DEPTH - NET_BOTTOM_CORD_WIDTH, NET_BOTTOM_CORD_WIDTH),
    new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide }),
  )
  bottomCord.position.x = -0.004
  scene.add(bottomCord)

  const postMat = new THREE.MeshBasicMaterial({ color: 0xdddddd })
  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, NET_POST_HEIGHT, 16)
  for (const zSign of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(0, NET_POST_HEIGHT / 2, zSign * HALF_WIDTH)
    scene.add(post)
  }
}

function addArenaBackdrop(scene: THREE.Scene): void {
  const group = new THREE.Group()
  group.name = 'arena-backdrop'
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x122927, roughness: 0.92 })
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3935, roughness: 0.82 })
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 7.2, 0.24), wallMaterial)
  wall.position.set(0, 3.6, -10.9)
  wall.receiveShadow = true
  group.add(wall)

  const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(30, 1.15, 0.3), panelMaterial)
  lowerWall.position.set(0, 0.58, -10.72)
  group.add(lowerWall)
  const columnGeometry = new THREE.BoxGeometry(0.16, 7.2, 0.32)
  for (let x = -12; x <= 12; x += 4) {
    const column = new THREE.Mesh(columnGeometry, panelMaterial)
    column.position.set(x, 3.6, -10.7)
    group.add(column)
  }

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 1.3),
    new THREE.MeshStandardMaterial({
      map: createArenaBannerTexture(),
      color: 0xffffff,
      emissive: 0x183d37,
      emissiveIntensity: 0.45,
      roughness: 0.62,
    }),
  )
  banner.position.set(0, 5.65, -10.72)
  group.add(banner)
  scene.add(group)
}

function addSpectatorStands(scene: THREE.Scene): void {
  const group = new THREE.Group()
  group.name = 'spectator-stands'
  const standMaterial = new THREE.MeshStandardMaterial({ color: 0x1b292d, roughness: 0.9 })
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x53696b, metalness: 0.35, roughness: 0.48 })
  const stepGeometry = new THREE.BoxGeometry(20.5, 1, STAND_DEPTH)

  for (const side of [-1, 1]) {
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const height = 0.25 + row * STAND_HEIGHT
      const step = new THREE.Mesh(stepGeometry, standMaterial)
      step.scale.y = height
      step.position.set(0, height / 2, side * (STAND_FRONT + row * STAND_DEPTH))
      step.receiveShadow = true
      group.add(step)
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(20.8, 0.06, 0.06), railMaterial)
    rail.position.set(0, 0.72, side * (STAND_FRONT - 0.42))
    group.add(rail)
  }

  addCrowdInstances(group)
  scene.add(group)
}

function addOfficials(scene: THREE.Scene): void {
  const group = new THREE.Group()
  group.name = 'match-officials'
  group.add(createUmpireChair())

  const lineJudge = createLineJudge()
  const leftJudge = lineJudge.clone()
  leftJudge.position.set(-7.65, 0, -4.25)
  leftJudge.rotation.y = -Math.PI / 2
  const rightJudge = lineJudge.clone()
  rightJudge.position.set(7.65, 0, -4.25)
  rightJudge.rotation.y = Math.PI / 2
  group.add(leftJudge, rightJudge)
  scene.add(group)
}

function addCeilingStructure(scene: THREE.Scene): void {
  const group = new THREE.Group()
  group.name = 'arena-roofline'
  const steel = new THREE.MeshStandardMaterial({ color: 0x263c3e, metalness: 0.45, roughness: 0.48 })
  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 4.8),
    new THREE.MeshStandardMaterial({ color: 0x101f22, side: THREE.DoubleSide, roughness: 0.92 }),
  )
  roof.rotation.x = -Math.PI / 2
  roof.position.set(0, 8.15, -8.7)
  group.add(roof)

  const beam = new THREE.Mesh(new THREE.BoxGeometry(29, 0.18, 0.18), steel)
  beam.position.set(0, 7.7, -9.7)
  group.add(beam)
  const braceGeometry = new THREE.BoxGeometry(0.14, 1.1, 2.6)
  for (let x = -12; x <= 12; x += 4) {
    const brace = new THREE.Mesh(braceGeometry, steel)
    brace.position.set(x, 7.62, -9)
    brace.rotation.x = -0.34
    group.add(brace)
  }

  const panelGeometry = new THREE.BoxGeometry(2.15, 0.08, 0.42)
  const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xe9fbff })
  for (const x of [-7.2, -2.4, 2.4, 7.2]) {
    const panel = new THREE.Mesh(panelGeometry, panelMaterial)
    panel.position.set(x, 7.35, -5.35)
    panel.rotation.z = -0.03 * Math.sign(x)
    group.add(panel)
  }
  scene.add(group)
}

function addCrowdInstances(group: THREE.Group): void {
  const count = STAND_ROWS * CROWD_COLUMNS * 2
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.52, 0.24),
    new THREE.MeshStandardMaterial({ roughness: 0.88 }),
    count,
  )
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.92 }),
    count,
  )
  bodies.name = 'crowd-bodies'
  heads.name = 'crowd-heads'
  const dummy = new THREE.Object3D()
  let index = 0

  for (const side of [-1, 1]) {
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const platformHeight = 0.25 + row * STAND_HEIGHT
      for (let column = 0; column < CROWD_COLUMNS; column += 1) {
        const variation = ((column * 7 + row * 3 + index) % 5) * 0.018
        const x = -9 + column * (18 / (CROWD_COLUMNS - 1)) + (row % 2 ? 0.12 : -0.08)
        const z = side * (STAND_FRONT + row * STAND_DEPTH - 0.04)
        dummy.position.set(x, platformHeight + 0.42 + variation, z)
        dummy.rotation.set(0, side === 1 ? Math.PI : 0, 0)
        dummy.scale.set(0.9 + variation, 0.9 + variation, 1)
        dummy.updateMatrix()
        bodies.setMatrixAt(index, dummy.matrix)
        bodies.setColorAt(index, new THREE.Color(CROWD_COLORS[(column + row * 2) % CROWD_COLORS.length]))

        dummy.position.y = platformHeight + 0.82 + variation * 1.5
        dummy.scale.setScalar(0.92 + variation)
        dummy.updateMatrix()
        heads.setMatrixAt(index, dummy.matrix)
        heads.setColorAt(index, new THREE.Color(SKIN_COLORS[(column * 3 + row) % SKIN_COLORS.length]))
        index += 1
      }
    }
  }
  bodies.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  bodies.receiveShadow = true
  heads.receiveShadow = true
  group.add(bodies, heads)
}

function createUmpireChair(): THREE.Group {
  const chair = new THREE.Group()
  chair.name = 'umpire-chair'
  chair.position.set(0, 0, -3.78)
  const frame = new THREE.MeshStandardMaterial({ color: 0xd9dfd8, metalness: 0.55, roughness: 0.36 })
  const seat = new THREE.MeshStandardMaterial({ color: 0x273f43, roughness: 0.75 })
  const uniform = new THREE.MeshStandardMaterial({ color: 0x202d38, roughness: 0.8 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98f68, roughness: 0.9 })

  for (const x of [-0.31, 0.31]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.55, 0.05), frame)
    rail.position.set(x, 0.78, 0.16)
    chair.add(rail)
  }
  for (let step = 0; step < 5; step += 1) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.045, 0.15), frame)
    rung.position.set(0, 0.24 + step * 0.27, 0.16)
    chair.add(rung)
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.72), frame)
  platform.position.set(0, 1.48, 0)
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.08), seat)
  back.position.set(0, 1.8, -0.32)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.25), uniform)
  body.position.set(0, 1.86, -0.02)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin)
  head.position.set(0, 2.25, -0.01)
  chair.add(platform, back, body, head)
  return chair
}

function createLineJudge(): THREE.Group {
  const judge = new THREE.Group()
  const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x405257, metalness: 0.2, roughness: 0.64 })
  const uniform = new THREE.MeshStandardMaterial({ color: 0x283744, roughness: 0.82 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a078, roughness: 0.9 })
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.58), chairMaterial)
  chair.position.y = 0.42
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.07), chairMaterial)
  back.position.set(0, 0.7, -0.27)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.24), uniform)
  body.position.set(0, 0.74, -0.02)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), skin)
  head.position.set(0, 1.1, -0.01)
  judge.add(chair, back, body, head)
  return judge
}

function createArenaBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to create arena banner canvas')
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, '#153d39')
  gradient.addColorStop(0.5, '#245d53')
  gradient.addColorStop(1, '#153d39')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#e8f2df'
  ctx.font = '600 48px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('COURT 01  ·  INDOOR BADMINTON', canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = '#83e6cf'
  ctx.fillRect(40, 16, 180, 5)
  ctx.fillStyle = '#f3ad68'
  ctx.fillRect(canvas.width - 220, canvas.height - 21, 180, 5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function createNetPanelGeometry(depth: number): THREE.BufferGeometry {
  return createNetBandGeometry(0, depth)
}

function createNetBandGeometry(topOffset: number, depth: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= NET_SEGMENTS; i += 1) {
    const t = i / NET_SEGMENTS
    const z = -HALF_WIDTH + COURT_WIDTH * t
    const top = netHeightAtZ(z) - topOffset
    positions.push(0, top - depth, z, 0, top, z)
    uvs.push(t, 0, t, 1)
  }

  for (let i = 0; i < NET_SEGMENTS; i += 1) {
    const a = i * 2
    const b = a + 2
    indices.push(a, a + 1, b, a + 1, b + 1, b)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

function createNetCordTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to create net texture canvas')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(10, 12, 12, 0.2)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(6, 8, 8, 0.95)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(canvas.width, 0)
  ctx.moveTo(0, 0)
  ctx.lineTo(0, canvas.height)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipMapLinearFilter
  texture.needsUpdate = true
  return texture
}

function netHeightAtZ(z: number): number {
  const edgeRatio = Math.abs(z) / HALF_WIDTH
  return NET_CENTER_HEIGHT + (NET_POST_HEIGHT - NET_CENTER_HEIGHT) * edgeRatio * edgeRatio
}
