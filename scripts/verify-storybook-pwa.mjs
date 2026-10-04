/** Serve the real Pages build and navigate its installed game PWA into Storybook. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const root = path.resolve('dist')
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (!pathname.startsWith('/badminton-web/')) { response.writeHead(404).end(); return }
    const local = decodeURIComponent(pathname.slice('/badminton-web/'.length))
    const file = path.resolve(root, local.endsWith('/') || !local ? `${local}index.html` : local)
    if (!file.startsWith(`${root}/`)) { response.writeHead(403).end(); return }
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    response.end(data)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/badminton-web/`
const browser = await puppeteer.connect({ browserURL: process.env.CDP_URL ?? 'http://127.0.0.1:9222' })
const context = await browser.createBrowserContext()
const results = []
try {
  for (const mobile of [false, true]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`) })
    await page.setViewport(mobile ? { width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { width: 1440, height: 900 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.goto(`${url}storybook/?path=/story/动作素材-统一角色视频动作--all`, { waitUntil: 'networkidle0' })
    const frameElement = await page.waitForSelector('#storybook-preview-iframe')
    const frame = await frameElement.contentFrame()
    await frame.waitForFunction(() => document.querySelectorAll('[data-motion]').length === 8)
    assert.equal(await frame.$('[data-ui="start-training"]'), null, 'PWA returned game HTML for Storybook')
    assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    await frame.click('[data-motion="front-backhand"]')
    await frame.$eval('[data-time]', input => { input.value = '1.88'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.screenshot({ path: `.workbuddy/motion-library/${mobile ? 'mobile' : 'desktop'}-published-layout.png` })
    const download = await frame.$eval('[data-model-download]', node => node.href)
    assert.ok(download.startsWith(`${url}storybook/models/`))
    assert.equal(await page.evaluate(async url => (await fetch(url)).status, download), 200)
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.setOfflineMode(true)
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-ui="start-training"]')
    await page.click('[data-ui="start-training"]')
    await page.waitForSelector('[data-task="1"]')
    if (mobile) {
      const point = await page.$eval('[data-touch="shot"][data-direction="up"]', node => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      })
      await page.touchscreen.tap(point.x, point.y)
    } else await page.keyboard.press('Space')
    await page.waitForFunction(() => document.querySelector('[data-task="1"]').dataset.complete === 'true', { timeout: 7000 })
    await page.setOfflineMode(false)
    assert.deepEqual(errors, [])
    results.push({ mobile, storybookUnderGameWorker: true, glbDownload: true, gameOfflineServe: true, errors })
    await page.close()
  }
  await writeFile('.workbuddy/motion-library/pwa-acceptance.json', JSON.stringify(results, null, 2))
  console.log(results)
} finally {
  await context.close()
  await browser.disconnect()
  await new Promise(resolve => server.close(resolve))
}
