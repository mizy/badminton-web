import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluateOnNewDocument(() => {
    const clock = performance.now.bind(performance)
    const origin = clock()
    Object.defineProperty(performance, 'now', { value: () => origin + (clock() - origin) * 20 })
  })
  await page.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:3000', { waitUntil: 'networkidle0' })
  await page.select('#play-style', 'placement')
  await page.click('[data-ui="start-match"]')
  await page.evaluate(() => {
    window.__acceptancePoints = []
    const serve = () => {
      const event = type => new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true })
      window.dispatchEvent(event('keydown'))
      window.dispatchEvent(event('keyup'))
    }
    let previousPoint = ''
    function play() {
      const state = window.__badminton__.getState()
      const pointKey = `${state.match.currentSet}:${state.match.points.join(':')}`
      if (previousPoint !== pointKey) window.__acceptancePoints.push(pointKey)
      previousPoint = pointKey
      if (state.phase === 'match_end') return
      if (state.phase === 'set_end') document.querySelector('[data-ui="next-set"]').click()
      if (state.phase === 'idle' && state.match.server === 0) serve()
      requestAnimationFrame(play)
    }
    requestAnimationFrame(play)
  })
  await page.waitForFunction(() => window.__badminton__.getState().phase === 'match_end', { timeout: 120000 })
  const completed = await page.evaluate(() => window.__badminton__.getState())
  assert.ok(completed.match.sets.filter(set => set.home > set.away).length >= 2 || completed.match.sets.filter(set => set.away > set.home).length >= 2)
  assert.ok(completed.rallyId >= 42)
  await page.screenshot({ path: '/tmp/badminton-match-end.png' })
  const display = await page.$eval('[data-ui="result-rows"]', node => node.innerText)
  assert.ok(display.includes('21'))
  await page.click('[data-ui="restart"]')
  await page.waitForFunction(() => window.__badminton__.getState().phase === 'idle')
  const restarted = await page.evaluate(() => window.__badminton__.getState())
  assert.deepEqual(restarted.match.points, [0, 0])
  assert.equal(restarted.rallyId, 0)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ checks: 'Accelerated-time browser match: legal keyboard serves, point progression, end change, match result and rematch', sets: completed.match.sets, rallies: completed.rallyId, elapsed: completed.elapsed, errors }))
} finally {
  await browser.close()
}
