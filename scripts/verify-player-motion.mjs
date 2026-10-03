import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const url = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:7608'
const output = '.workbuddy/anime/acceptance'
await mkdir(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader'] })
try {
  const errors = []
  for (const [device, width, height] of [['desktop', 1200, 760], ['mobile', 393, 852]]) {
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(`${device}: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') errors.push(`${device}: ${message.text()}`) })
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()}: ${response.url()}`)
    })
    // Avoid the iframe's default favicon request; it is not a game asset.
    await page.setRequestInterception(true)
    page.on('request', request => request.url().endsWith('/favicon.ico')
      ? request.respond({ status: 204 }) : request.continue())
    await page.setViewport({ width, height, isMobile: device === 'mobile', hasTouch: device === 'mobile' })
    for (const motion of ['ready', 'backhandDrive', 'backhandClear', 'forehandLunge', 'backhandLunge', 'expert']) {
      const stroke = motion === 'backhandDrive' || motion === 'backhandClear'
      const samples = motion === 'ready' ? [0] : device === 'mobile' ? [stroke ? 0.49 : 0.58]
        : stroke ? [0.35, 0.49, 0.61] : [0.4, 0.68, 1.0]
      for (const time of samples) {
        const source = motion === 'expert' ? 'source:multisense' : `motion:${motion}`
        await page.goto(`${url}/iframe.html?id=渲染-球员展示--default&args=${source};paused:true;time:${time}`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('canvas')
        const nonblank = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
          const source = document.querySelector('canvas')
          const sample = document.createElement('canvas')
          sample.width = 32
          sample.height = 32
          const context = sample.getContext('2d')
          context.drawImage(source, 0, 0, 32, 32)
          const pixels = context.getImageData(0, 0, 32, 32).data
          resolve(new Set(Array.from(pixels).filter((_, index) => index % 4 !== 3)).size > 50)
        })))
        assert.ok(nonblank, `${device}: ${motion} canvas is blank`)
        await page.screenshot({ path: `${output}/${device}-${motion}-${time}.png` })
      }
    }
    await page.close()
    console.log(`${device}: avatar, backhand drive/clear, forehand/backhand lunge rendered; screenshots in ${output}`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
