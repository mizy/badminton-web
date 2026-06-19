import { toggleCameraMode } from '../render/camera'

export function connectPlayHotkeys(toggleRecording: () => void): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.code === 'KeyR') {
      event.preventDefault()
      toggleRecording()
    }

    if (event.code === 'KeyC') {
      event.preventDefault()
      toggleCameraMode()
    }
  })
}
