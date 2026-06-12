/**
 * Capture badminton demo video via Puppeteer
 *
 * Usage:
 *   node scripts/capture.mjs [--port 4173] [--out /tmp/badminton-demo.mp4]
 *
 * Requires:
 *   - puppeteer-core (dev dependency)
 *   - Google Chrome installed at /Applications/Google Chrome.app
 *
 * Workflow:
 *   1. Starts vite preview server as child process
 *   2. Launches headless Chrome via Puppeteer
 *   3. Opens the game page
 *   4. Waits for auto-recording to complete (16s) and blob exposed on window
 *   5. Downloads the blob data and writes to output file
 *   6. Cleans up
 */

import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs'
import path from 'path'

const PORT = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10) || 4173
  : 4173

const OUT_FILE = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '/tmp/badminton-demo.mp4'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PREVIEW_BASE = `http://localhost:${PORT}`
const RECORD_TIMEOUT_MS = 60_000

// ── Step 1: Start vite preview ──────────────────────────────────
function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    let started = false
    const timeout = setTimeout(() => {
      if (!started) {
        proc.kill()
        reject(new Error('vite preview did not start within 30s'))
      }
    }, 30_000)

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      console.log('[preview]', text.trim())
      if (!started && text.includes('Local:')) {
        started = true
        clearTimeout(timeout)
        resolve(proc)
      }
    })

    proc.stderr.on('data', (data) => {
      console.error('[preview:err]', data.toString().trim())
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout)
        reject(new Error(`vite preview exited with code ${code}`))
      }
    })
  })
}

// ── Step 2: Launch browser & capture ─────────────────────────────
async function capture() {
  console.log(`\n🚀 Starting vite preview on port ${PORT}...`)
  const previewProc = await startPreview()
  console.log('✅ vite preview is ready')

  let browser
  try {
    console.log(`\n🚀 Launching Chrome from ${CHROME_PATH}...`)
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=swiftshader',
        '--enable-features=CanvasCaptureStream,RawCanvasCapture',
        '--autoplay-policy=no-user-gesture-required',
        '--force-cpu-draw',
      ],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })

    console.log(`\n📺 Opening ${PREVIEW_BASE}...`)
    await page.goto(PREVIEW_BASE, { waitUntil: 'networkidle0', timeout: 30_000 })
    console.log('✅ Page loaded')

    // Bring page to front to ensure requestAnimationFrame fires in headless mode
    await page.bringToFront()

    // Small delay to let game initialize
    await new Promise(r => setTimeout(r, 500))

    // Wait for game to signal it's ready and running
    console.log('⏳ Waiting for game loop to start...')
    const gameReady = await page.waitForFunction(
      () => (window).__badminton_game_ready__,
      { timeout: 15_000, polling: 200 },
    ).then(() => true).catch(() => false)
    if (!gameReady) {
      console.warn('⚠️ Game ready signal not received, proceeding anyway...')
    } else {
      console.log('✅ Game loop is running')
    }

    // Wait for the recording to auto-stop and blob to be exposed on window
    console.log('⏳ Waiting for recording to finish (18s auto-stop)...')
    const recordingDataUrl = await page.waitForFunction(
      () => (window).__badminton_recording__,
      { timeout: RECORD_TIMEOUT_MS, polling: 500 },
    ).then(async () => {
      return page.evaluate(() => (window).__badminton_recording__)
    })
    .catch((err) => {
      console.error('❌ Timed out waiting for recording blob (60s):', err.message || '')
      return null
    })

    if (!recordingDataUrl) {
      throw new Error('Failed to get recording data')
    }

    // Decode base64 data URL
    const base64Data = recordingDataUrl.split(',')[1]
    if (!base64Data) {
      throw new Error('Invalid data URL format')
    }

    const buffer = Buffer.from(base64Data, 'base64')
    console.log(`📦 Recording blob size: ${buffer.length} bytes`)

    // Ensure output directory exists
    const outDir = path.dirname(OUT_FILE)
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true })
    }

    // Use synchronous write to guarantee file is fully flushed to disk
    // even if SIGTERM/SIGINT arrives during write
    writeFileSync(OUT_FILE, buffer)
    const stat = existsSync(OUT_FILE) ? statSync(OUT_FILE) : null
    console.log(`✅ Video saved to ${OUT_FILE}${stat ? ` (${(stat.size / 1024 / 1024).toFixed(1)} MB)` : ''}`)

    return true
  } catch (err) {
    console.error('❌ Capture failed:', err.message)
    return false
  } finally {
    if (browser) await browser.close()
    previewProc.kill()
    console.log('🧹 Cleanup done')
  }
}

// ── Graceful shutdown handling ──────────────────────────────────
function handleSignal(signal) {
  console.log(`[capture] received ${signal}, shutting down gracefully...`)
  process.exit(1)
}
process.on('SIGTERM', handleSignal)
process.on('SIGINT', handleSignal)

// ── Main ─────────────────────────────────────────────────────────
capture().then((ok) => {
  process.exit(ok ? 0 : 1)
}).catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
