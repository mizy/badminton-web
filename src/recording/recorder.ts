/**
 * MediaRecorder 录像封装
 *
 * 支持两种录制模式：
 * 1. 合成模式（默认）：将 WebGL 画布 + 2D HUD 叠层绘制到一个合成画布上，
 *    然后对合成画布 captureStream。这样 HUD 元素也能被录进去。
 * 2. 直录模式：直接对 WebGL 画布 captureStream（旧逻辑）。
 */

/** 将 HUD 叠层信息绘制到 2D canvas 上 */
export interface HudOverlay {
  scoreText: string
  setText: string
  rallyText: string
  statusText: string
  controlsText: string
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private recording = false

  /** 合成画布 & 其 2D 上下文（在 start 时懒创建） */
  private compCanvas: HTMLCanvasElement | null = null
  private compCtx: CanvasRenderingContext2D | null = null

  /** 当前帧的 HUD 叠层数据，外部每帧调用 updateHud 设置 */
  private hud: HudOverlay = { scoreText: '', setText: '', rallyText: '', statusText: '', controlsText: '' }

  updateHud(overlay: HudOverlay): void {
    this.hud = overlay
  }

  /** 每帧在 renderer.render 之后调用，将 WebGL 画面 + HUD 合成并刷新合成画布 */
  composite(glCanvas: HTMLCanvasElement): void {
    if (!this.compCanvas || !this.compCtx) return
    const ctx = this.compCtx
    const w = this.compCanvas.width
    const h = this.compCanvas.height

    // 1. 画 WebGL 画面
    ctx.drawImage(glCanvas, 0, 0, w, h)

    // 2. 画 HUD 叠层（半透明黑底白字，位置与 DOM 叠层一致）
    ctx.save()

    // 顶部计分
    if (this.hud.scoreText) {
      drawPill(ctx, w / 2, 28, this.hud.scoreText, 28, '#fff', 0.5)
    }

    // 赛局信息
    if (this.hud.setText) {
      drawText(ctx, w / 2, 68, this.hud.setText, 14, '#aaa')
    }

    // 回合数
    if (this.hud.rallyText) {
      drawText(ctx, w / 2, 95, this.hud.rallyText, 16, '#ffcc00')
    }

    // 底部状态
    if (this.hud.statusText) {
      drawText(ctx, w / 2, h - 20, this.hud.statusText, 14, '#aaa')
    }

    ctx.restore()
  }

  start(canvas: HTMLCanvasElement): void {
    // 创建合成画布（和 WebGL 画布同尺寸）
    this.compCanvas = document.createElement('canvas')
    this.compCanvas.width = canvas.width
    this.compCanvas.height = canvas.height
    this.compCtx = this.compCanvas.getContext('2d')!

    const stream = this.compCanvas.captureStream(60)
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

/* ── 2D HUD 绘制辅助 ── */

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  bgAlpha: number,
): void {
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tm = ctx.measureText(text)
  const padX = 24
  const padY = 8
  const w = tm.width + padX * 2
  const h = fontSize + padY * 2

  ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 12)
  ctx.fill()

  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
): void {
  ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
