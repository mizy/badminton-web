/**
 * 把实机尺寸下的一帧 3D 画面降采样成 ASCII，用来在终端里判断构图：
 * 球场铺满多少屏宽、顶部有没有一条对着空天的死区、触控层压住了画面的哪一段。
 *
 * 用法：
 *   node scripts/inspect-frame.mjs [单文件路径] [列数]
 *
 * 只读工具，不改任何东西。真正会卡红线的布局断言在 verify-single-html.mjs 与
 * src/render/camera.test.ts（后者用投影算球场四角的屏幕位置）。
 */
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
const FILE = process.argv[2] ?? '/Users/mizy/projects/badminton-web/dist/badminton-single.html'
const W = Number(process.argv[3] ?? 60)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
for (const device of [{ w: 360, h: 630 }]) {
  const page = await browser.newPage()
  await page.setViewport({ width: device.w, height: device.h, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load' })
  await page.waitForSelector('[data-ui="start-training"]')
  await page.tap('[data-ui="start-training"]')
  await page.waitForFunction(() => document.querySelector('[data-ui="hud"]')?.hidden === false)
  await new Promise(r => setTimeout(r, 1200))
  const map = await page.evaluate((cols) => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas')
      const rows = Math.round(cols * innerHeight / innerWidth / 2)
      const probe = document.createElement('canvas')
      probe.width = cols; probe.height = rows
      const c = probe.getContext('2d')
      c.drawImage(canvas, 0, 0, cols, rows)
      const data = c.getImageData(0, 0, cols, rows).data
      const ramp = ' .:-=+*#%@'
      const lines = []
      for (let y = 0; y < rows; y++) {
        let line = ''
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
          const lum = 0.299 * r + 0.587 * g + 0.114 * b
          // 球场草皮是饱和绿（0x2d5a27 打光后 g 明显高于 r/b）；背景与场外席都是暗色。
          const court = g > 50 && g > r + 20 && g > b + 16
          const apron = !court && g > r + 8 && g > b + 2 && g > 40
          line += court ? ramp[Math.min(ramp.length - 1, 5 + Math.floor(lum / 25))] : apron ? '~' : (lum > 150 ? 'o' : lum > 60 ? '.' : ' ')
        }
        lines.push(line)
      }
      resolve({ rows, cols, lines })
    }))
  }), W)
  console.log(`\n=== ${device.w}x${device.h} (${map.cols}x${map.rows}) ===`)
  console.log(map.lines.join('\n'))
  await page.close()
}
await browser.close()
