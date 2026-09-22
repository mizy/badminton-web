import { isEditingInput } from '../input/keyboard'
import { toggleCameraMode } from '../render/camera'

export function connectPlayHotkeys(toggleRecording: () => void): () => void {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.repeat || isEditingInput(event)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      toggleRecording()
    } else if (event.code === 'KeyC') {
      event.preventDefault()
      toggleCameraMode()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}
