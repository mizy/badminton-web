import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import path from 'path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const STORYBOOK_PORT = 7608
const STORYBOOK_BASE = `http://localhost:${STORYBOOK_PORT}`
const STORY_ID = '游戏--完整比赛演示--mediumvsmedium'
const OUT_FILE = '/tmp/badminton-storybook.mp4'

async function capture() {
  console.log('🚀 Launching Chrome...')
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
    { timeout: 15_000, polling: 200 },
  ).catch(() => console.warn('⚠️ Canvas not ready'))

  console.log('⏳ Waiting for recording (~25s)...')
  const recordingDataUrl = await page.waitForFunction(
    () => globalThis.__badminton_recording__,
    { timeout: 60000, polling: 500 },
  ).then(async () => {
    return page.evaluate(() => globalThis.__badminton_recording__)
  })
  .catch((err) => {
    console.error('❌ Timeout:', err.message)
    return null
  })

  if (!recordingDataUrl) {
    throw new Error('No recording data')
  }

  const base64Data = recordingDataUrl.split(',')[1]
  const buffer = Buffer.from(base64Data, 'base64')
  console.log(`📦 Recording size: ${buffer.length} bytes`)

  if (buffer.length === 0) throw new Error('Empty recording')

  const outDir = path.dirname(OUT_FILE)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  writeFileSync(OUT_FILE, buffer)
  const st = statSync(OUT_FILE)
  console.log(`✅ Video saved to ${OUT_FILE} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)

  await browser.close()
  console.log('🎉 Done!')
}

capture().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
