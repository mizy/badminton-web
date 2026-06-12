/** 游戏相机 — 广播视角，从底线后俯视全场 */
/** 球网在画面中央清晰可见，两侧球员分明 */

import * as THREE from 'three'

/**
 * 相机位置：在家底线后上方，稍偏一侧
 * 相比之前版本更近更低，让球员和球网在画面中占比更大
 * 确保在 1280x720 分辨率下也能清晰分辨细节
 */
const CAMERA_POS = new THREE.Vector3(-6, 3.5, 2.0)
/** 相机注视点（球场中心略高，让球网在画面中部） */
const CAMERA_TARGET = new THREE.Vector3(0, 0.8, 0)

export function createGameCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.copy(CAMERA_POS)
  camera.lookAt(CAMERA_TARGET)
  return camera
}

/** 固定相机位置，不跟随球（确保视频中看到完整球场和双方球员） */
export function updateCamera(camera: THREE.PerspectiveCamera, _target: THREE.Vector3): void {
  camera.position.copy(CAMERA_POS)
  camera.lookAt(CAMERA_TARGET)
}
