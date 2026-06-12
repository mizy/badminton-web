/** MediaRecorder 录像封装 */

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private recording = false

  start(canvas: HTMLCanvasElement): void {
    const stream = canvas.captureStream(60)
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
    })
    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start()
    this.recording = true
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return resolve(new Blob())
      // Set recording = false immediately to prevent double-stop race conditions
      this.recording = false
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' })
        resolve(blob)
      }
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop()
      } else {
        // Already stopped, resolve immediately
        resolve(new Blob(this.chunks, { type: 'video/webm' }))
      }
    })
  }

  isRecording(): boolean {
    return this.recording
  }
}
