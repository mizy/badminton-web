/** Real keyboard acceptance: prepare shots early, move, rally, smash, and pause. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const url = process.env.PLAY_URL ?? 'http://127.0.0.1:3000'
const output = '.workbuddy/gameplay'
await mkdir(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: `${output}/menu.png` })
  await page.select('#play-difficulty', 'easy')
  await page.click('[data-ui="start-training"]')
  await page.evaluate(async () => { window.__opportunity = (await import('/src/character/interception.ts')).predictShotOpportunity })
  const held = new Set()
  const setKeys = async keys => {
    for (const key of held) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key) }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key) }
  }
  const hits = []
  const rallies = []
  let lastKey = ''
  const started = Date.now()
  while (Date.now() - started < 60000 && (hits.length < 8 || Math.max(0, ...rallies) < 6)) {
    const read = await page.evaluate(() => {
      const s = window.__badminton__.getState()
      const p = s.players[0]
      const smash = s.shuttle && s.lastHitter === 1 ? window.__opportunity(p, s.shuttle, 'SMASH') : null
      const safe = s.shuttle && s.lastHitter === 1 ? window.__opportunity(p, s.shuttle, 'CLEAR') ?? window.__opportunity(p, s.shuttle, 'LIFT') : null
      return { s, opportunity: smash ?? safe, smash: !!smash }
    })
    const { s, opportunity } = read
    rallies.push(s.rallyHits)
    const key = `${s.rallyId}:${s.rallyHits}`
    if (s.lastHitter === 0 && s.rallyHits > 0 && key !== lastKey) {
      lastKey = key
      hits.push({ shot: s.players[0].swing.shot, quality: s.players[0].contactQuality, feedback: s.players[0].feedback, rallyHits: s.rallyHits })
      if (hits.length === 1 || s.players[0].swing.shot === 'SMASH') await page.screenshot({ path: `${output}/hit-${hits.length}.png` })
    }
    if (s.phase === 'idle') { await setKeys([]); await page.keyboard.press('j') }
    else if (s.phase === 'playing' && s.lastHitter === 1 && opportunity) {
      const p = s.players[0]
      const dx = opportunity.position[0] - p.pos[0]
      const dz = opportunity.position[2] - p.pos[2]
      const forward = p.side === 0 ? 1 : -1
      await setKeys(opportunity.distance > 0.65 ? [Math.abs(dx) > 0.15 ? dx * forward > 0 ? 'w' : 's' : '', Math.abs(dz) > 0.15 ? dz * forward > 0 ? 'd' : 'a' : ''].filter(Boolean) : [])
      if (p.swing.phase === 'ready' && opportunity.time < 0.8) {
        // After repeated smashes, sustain a cooperative rally using the safe shots.
        await page.keyboard.press(read.smash && hits.length < 8 ? 'l' : s.shuttle.pos[1] < 1.65 ? 'o' : 'j')
        await page.screenshot({ path: `${output}/prepared.png` })
      }
    } else await setKeys([])
    await new Promise(resolve => setTimeout(resolve, 45))
  }
  await setKeys([])
  assert.ok(hits.length >= 5, `expected repeated human returns: ${JSON.stringify(hits)}`)
  assert.ok(hits.filter(hit => hit.shot === 'SMASH').length >= 3, `expected repeatable smashes: ${JSON.stringify(hits)}`)
  assert.ok(Math.max(...rallies) >= 6, `expected a sustained rally, longest ${Math.max(...rallies)}`)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__badminton__.getState().phase === 'paused')
  await page.screenshot({ path: `${output}/paused.png` })
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify({ hits, longestRally: Math.max(...rallies), errors, elapsedMs: Date.now() - started }, null, 2))
  console.log(JSON.stringify({ hits, longestRally: Math.max(...rallies), errors, elapsedMs: Date.now() - started }, null, 2))
} finally { await browser.close() }
