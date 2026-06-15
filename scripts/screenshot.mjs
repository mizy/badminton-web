import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })

console.log('Opening game...')
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 15000 })
await new Promise(r => setTimeout(r, 3000))

await page.screenshot({ path: '/tmp/badminton-gameplay.png', type: 'png' })
console.log('Screenshot 1 saved')

const state = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  return {
    canvasExists: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'none',
    gameReady: window.__badminton_game_ready__ || false,
  }
})
console.log('State:', JSON.stringify(state))

await new Promise(r => setTimeout(r, 5000))
await page.screenshot({ path: '/tmp/badminton-gameplay-2.png', type: 'png' })
console.log('Screenshot 2 saved')

await browser.close()
console.log('Done')
