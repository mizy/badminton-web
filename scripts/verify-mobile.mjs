import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:3000'
await mkdir('.workbuddy/mobile-pwa', { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const errors = []
  for (const [name, width, height] of [['portrait', 393, 852], ['small', 360, 640], ['landscape', 852, 393]]) {
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`) })
    page.on('response', response => { if (response.status() >= 400) errors.push(`${name}: ${response.status()} ${response.url()}`) })
    await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    const client = await page.createCDPSession()
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.addEventListener('pointerdown', event => {
      if (event.target.dataset?.touch === 'stick-zone') window.__verifyStickPointer = event.pointerId
    }, true))
    assert.equal(await page.$$eval('#play-persona', nodes => nodes.length), 1)
    assert.equal(await page.$eval('#play-persona', node => node.options.length > 0), true)
    assert.equal(await page.$eval('[data-ui="touch-controls"]', node => node.textContent.includes('拖动不切换球路')), true)
    if (width < height) {
      assert.equal(await page.$eval('[data-ui="start-match"]', node => node.getBoundingClientRect().bottom < innerHeight), true, `${name}: start buttons must be visible`)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `.workbuddy/mobile-pwa/after-${name}-menu.png` })
    await page.select('#play-difficulty', 'easy')
    await page.click('[data-ui="start-training"]')
    const controls = await page.evaluate(() => [...document.querySelectorAll('[data-touch="shot"], [data-touch="jump"], [data-touch="action"]')].map(node => {
      const r = node.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { shot: node.dataset.shot ?? node.dataset.touch, size: Math.min(r.width, r.height), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && node.contains(top) }
    }))
    for (const control of controls) {
      assert.ok(control.inside && control.reachable && control.size >= 44, `${name}: ${JSON.stringify(control)}`)
    }
    const center = async selector => page.$eval(selector, node => {
      const r = node.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    const stickCenter = await center('[data-touch="stick"]')
    const origin = { x: Math.round(width * 0.2), y: height - 140 }
    const drag = await page.touchscreen.touchStart(origin.x, origin.y)
    const baseDown = await center('[data-touch="stick"]')
    assert.ok(Math.abs(baseDown.x - origin.x) < 1 && Math.abs(baseDown.y - origin.y) < 1, `${name}: base must match touch origin`)
    assert.deepEqual(await page.evaluate(() => window.__badminton__.getState().players[0].movement.targetDir), { x: 0, z: 0 })
    await drag.move(origin.x, origin.y - 8)
    await page.waitForFunction(() => {
      const x = window.__badminton__.getState().players[0].movement.targetDir.x
      return x > 0 && x < 0.25
    }, { timeout: 5000 })
    await drag.move(origin.x, origin.y - 140)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x > 0.99, { timeout: 5000 })
    const handle = await center('[data-touch="stick-knob"]')
    assert.ok(Math.abs(handle.x - origin.x) < 1 && Math.abs(handle.y - (origin.y - 140)) < 1, `${name}: handle must follow finger`)
    await drag.move(origin.x, origin.y - 106)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x === 0, { timeout: 5000 })
    await drag.move(origin.x, origin.y - 72)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x < -0.8, { timeout: 5000 })
    await drag.end()
    assert.deepEqual(await center('[data-touch="stick"]'), stickCenter)
    const edge = await page.touchscreen.touchStart(8, height - 28)
    assert.deepEqual(await page.evaluate(() => window.__badminton__.getState().players[0].movement.targetDir), { x: 0, z: 0 })
    const edgeBase = await center('[data-touch="stick"]')
    assert.ok(Math.abs(edgeBase.x - 8) < 1 && Math.abs(edgeBase.y - (height - 28)) < 1)
    await edge.move(8, height - 60)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x > 0)
    await page.evaluate(() => document.querySelector('[data-touch="stick-zone"]').releasePointerCapture(window.__verifyStickPointer))
    // 浏览器在下一条指针事件前处理 capture 的释放。
    await edge.move(8, height - 61)
    await page.waitForFunction(() => document.querySelector('[data-touch="stick"]').dataset.active !== 'true' && window.__badminton__.getState().players[0].movement.targetDir.x === 0)
    await edge.end()
    // 长拖会实际改变站位；从合法发球区重新开始双指发球验收。
    await page.click('[data-touch="action"]')
    await page.click('[data-ui="restart"]')
    const stick = await page.touchscreen.touchStart(stickCenter.x, stickCenter.y)
    await stick.move(stickCenter.x, stickCenter.y - 8)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x > 0)
    const shotCenter = await center('[data-shot="CLEAR"][data-touch="shot"]')
    const shot = await page.touchscreen.touchStart(shotCenter.x, shotCenter.y)
    assert.equal(await page.$eval('[data-shot="CLEAR"][data-touch="shot"]', node => node.dataset.aiming), 'true')
    await shot.move(shotCenter.x + 32, shotCenter.y - 24)
    await page.waitForFunction(() => Number(document.querySelector('[data-shot="CLEAR"][data-touch="shot"]').dataset.lateral) > 0, { timeout: 5000 })
    assert.equal(await page.$eval('[data-touch="stick"]', node => node.dataset.active), 'true')
    // 站稳再发球，保持左手接触以验证双指独立释放；避免等待浏览器帧时走出发球区。
    await stick.move(stickCenter.x, stickCenter.y)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x === 0)
    await shot.end()
    await page.waitForFunction(() => window.__badminton__.getState().phase === 'playing', { timeout: 5000 })
    await stick.end()
    assert.deepEqual(await page.evaluate(() => window.__badminton__.getState().players[0].movement.targetDir), { x: 0, z: 0 })
    assert.equal(await page.$eval('[data-touch="stick"]', node => node.dataset.active), undefined)
    assert.equal(await page.$eval('[data-shot="CLEAR"][data-touch="shot"]', node => node.dataset.aiming), undefined)
    await page.screenshot({ path: `.workbuddy/mobile-pwa/after-${name}-play.png` })
    const pause = await center('[data-touch="action"]')
    await page.touchscreen.tap(pause.x, pause.y)
    await page.waitForFunction(() => window.__badminton__.getState().phase === 'paused')
    await page.screenshot({ path: `.workbuddy/mobile-pwa/after-${name}-pause.png` })
    const resume = await center('[data-ui="resume"]')
    await page.touchscreen.tap(resume.x, resume.y)
    assert.notEqual(await page.evaluate(() => window.__badminton__.getState().phase), 'paused')
    await page.touchscreen.tap(pause.x, pause.y)
    await page.click('[data-ui="return-menu"]')
    await page.click('[data-ui="start-match"]')
    assert.equal(await page.evaluate(() => window.__badminton__.getState().mode), 'match')
    const held = await page.touchscreen.touchStart(stickCenter.x, stickCenter.y)
    await held.move(stickCenter.x, stickCenter.y - 32)
    await page.waitForFunction(() => window.__badminton__.getState().players[0].movement.targetDir.x > 0)
    const rotated = { width: height, height: width }
    await page.setViewport({ ...rotated, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas')
      return canvas.clientWidth === innerWidth && canvas.clientHeight === innerHeight
    }, { timeout: 5000 })
    await page.waitForFunction(() => document.querySelector('[data-touch="stick"]').dataset.active !== 'true' && window.__badminton__.getState().players[0].movement.targetDir.x === 0)
    await held.end()
    await page.close()
    console.log(`${name} ${width}×${height}: floating origin, soft start, follow/reversal, edge/capture loss, two-finger serve, pause/resume and held rotation passed`)
  }
  const page = await browser.newPage()
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true })
  await page.goto(url, { waitUntil: 'networkidle0' })
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: async () => { document.documentElement.dataset.promptCalls = '1' }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }), true)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.promptCalls), undefined)
  await page.click('[data-ui="install"]')
  await page.waitForFunction(() => document.querySelector('[data-ui="install-note"]').textContent.includes('取消'))
  assert.equal(await page.evaluate(() => document.documentElement.dataset.promptCalls), '1')
  await page.click('[data-ui="install"]')
  assert.ok(await page.$eval('[data-ui="install-note"]', node => node.textContent.includes('Safari') && node.textContent.includes('Android')))
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  assert.equal(await page.$eval('[data-ui="install-panel"]', node => node.hidden), true)
  await page.close()
  assert.deepEqual(errors, [])
  console.log('Install button prompt/cancellation/manual guidance/installed state passed; no Console/HTTP errors.')
} finally {
  await browser.close()
}
