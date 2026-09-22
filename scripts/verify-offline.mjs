import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:4173'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const cached = await page.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('badminton-')))
  assert.equal(cached.length, 1)
  await page.setOfflineMode(true)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-ui="start-training"]')
  await page.click('[data-ui="start-training"]')
  await page.keyboard.press('Space')
  await page.waitForFunction(() => document.querySelector('[data-ui="status-title"]').textContent.includes('回合进行中'))
  await page.screenshot({ path: '/tmp/badminton-offline.png' })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('#play-break-title').textContent.includes('暂停'))
  assert.deepEqual(errors, [])
  console.log('Production offline reload, training, manual serve and pause passed; no page errors.')
} finally {
  await browser.close()
}
