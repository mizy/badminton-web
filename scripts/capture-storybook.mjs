/**
 * Capture badminton demo video from Storybook via Puppeteer
 *
 * Usage:
 *   node scripts/capture-storybook.mjs [--story 游戏/完整比赛演示--mediumvsmedium] [--out /tmp/badminton-storybook.webm]
 *
 * Requires:
 *   - puppeteer-core (dev dependency)
 *   - Google Chrome installed at /Applications/Google Chrome.app
 */

import puppeteer from 'puppeteer-core'
import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs'
import path from 'path'

const STORYBOOK_PORT = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10) || 6006
  : 6006

const STORY_ID = process.argv.includes('--story')
  ? process.argv[process.argv.indexOf('--story') + 1]
  : '游戏--完整比赛演示--mediumvsmedium'

const OUT_FILE = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '/tmp/badminton-storybook.webm'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const STORYBOOK_BASE = `http://localhost:${STORYBOOK_PORT}`
const RECORD_TIMEOUT_MS = 60_000

function startStorybookDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['storybook', 'dev', '-p', String(STORYBOOK_PORT), '--no-open'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    let started = false
    const timeout = setTimeout(() => {
      if (!started) {
        proc.kill()
        reject(new Error('storybook dev did not start within 60s'))
      }
    }, 60_000)

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      console.log('[storybook]', text.trim())
      if (!started && (text.includes('Local:') || text.includes('started'))) {
        started = true
        clearTimeout(timeout)
        setTimeout(() => resolve(proc), 3000)
      }
    })

    proc.stderr.on('data', (data) => {
      console.error('[storybook:err]', data.toString().trim())
    })

    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout)
        reject(new Error(`storybook exited with code ${code}`))
      }
    })
  })
}

async function capture() {
  if (!existsSync(CHROME_PATH)) {
    throw new Error(`Chrome not found at ${CHROME_PATH}`)
  }

  console.log(`\n🚀 Starting Storybook on port ${STORYBOOK_PORT}...`)
  const storybookProc = await startStorybookDev()
  console.log('✅ Storybook is ready')

  let browser
  try {
    console.log(`\n🚀 Launching Chrome...`)
    browser = await puppeteer.launch({
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
    console.log(`\n📺 Opening ${storyUrl}...`)
    await page.goto(storyUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
    console.log('✅ Page loaded')

    await page.bringToFront()
    await new Promise(r => setTimeout(r, 2000))

    console.log('⏳ Waiting for game to initialize...')
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas')
        return canvas && canvas.width > 0 && canvas.height > 0
      },
      { timeout: 15_000, polling: 200 },
    ).catch(() => console.warn('⚠️ Canvas not ready, proceeding...'))

    console.log('⏳ Waiting for recording to finish (~25s)...')
    const recordingDataUrl = await page.waitForFunction(
      () => globalThis.__badminton_recording__,
      { timeout: RECORD_TIMEOUT_MS, polling: 500 },
    ).then(async () => {
      return page.evaluate(() => globalThis.__badminton_recording__)
    })
    .catch((err) => {
      console.error('❌ Timed out:', err.message || '')
      return null
    })

    if (!recordingDataUrl) {
      throw new Error('Failed to get recording data')
    }

    const base64Data = recordingDataUrl.split(',')[1]
    if (!base64Data) {
      throw new Error('Invalid data URL format')
    }

    const buffer = Buffer.from(base64Data, 'base64')
    console.log(`📦 Recording blob size: ${buffer.length} bytes`)

    if (buffer.length === 0) {
      throw new Error('Recording blob is empty')
    }

    const outDir = path.dirname(OUT_FILE)
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true })
    }

    writeFileSync(OUT_FILE, buffer)
    const st = statSync(OUT_FILE)
    console.log(`✅ Video saved to ${OUT_FILE} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)

    return true
  } catch (err) {
    console.error('❌ Capture failed:', err.message)
    return false
  } finally {
    if (browser) await browser.close()
    storybookProc.kill()
    console.log('🧹 Cleanup done')
  }
}

capture().then((ok) => {
  process.exit(ok ? 0 : 1)
}).catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
