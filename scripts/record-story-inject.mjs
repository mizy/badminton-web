/**
 * Record a Storybook story by injecting MediaRecorder into the page.
 * Usage: node scripts/record-story-inject.mjs --story <id> --out <file.webm> [--duration 25]
 */
import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync, statSync, existsSync } from 'fs'
import path from 'path'

const STORYBOOK_PORT = 7608
const STORY_ID = process.argv.includes('--story')
  ? process.argv[process.argv.indexOf('--story') + 1]
  : '游戏-完整比赛演示--medium-vs-medium'
const OUT_FILE = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '/tmp/badminton-story.webm'
const DURATION_MS = process.argv.includes('--duration')
  ? parseInt(process.argv[process.argv.indexOf('--duration') + 1], 10) * 1000
  : 25_000

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const STORYBOOK_BASE = `http://localhost:${STORYBOOK_PORT}`

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-features=CanvasCaptureStream,RawCanvasCapture,VaapiVideoEncoder',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu-sandbox',
      '--window-size=1280,720',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })

  const storyUrl = `${STORYBOOK_BASE}/iframe.html?id=${STORY_ID}&viewMode=story`
  console.log(`📺 Opening ${storyUrl}...`)
  await page.goto(storyUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
  console.log('✅ Page loaded')

  await page.bringToFront()
  await new Promise(r => setTimeout(r, 3000))

  console.log('⏳ Waiting for canvas...')
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas')
      return canvas && canvas.width > 0 && canvas.height > 0
    },
    { timeout: 20_000, polling: 200 },
  ).catch(() => console.warn('⚠️ Canvas not ready'))

  // Inject recorder
  console.log('🎥 Injecting recorder...')
  const dataUrl = await page.evaluate(async (durationMs) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) throw new Error('no canvas')
    const stream = canvas.captureStream(60)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType })
    const chunks = []
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    const stopped = new Promise(resolve => { rec.onstop = resolve })
    rec.start()
    console.log('[inject] recording for', durationMs, 'ms')
    await new Promise(r => setTimeout(r, durationMs))
    rec.stop()
    await stopped
    const blob = new Blob(chunks, { type: 'video/webm' })
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }, DURATION_MS)

  const base64 = String(dataUrl).split(',')[1]
  if (!base64) throw new Error('no data')
  const buffer = Buffer.from(base64, 'base64')
  console.log(`📦 Recording size: ${buffer.length} bytes`)

  const outDir = path.dirname(OUT_FILE)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(OUT_FILE, buffer)
  const st = statSync(OUT_FILE)
  console.log(`✅ Video saved to ${OUT_FILE} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)

  await browser.close()
}

capture().catch(err => { console.error('Fatal:', err); process.exit(1) })
