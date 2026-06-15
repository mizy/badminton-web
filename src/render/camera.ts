/** 游戏相机 — 俯瞰视角 / 第三人称跟拍，C 键切换 */
import * as THREE from 'three'

type CameraMode = 'overhead' | 'third_person'

const OVERHEAD_POS = new THREE.Vector3(0, 7, 8)
const OVERHEAD_TARGET = new THREE.Vector3(0, 0, 0)
const THIRD_PERSON_OFFSET = new THREE.Vector3(-3, 3, 5)

let currentMode: CameraMode = 'overhead'

let currentPos = new THREE.Vector3(0, 7, 8)
let currentTarget = new THREE.Vector3(0, 0, 0)
const _desiredPos = new THREE.Vector3()
const _desiredTarget = new THREE.Vector3()
const LERP_SPEED = 0.06

export function createGameCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.copy(OVERHEAD_POS)
  camera.lookAt(OVERHEAD_TARGET)
  return camera
}

export function toggleCameraMode(): CameraMode {
  currentMode = currentMode === 'overhead' ? 'third_person' : 'overhead'
  return currentMode
}

export function getCameraMode(): CameraMode {
  return currentMode
}

export function updateCamera(
  camera: THREE.PerspectiveCamera,
  playerPos?: [number, number, number],
): void {
  if (currentMode === 'overhead') {
    _desiredPos.copy(OVERHEAD_POS)
    _desiredTarget.copy(OVERHEAD_TARGET)
  } else if (playerPos) {
    _desiredPos.set(
      playerPos[0] + THIRD_PERSON_OFFSET.x,
      THIRD_PERSON_OFFSET.y,
      playerPos[2] + THIRD_PERSON_OFFSET.z,
    )
    _desiredTarget.set(playerPos[0], 1, playerPos[2])
  } else {
    _desiredPos.copy(OVERHEAD_POS)
    _desiredTarget.copy(OVERHEAD_TARGET)
  }

  currentPos.lerp(_desiredPos, LERP_SPEED)
  currentTarget.lerp(_desiredTarget, LERP_SPEED)

  camera.position.copy(currentPos)
  camera.lookAt(currentTarget)
}
