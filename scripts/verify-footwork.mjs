import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:3000'
const output = '.workbuddy/footwork'
await mkdir(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.createBrowserContext()
try {
  const results = []
  for (const mobile of [false, true]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`) })
    await page.setViewport(mobile ? { width: 393, height: 852, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.bringToFront()
    await page.evaluate(async () => {
      const path = performance.getEntriesByType('resource').find(entry => /\/three\.js(?:\?|$)/.test(entry.name)).name
      const THREE = await import(path)
      const update = THREE.Scene.prototype.updateMatrixWorld
      THREE.Scene.prototype.updateMatrixWorld = function (...args) { window.__footworkScene = this; return update.apply(this, args) }
      window.__footSamples = []
      function sample() {
        if (window.__footworkScene && window.__badminton__) {
          const state = window.__badminton__.getState()
          const players = window.__footworkScene.children.filter(node => node.name === 'player')
          const player = players[0]
          if (player?.getObjectByName('RightFoot')) {
            const position = name => player.getObjectByName(name).matrixWorld.elements.slice(12, 15)
            window.__footSamples.push({ time: performance.now(), point: state.players[0].movement.footworkPoint,
              speed: Math.hypot(state.players[0].movement.currentVel.x, state.players[0].movement.currentVel.z),
              source: [position('right-ankle'), position('left-ankle')], skin: [position('RightFoot'), position('LeftFoot')] })
          }
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    for (const point of ['front-left', 'front-right', 'mid-left', 'mid-right', 'back-left', 'back-right']) {
      await page.click('[data-ui="start-training"]')
      await page.evaluate(() => { window.__footSamples = [] })
      const x = point.startsWith('front') ? 1 : point.startsWith('back') ? -1 : 0
      const z = point.endsWith('left') ? -1 : 1
      let touch
      const keys = [x > 0 ? 'w' : x < 0 ? 's' : '', z > 0 ? 'd' : 'a'].filter(Boolean)
      if (mobile) {
        const center = await page.$eval('[data-touch="stick"]', node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
        touch = await page.touchscreen.touchStart(center.x, center.y)
        await touch.move(center.x + z * 65, center.y - x * 65)
      } else for (const key of keys) await page.keyboard.down(key)
      await page.waitForFunction(expected => window.__badminton__.getState().players[0].movement.footworkPoint === expected, { timeout: 5000 }, point)
      await new Promise(resolve => setTimeout(resolve, 450))
      await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${point}.png` })
      if (mobile) await touch.end()
      else for (const key of keys) await page.keyboard.up(key)
      await new Promise(resolve => setTimeout(resolve, 600))
      const samples = await page.evaluate(() => window.__footSamples)
      assert.ok(samples.length > 15, `${point}: insufficient moving frames`)
      let skinError = 0, slip = 0, lift = 0
      let slipping
      for (let frame = 0; frame < samples.length; frame++) {
        const sample = samples[frame]
        for (let i = 0; i < 2; i++) {
          skinError = Math.max(skinError, Math.hypot(...sample.skin[i].map((v, axis) => v - sample.source[i][axis])))
          lift = Math.max(lift, sample.skin[i][1] - 0.09)
          const previous = samples[frame - 1]
          if (previous && sample.time - previous.time < 80 && sample.speed > 0.1 && sample.skin[i][1] < 0.090001 && previous.skin[i][1] < 0.090001) {
            const distance = Math.hypot(sample.skin[i][0] - previous.skin[i][0], sample.skin[i][2] - previous.skin[i][2])
            if (distance > slip) { slip = distance; slipping = { frame, i, previous, sample } }
          }
        }
      }
      assert.ok(skinError < 0.025, `${point}: skin/source divergence ${skinError}`)
      assert.ok(lift > 0.075, `${point}: no readable foot lift ${lift}`)
      assert.ok(slip < 0.025, `${point}: planted foot slides ${slip}: ${JSON.stringify(slipping)}`)
      results.push({ device: mobile ? 'mobile' : 'desktop', point, frames: samples.length, skinError, slip, lift })
      if (mobile) await page.click('[data-touch="action"]')
      else await page.keyboard.press('Escape')
      await page.click('[data-ui="return-menu"]')
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  await writeFile(`${output}/browser-results.json`, JSON.stringify(results, null, 2))
  console.log(results)
} finally { await context.close(); await browser.close() }
