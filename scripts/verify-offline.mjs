import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:4173'
await mkdir('.workbuddy/mobile-pwa', { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const errors = []
  for (const [name, width, height, mobile] of [['desktop', 1440, 900, false], ['mobile', 393, 852, true]]) {
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`) })
    page.on('response', response => { if (response.status() >= 400) errors.push(`${name}: ${response.status()} ${response.url()}`) })
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    const client = await page.createCDPSession()
    const app = await client.send('Page.getAppManifest')
    assert.deepEqual(app.errors, [])
    const manifest = JSON.parse(app.data)
    assert.equal(manifest.display, 'standalone')
    assert.equal(manifest.orientation, 'any')
    assert.deepEqual((await client.send('Page.getInstallabilityErrors')).installabilityErrors, [])
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    const cached = await page.evaluate(async () => {
      const names = (await caches.keys()).filter(key => key.startsWith('badminton-'))
      const cache = await caches.open(names[0])
      return { names, paths: (await cache.keys()).map(request => new URL(request.url).pathname) }
    })
    assert.equal(cached.names.length, 1)
    for (const file of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'models/anime-player.glb']) {
      assert.ok(cached.paths.some(path => path.endsWith(`/${file}`)), `${name}: cache missing ${file}`)
    }
    await page.setOfflineMode(true)
    await page.reload({ waitUntil: 'networkidle0' })
    const start = await page.$('[data-ui="start-training"]')
    assert.ok(start)
    await start.click()
    if (mobile) {
      const shot = await page.$eval('[data-touch="shot"][data-direction="up"]', node => {
        const r = node.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      await page.touchscreen.tap(shot.x, shot.y)
    } else await page.keyboard.press('Space')
    await page.waitForFunction(() => document.querySelector('[data-task="1"]').dataset.complete === 'true', { timeout: 5000 })
    await page.screenshot({ path: `.workbuddy/mobile-pwa/after-${name}-offline.png` })
    if (mobile) {
      const pause = await page.$eval('[data-touch="action"]', node => {
        const r = node.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      await page.touchscreen.tap(pause.x, pause.y)
    } else await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelector('#play-break-title').textContent.includes('暂停'))
    await page.setOfflineMode(false)
    await page.close()
    console.log(`${name}: manifest, installability, icon cache, offline reload, training, serve and pause passed`)
  }
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await page.goto(url, { waitUntil: 'networkidle0' })
  assert.equal(await page.$eval('[data-ui="install-panel"]', node => node.hidden), true)
  await page.close()
  assert.deepEqual(errors, [])
  console.log('iOS standalone flag hides install entry; no Console/HTTP errors.')
} finally {
  await browser.close()
}
