import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import puppeteer from 'puppeteer-core'

// Serve consecutive releases of the real production build under the Pages base.
const sw = await readFile('dist/sw.js', 'utf8')
const files = JSON.parse(sw.match(/const FILES = (\[.*\]);/)[1])
const assets = new Map(await Promise.all([...files, 'sw.js'].map(async file => [file, await readFile(`dist/${file}`)])))
const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', webmanifest: 'application/manifest+json', png: 'image/png', glb: 'model/gltf-binary' }
let release = 1
let legacy = false
let waitingOnly = false
// Match the pre-auto-update entry and worker: cache-first, no activation message.
const legacyEntry = "navigator.serviceWorker.register('/badminton-web/sw.js')"
const legacyWorker = `const CACHE = 'badminton-test-legacy';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['index.html', 'legacy-entry.js']))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('badminton-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const key = event.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : event.request;
  event.respondWith(caches.open(CACHE).then(async cache => await cache.match(key) || fetch(event.request)));
});`
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const file = pathname.replace(/^\/badminton-web\//, '').replace(/^\//, '') || 'index.html'
  let body = assets.get(file)
  if (file === 'legacy-entry.js') body = legacyEntry
  if (legacy && file === 'index.html') body = '<!doctype html><html data-release="legacy"><link rel="icon" href="data:,"><script type="module" src="/badminton-web/legacy-entry.js"></script></html>'
  if (legacy && file === 'sw.js') body = legacyWorker
  if (!body) {
    response.writeHead(404).end()
    return
  }
  if (!legacy && file === 'sw.js') {
    body = sw.replace(/const CACHE = '[^']+';/, `const CACHE = 'badminton-test-${release}';`)
    if (waitingOnly) body = body.replace('if (await needsLegacyMigration()) await self.skipWaiting();', '')
  }
  if (!legacy && file === 'index.html') body = body.toString().replace('<html', `<html data-release="${release}"`)
  response.writeHead(200, { 'Content-Type': types[file.split('.').at(-1)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  response.end(body)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/badminton-web/`
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const mobile of [false, true]) {
    release = 1
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const errors = []
    const failedResponses = []
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()) })
    await page.setViewport(mobile ? { width: 393, height: 852, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
    // Mobile emulation reloads about:blank before the actual app navigation.
    navigations = 0
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    assert.equal(navigations, 1, 'first installation must not refresh the game')

    release = 2
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForFunction(() => document.documentElement.dataset.release === '2')
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    assert.equal(navigations, 2, 'menu update reloads exactly once')

    await page.waitForSelector('[data-ui="start-match"]', { visible: true })
    await page.click('[data-ui="start-match"]')
    release = 3
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)
    assert.equal(navigations, 2, 'newly downloaded update must not interrupt a match')
    assert.equal(await page.$eval('[data-ui="menu-dialog"]', node => node.hidden), true)
    // A second menu tab may activate the worker; this match still defers reloading.
    const menu = await context.newPage()
    await menu.bringToFront()
    await menu.goto(url, { waitUntil: 'networkidle0' })
    await menu.waitForFunction(() => document.documentElement.dataset.release === '3')
    await page.bringToFront()
    await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).waiting)
    assert.equal(navigations, 2, 'another tab activating the update must not refresh this match')
    await menu.close()
    // Switching away from the match pauses it, so return through the pause dialog.
    await page.click('[data-ui="return-menu"]')
    await page.waitForFunction(() => document.documentElement.dataset.release === '3')
    assert.equal(navigations, 3, 'returning to menu applies the activated release once')

    await page.setOfflineMode(true)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    assert.equal(navigations, 3, 'offline check preserves the working release')
    await page.reload({ waitUntil: 'networkidle0' })
    assert.equal(await page.$eval('html', node => node.dataset.release), '3', 'offline restart uses cached release')
    // Publish only after the offline restart, so an in-flight startup check
    // cannot legitimately download release 4 before emulated disconnection.
    release = 4
    await page.setOfflineMode(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForFunction(() => document.documentElement.dataset.release === '4')
    const stable = navigations
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration()).update()
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    assert.equal(navigations, stable, 'unchanged worker must not reload')
    await page.waitForFunction(async () => (await caches.keys()).filter(key => key.startsWith('badminton-')).length === 1)
    // With no other menu tab, returning to the menu must activate a waiting worker.
    await page.waitForSelector('[data-ui="start-match"]', { visible: true })
    await page.click('[data-ui="start-match"]')
    release = 5
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)
    assert.equal(navigations, stable)
    if (mobile) await page.click('[data-touch="action"]')
    else await page.keyboard.press('Escape')
    await page.click('[data-ui="return-menu"]')
    await page.waitForFunction(() => document.documentElement.dataset.release === '5')
    assert.equal(navigations, stable + 1)
    // Restart from stale cached HTML: startup registration should apply the next release.
    release = 6
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction(() => document.documentElement.dataset.release === '6')
    assert.deepEqual(errors, [])
    assert.deepEqual(failedResponses, [])
    await context.close()
    console.log(`${mobile ? 'mobile' : 'desktop'}: first install, menu update, match deferral, multi-tab activation, offline restart and reconnect passed`)

    // A legacy user may already have downloaded an earlier update into a
    // separate waiting cache. That cache must not hide the active legacy build.
    legacy = true
    const oldContext = await browser.createBrowserContext()
    const oldPage = await oldContext.newPage()
    await oldPage.setViewport(mobile ? { width: 393, height: 852, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
    let oldNavigations = 0
    let tabNavigations = 0
    oldPage.on('framenavigated', frame => { if (frame === oldPage.mainFrame()) oldNavigations++ })
    oldPage.on('pageerror', error => errors.push(error.message))
    oldPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    oldPage.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()) })
    await oldPage.goto(url, { waitUntil: 'networkidle0' })
    await oldPage.waitForFunction(() => !!navigator.serviceWorker.controller)
    const oldTab = await oldContext.newPage()
    oldTab.on('framenavigated', frame => { if (frame === oldTab.mainFrame()) tabNavigations++ })
    oldTab.on('pageerror', error => errors.push(error.message))
    oldTab.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()) })
    await oldTab.goto(url, { waitUntil: 'networkidle0' })
    await oldPage.bringToFront()
    legacy = false
    waitingOnly = true
    release = 7
    await oldPage.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update() })
    await oldPage.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)
    assert.equal(await oldPage.$eval('html', node => node.dataset.release), 'legacy')
    waitingOnly = false
    release = 8
    await oldPage.evaluate(async () => { void (await navigator.serviceWorker.getRegistration()).update() })
    await oldPage.waitForFunction(() => document.documentElement.dataset.release === '8')
    await oldTab.waitForFunction(() => document.documentElement.dataset.release === '8', { polling: 100 })
    await oldPage.waitForFunction(async () => (await caches.keys()).filter(key => key.startsWith('badminton-')).length === 1)
    assert.equal(oldNavigations, 2, 'legacy migration reloads once')
    assert.equal(tabNavigations, 2, 'background legacy tab migrates once')
    await oldPage.setOfflineMode(true)
    await oldPage.reload({ waitUntil: 'networkidle0' })
    assert.equal(await oldPage.$eval('html', node => node.dataset.release), '8')
    assert.deepEqual(errors, [])
    assert.deepEqual(failedResponses, [])
    await oldContext.close()
    console.log(`${mobile ? 'mobile' : 'desktop'}: legacy migration, pre-existing waiting update, two old tabs and offline restart passed`)
  }
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
