/**
 * Badminton Web — 入口文件
 * @entry
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// --- Scene Setup ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a2e)

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(8, 10, 12)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

// --- Court ---
const courtGeo = new THREE.PlaneGeometry(13.4, 6.1)
const courtMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 })
const court = new THREE.Mesh(courtGeo, courtMat)
court.rotation.x = -Math.PI / 2
court.receiveShadow = true
scene.add(court)

// Court lines
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
const lineGeo = new THREE.BoxGeometry(13.4, 0.01, 0.03)
const line = new THREE.Mesh(lineGeo, lineMat)
line.position.set(0, 0.01, 0)
scene.add(line)

const sideLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 6.1), lineMat)
sideLine.position.set(0, 0.01, 0)
scene.add(sideLine)

// Net
const netMat = new THREE.MeshPhysicalMaterial({
  color: 0xcccccc,
  transparent: true,
  opacity: 0.6,
  roughness: 0.8,
})
const netGeo = new THREE.PlaneGeometry(6.1, 1.55)
const net = new THREE.Mesh(netGeo, netMat)
net.position.set(0, 0.775, 0)
scene.add(net)

// Net posts
const postMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.55)
const post1 = new THREE.Mesh(postGeo, postMat)
post1.position.set(-3.05, 0.775, 0)
scene.add(post1)
const post2 = new THREE.Mesh(postGeo, postMat)
post2.position.set(3.05, 0.775, 0)
scene.add(post2)

// --- Lighting ---
const ambient = new THREE.AmbientLight(0x404060, 0.5)
scene.add(ambient)

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
dirLight.position.set(10, 15, 10)
dirLight.castShadow = true
scene.add(dirLight)

const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5)
fillLight.position.set(-5, 5, -5)
scene.add(fillLight)

// --- Shuttlecock ---
const shuttleGroup = new THREE.Group()
const headGeo = new THREE.SphereGeometry(0.03, 8, 6)
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
const head = new THREE.Mesh(headGeo, headMat)
head.position.y = 0.03
shuttleGroup.add(head)

const skirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
const skirtGeo = new THREE.ConeGeometry(0.04, 0.08, 6)
const skirt = new THREE.Mesh(skirtGeo, skirtMat)
skirt.position.y = -0.04
shuttleGroup.add(skirt)

shuttleGroup.position.set(0, 2, 2)
scene.add(shuttleGroup)

// --- Simple floor grid for reference ---
const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355)
gridHelper.position.y = -0.01
scene.add(gridHelper)

// --- Orbit controls for now (will replace with game camera) ---
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1, 0)
controls.update()

// --- Game Loop ---
function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

animate()

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
