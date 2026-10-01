/** 室内羽毛球馆 — 按 BWF 标准绘制场地、球网及轻量赛事环境 */

import * as THREE from 'three'
import { createArenaAnimation, type ArenaAnimation } from './arenaAnimation'

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
/** @entry 创建实际比赛与调试场景共用的完整室内球馆。 */
export function createCourt(scene: THREE.Scene): ArenaAnimation {
  addHallFloor(scene)
  addCourtApron(scene)
  addFloor(scene)
  addCourtLines(scene)
  addNet(scene)
  addArenaBackdrop(scene)
  const arena = createArenaAnimation(scene)
  addCeilingStructure(scene)
  return arena
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
