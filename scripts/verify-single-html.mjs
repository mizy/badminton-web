/**
 * 验证单文件 HTML 在手机参数下真的能玩：用 Chrome 设备模拟（飞书预览视口 / iPhone 竖屏横屏 / iPad）
 * 打开本地 file:// 单文件，检查无 JS 报错、canvas 有渲染、触屏层可见，并实测三个控件：
 *   摇杆拖动有反馈；六个固定球路键各自短按即出招（点按力量）、按住拖动给连续落点、
 *   等待发球时短按直接发出；暂停键能进暂停对话框。
 * 同时断言布局：顶部常驻 HUD 只占薄薄一条（真机上曾经吃掉 47% 屏高）、触控件互不重叠、不溢出视口。
 * 截图写到 --shots 目录，逐台比对。
 *
 * 用法：
 *   node scripts/verify-single-html.mjs [--file dist/badminton-single.html] [--shots /tmp/cah/badminton-single]
 *
 * 局限：这是 Chrome 设备模拟（DPR / 视口 / 触屏事件），不等于真机 Safari / 微信 / 飞书内置浏览器。
 */

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.resolve(ROOT, argValue('--file') ?? 'dist/badminton-single.html')
const SHOTS = path.resolve(argValue('--shots') ?? '/tmp/cah/badminton-single')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const KEYBOARD_LETTERS = /\b[JKLUIO]\b/
/** 六个固定球路键：短按每个键都必须真的把这个球路打进 reducer（selectedShot 跟着变）。 */
const SHOT_PROBES = ['CLEAR', 'DROP', 'SMASH', 'DRIVE', 'NET_DROP', 'LIFT']
/** 拖动单位（像素）：与 input/touchControls.ts 的 AIM_DRAG_UNIT 一致；拖 0.9 格给连续落点。 */
const AIM_DRAG_UNIT = 72
/** 短按出招的固定力量（与 input/touchControls.ts 的 TAP_CHARGE 一致）。 */
const TAP_CHARGE = 0.65
const LATERAL_PROBE = 0.9
/** 顶部常驻 HUD（比分胶囊 + 暂停键）最多允许占多少屏高。 */
const MAX_RESIDENT_HUD_RATIO = 0.17

const DEVICES = [
  // feishu-viewer-portrait 是飞书内置预览实测的可用视口（1080x2352 截图减去顶部工具栏）。
  { name: 'feishu-viewer-portrait', width: 360, height: 630, dpr: 3 },
  { name: 'android-small-portrait', width: 360, height: 560, dpr: 3 },
  { name: 'iphone14pro-portrait', width: 393, height: 852, dpr: 3 },
  { name: 'iphone14pro-landscape', width: 852, height: 393, dpr: 3 },
  { name: 'iphonese-portrait', width: 375, height: 667, dpr: 2 },
  { name: 'ipad-portrait', width: 768, height: 1024, dpr: 2 },
]

assert(existsSync(FILE), `单文件不存在：${FILE}`)
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const results = []
try {
  for (const device of DEVICES) {
    results.push(await checkDevice(device))
  }
} finally {
  await browser.close()
}

for (const result of results) {
  assert.deepEqual(result.errors, [], `${result.device} 有报错：${result.errors.join(' | ')}`)
  assert.deepEqual(result.overflow, [], `${result.device} 有元素溢出视口：${JSON.stringify(result.overflow)}`)
  assert.deepEqual(result.overlaps, [], `${result.device} 触控元素互相重叠：${JSON.stringify(result.overlaps)}`)
  assert.deepEqual(result.panelOverlaps, [], `${result.device} HUD 面板互相重叠：${JSON.stringify(result.panelOverlaps)}`)
  assert.ok(result.canvasColors > 1, `${result.device} canvas 疑似空白`)
  assert.equal(result.touchControlsVisible, 1, `${result.device} 触屏操作层不可见`)
  // 3D 画面是主角：顶部常驻 HUD 必须只占薄薄一条。
  assert.ok(
    result.residentHudRatio <= MAX_RESIDENT_HUD_RATIO,
    `${result.device} 顶部常驻 HUD 占屏高 ${(result.residentHudRatio * 100).toFixed(1)}%（上限 ${MAX_RESIDENT_HUD_RATIO * 100}%）`,
  )
  assert.ok(result.stickMoved, `${result.device} 摇杆拖动没有反馈`)
  // 球路键：六个键短按都要真的把球路送进 reducer（按住时键点亮，松开后选中球路跟着变）。
  for (const probe of result.shotProbes) {
    assert.equal(probe.selectedShot, probe.expected, `${result.device} 短按「${probe.expected}」没有选中该球路：${probe.selectedShot}`)
    assert.equal(probe.heldShot, probe.expected, `${result.device} 短按「${probe.expected}」时键没有点亮：${probe.heldShot}`)
  }
  // 点按出招用的是固定点按力量，不是"按得越短越软"。
  assert.equal(result.tapCharge.label, `力量 ${Math.round(TAP_CHARGE * 100)}%`, `${result.device} 点按出招的力量不对：${result.tapCharge.label}`)
  const { right, left } = result.lateral
  assert.ok(right.held, `${result.device} 横向拖动的按住没有被识别（没有进蓄力）`)
  assert.ok(left.held, `${result.device} 横向拖动的按住没有被识别（没有进蓄力）`)
  assert.ok(right.held.lateral > 0.5 && right.held.lateral < 1, `${result.device} 右拖没有给出连续落点（${right.held.lateral}）`)
  assert.ok(left.held.lateral < -0.5 && left.held.lateral > -1, `${result.device} 左拖没有给出连续落点（${left.held.lateral}）`)
  assert.equal(right.held.depth, 1, `${result.device} 往上拖到顶后纵深没有封顶（${right.held.depth}）`)
  assert.match(right.held.readout, /右路 \d+%/, `${result.device} 右拖读数不对：${right.held.readout}`)
  assert.match(left.held.readout, /左路 \d+%/, `${result.device} 左拖读数不对：${left.held.readout}`)
  assert.equal(right.held.readoutActive, 'true', `${result.device} 按住拖动时落点读数没有亮起`)
  assert.equal(right.held.heldShot, 'DROP', `${result.device} 拖动时按住的键不对：${right.held.heldShot}`)
  const charge = result.charge
  assert.ok(charge.held, `${result.device} 回合中长按球路键没有被识别（没有进蓄力）`)
  assert.equal(charge.down.active, 'true', `${result.device} 按下球路键时力量条没有点亮`)
  assert.match(charge.held.label, /^蓄力 \d+%$/, `${result.device} 蓄力文案不对：${charge.held.label}`)
  assert.ok(charge.held.scaleX > 0.1 && charge.held.scaleX <= 1, `${result.device} 力量条填充比例异常：${charge.held.scaleX}`)
  assert.equal(charge.released.active, 'true', `${result.device} 出拍后力量条没有定格`)
  assert.match(charge.released.label, /^力量 \d+%$/, `${result.device} 力量定格文案不对：${charge.released.label}`)
  assert.equal(result.chargeIdle.active, 'false', `${result.device} 挥拍结束后力量条没有熄灭`)
  // 长按蓄力中拖动：球路保持按下的那个键（吊球），落点跟着走（SWING_SELECT 真的进了 reducer）。
  assert.equal(charge.held.heldShot, 'DROP', `${result.device} 长按「吊球」时按住的键不对：${charge.held.heldShot}`)
  assert.equal(charge.held.selectedShot, 'DROP', `${result.device} 拖动把球路改掉了：${charge.held.selectedShot}`)
  // 等待发球时短按球路键：只记球路、不蓄力，发球在松手那一刻发出。
  assert.equal(result.tapPanels.heldShot, 'NET_DROP', `${result.device} 轻点球路键时按住的键不对：${result.tapPanels.heldShot}`)
  assert.equal(result.tapPanels.active, 'false', `${result.device} 等待发球时按下就进了蓄力`)
  assert.ok(result.serveFired, `${result.device} 触屏发球没有改变状态行（仍是「${result.statusBefore}」）`)
  assert.ok(!KEYBOARD_LETTERS.test(result.statusBefore), `${result.device} 触屏状态行出现键盘字母：${result.statusBefore}`)
  assert.ok(!KEYBOARD_LETTERS.test(result.statusAfter), `${result.device} 触屏状态行出现键盘字母：${result.statusAfter}`)
  // 声音 / 预测 / 录像搬进暂停对话框，HUD 上只剩暂停键。
  assert.equal(result.idleAiming, 0, `${result.device} 松开后还有球路键停在按住状态（${result.idleAiming} 个）`)
  assert.equal(result.pauseOpened, true, `${result.device} 点暂停键没有进入暂停对话框`)
  assert.equal(result.pauseSettings, 3, `${result.device} 暂停对话框里少了开关（${result.pauseSettings} 个）`)
}

console.log(JSON.stringify({
  file: FILE,
  bytes: statSync(FILE).size,
  shotsDir: SHOTS,
  devices: results,
}, null, 2))

async function checkDevice(device) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => errors.push(`requestfailed ${request.url()}`))
  await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: device.dpr, isMobile: true, hasTouch: true })
  await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load' })
  await page.waitForSelector('[data-ui="start-training"]', { timeout: 10000 })
  assert.equal(await page.$$eval('script[src]', nodes => nodes.length), 0, '单文件里仍有外链 script')
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-menu.png`) })

  await page.tap('[data-ui="start-training"]')
  await page.waitForFunction(() => document.querySelector('[data-ui="hud"]')?.hidden === false, { timeout: 10000 })
  // 触屏工具条（暂停 / 菜单 / 声音 / 预测 / 录像）整体退场，只有暂停键留在 HUD 上。
  assert.equal(await page.$eval('.play-tools', element => getComputedStyle(element).display), 'none', '触屏下 .play-tools 没有退场')
  await new Promise(resolve => setTimeout(resolve, 900))
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-play.png`) })

  const layout = await readLayout(page)
  // WebGL 缓冲在 rAF 之外可能已被清空，必须在帧回调里取样。
  const canvasColors = await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const probe = document.createElement('canvas')
      probe.width = 64
      probe.height = 64
      const context = probe.getContext('2d')
      context.drawImage(document.querySelector('canvas'), 0, 0, 64, 64)
      const data = context.getImageData(0, 0, 64, 64).data
      const colors = new Set()
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
      resolve(colors.size)
    }))
  }))

  const statusBefore = await page.$eval('[data-ui="status-title"]', element => element.textContent)
  const stickBox = await (await page.$('[data-touch="stick"]')).boundingBox()
  const knobBefore = await page.$eval('[data-touch="stick-knob"]', element => getComputedStyle(element).transform)
  await page.mouse.move(stickBox.x + stickBox.width / 2, stickBox.y + stickBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(stickBox.x + stickBox.width / 2, stickBox.y + stickBox.height * 0.2, { steps: 5 })
  const knobAfter = await page.$eval('[data-touch="stick-knob"]', element => getComputedStyle(element).transform)
  await page.mouse.up()

  // 固定球路键：六个键都必须排得下、点得到。
  const shotBox = async shot => {
    const box = await (await page.$(`[data-touch="shot"][data-shot="${shot}"]`)).boundingBox()
    assert.ok(box, `球路键 ${shot} 不存在`)
    return box
  }
  const shotCenter = async shot => {
    const box = await shotBox(shot)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const readPanels = () => page.evaluate(() => {
    const panel = document.querySelector('[data-ui="charge"]')
    const fill = document.querySelector('[data-ui="charge-fill"]')
    const selected = document.querySelector('[data-ui="shots"] li[data-selected="true"]')
    const held = document.querySelector('[data-touch="shot"][data-aiming="true"]')
    const readout = document.querySelector('[data-ui="touch-aim-readout"]')
    return {
      active: panel.dataset.active,
      label: panel.querySelector('[data-ui="charge-label"]').textContent,
      scaleX: new DOMMatrixReadOnly(getComputedStyle(fill).transform).a,
      heldShot: held?.dataset.shot ?? 'none',
      lateral: Number(held?.dataset.lateral ?? 0),
      depth: Number(held?.dataset.depth ?? 0),
      readoutActive: readout.dataset.active,
      readout: readout.textContent,
      selectedShot: selected?.getAttribute('data-shot') ?? 'none',
    }
  })

  const statusTitle = () => page.$eval('[data-ui="status-title"]', element => element.textContent ?? '')
  // 出招只在"没在挥拍恢复中、也不在上一分的结算里"才进 reducer：每次按键前等这两个状态过去。
  const waitReady = async () => {
    for (let i = 0; i < 40; i++) {
      const panels = await readPanels()
      const status = await statusTitle()
      if (panels.active === 'false' && !status.startsWith('上一分')) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  // 蓄力与拖动只在回合里成立：状态行还在"发球区"就自己把球发出去，然后立刻回到回合。
  const waitPlaying = async () => {
    const tapShot = async shot => {
      const center = await shotCenter(shot)
      await page.mouse.move(center.x, center.y)
      await page.mouse.down()
      await page.mouse.up()
    }
    for (let i = 0; i < 60; i++) {
      const status = await statusTitle()
      if (status.includes('短按球路键出招')) return true
      if (status.includes('发球区')) await tapShot('CLEAR')
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    return false
  }

  // 1) 等待发球：短按「放网」键即发出，并且按住期间不蓄力（发球在松手那一刻发出）。
  const netDrop = await shotCenter('NET_DROP')
  await page.mouse.move(netDrop.x, netDrop.y)
  await page.mouse.down()
  const tapPanels = await readPanels()
  await page.mouse.up()
  let statusAfter = statusBefore
  for (let i = 0; i < 40 && statusAfter === statusBefore; i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
    statusAfter = await page.$eval('[data-ui="status-title"]', element => element.textContent)
  }
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-after-serve.png`) })

  // 一次「按住」：只有真的进了蓄力（SWING_START 生效）才算这次按下有效，否则等下一次回合重试。
  // 采样点必须落在回合里——发球等待期按住是"选球路、等松手发球"，不会蓄力（那由步骤 1 单独验）。
  const holdShot = async (shot, { dx = 0, dy = 0, holdMs = 250, drag = false } = {}) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await waitPlaying()
      const center = await shotCenter(shot)
      await page.mouse.move(center.x, center.y)
      await page.mouse.down()
      const down = await readPanels()
      if (down.active === 'true') {
        if (drag) {
          await page.mouse.move(center.x + dx, center.y + dy, { steps: 4 })
          await new Promise(resolve => setTimeout(resolve, 220))
        } else {
          await new Promise(resolve => setTimeout(resolve, holdMs))
        }
        const held = await readPanels()
        await page.mouse.up()
        await new Promise(resolve => setTimeout(resolve, 200))
        // 蓄力中途撞上得分结算时，positionForService 会重建球员、把挥拍打回 ready：这次样本不算，重来。
        if (held.active === 'true') return { down, held, released: await readPanels() }
      } else {
        await page.mouse.up()
      }
      await new Promise(resolve => setTimeout(resolve, 800))
    }
    return { down: null, held: null, released: null }
  }

  // 回合中短按一次：这一下必须真的出拍，力量定格在点按力量（TAP_CHARGE）而不是最软的一拍。
  let tapCharge = null
  for (let attempt = 0; attempt < 3 && tapCharge?.label !== `力量 ${Math.round(TAP_CHARGE * 100)}%`; attempt++) {
    await waitPlaying()
    const center = await shotCenter('CLEAR')
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.up()
    await new Promise(resolve => setTimeout(resolve, 200))
    tapCharge = await readPanels()
    if (tapCharge.label !== `力量 ${Math.round(TAP_CHARGE * 100)}%`) await new Promise(resolve => setTimeout(resolve, 700))
  }
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-tap-charge.png`) })

  // 2) 六个键各短按一次：一键出招，球路真的进了 reducer（按住时键点亮）。
  const shotProbes = []
  for (const shot of SHOT_PROBES) {
    let held = null
    let released = null
    for (let attempt = 0; attempt < 3; attempt++) {
      await waitReady()
      const center = await shotCenter(shot)
      await page.mouse.move(center.x, center.y)
      await page.mouse.down()
      held = await readPanels()
      await page.mouse.up()
      await new Promise(resolve => setTimeout(resolve, 200))
      released = await readPanels()
      if (released.selectedShot === shot) break
      await new Promise(resolve => setTimeout(resolve, 900))
    }
    shotProbes.push({ expected: shot, heldShot: held.heldShot, selectedShot: released.selectedShot, label: released.label })
    await page.screenshot({ path: path.join(SHOTS, `${device.name}-shot-${shot}.png`) })
  }

  // 3) 回合中按住「吊球」并纵向拖：力量条点亮，球路保持吊球、落点跟着拖动连续变化。
  const charge = await holdShot('DROP', { dy: -AIM_DRAG_UNIT * 0.5, holdMs: 250 })
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-charge.png`) })
  await new Promise(resolve => setTimeout(resolve, 900))
  const chargeIdle = await readPanels()

  // 4) 另一次按住里左右横拖：落点必须是连续值（不是三档吸附），读数与拖距一起变。
  const lateralRight = await holdShot('DROP', { drag: true, dx: LATERAL_PROBE * AIM_DRAG_UNIT, dy: -AIM_DRAG_UNIT })
  const lateralLeft = await holdShot('DROP', { drag: true, dx: -LATERAL_PROBE * AIM_DRAG_UNIT, dy: -AIM_DRAG_UNIT })
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-aim-lateral.png`) })
  const idleAiming = await page.evaluate(() => document.querySelectorAll('[data-touch="shot"][data-aiming="true"]').length)

  // 暂停键进暂停对话框：声音 / 预测 / 录像三个开关搬到了这里。
  await page.tap('[data-touch="action"][data-action="pause"]')
  await new Promise(resolve => setTimeout(resolve, 300))
  const pauseOpened = await page.$eval('[data-ui="break-dialog"]', element => !element.hidden)
  const pauseSettings = await page.$$eval('[data-ui="pause-settings"] button', nodes => nodes.length)
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-paused.png`) })
  if (pauseOpened) {
    await page.tap('[data-ui="resume"]')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  await page.screenshot({ path: path.join(SHOTS, `${device.name}-resume.png`) })
  await page.close()

  return {
    device: device.name,
    viewport: `${device.width}x${device.height}@${device.dpr}`,
    errors,
    statusBefore,
    statusAfter,
    serveFired: statusAfter !== statusBefore,
    stickMoved: knobBefore !== knobAfter,
    shotProbes,
    tapCharge,
    lateral: { right: lateralRight, left: lateralLeft },
    idleAiming,
    tapPanels: { heldShot: tapPanels.heldShot, active: tapPanels.active },
    charge,
    chargeIdle,
    canvasColors,
    pauseOpened,
    pauseSettings,
    touchControlsVisible: layout.touchControlsVisible,
    residentHudRatio: layout.residentHudRatio,
    overflow: layout.overflow,
    overlaps: layout.overlaps,
    panelOverlaps: layout.panelOverlaps,
    smallTargets: layout.small,
  }
}

/** 布局探针：溢出 / 命中测试 / 面板重叠 / 顶部常驻 HUD 占屏高。 */
async function readLayout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const overflow = []
    const small = []
    const interactive = []
    for (const element of document.querySelectorAll('[data-ui]')) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || element.hidden) continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const name = element.getAttribute('data-ui')
      if (rect.left < -0.5 || rect.top < -0.5 || rect.right > vw + 0.5 || rect.bottom > vh + 0.5) {
        overflow.push({ name, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
      }
    }
    for (const element of document.querySelectorAll('button, .play-touch-stick, .play-touch-shot')) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      interactive.push({ element, name: (element.getAttribute('data-ui') ?? element.dataset.action ?? element.className ?? '?').trim().slice(0, 12), rect })
      if (rect.width < 40 || rect.height < 40) small.push(`${element.textContent?.trim().slice(0, 6)} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
    }
    // 圆形控件（摇杆 / 球路键 / 圆键）的外接矩形必然搭角，矩形相交不等于真重叠：
    // 改成真实命中测试——每个控件中心与四个斜向采样点都必须打得中自己。
    const overlaps = new Set()
    for (const item of interactive) {
      const { x, y, width, height } = item.rect
      for (const [fx, fy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const hit = document.elementFromPoint(x + width / 2 + fx * width, y + height / 2 + fy * height)
        const owner = hit?.closest('button, .play-touch-stick, .play-touch-shot') ?? null
        if (owner !== item.element) overlaps.add(`${item.name}|${owner?.dataset.action ?? owner?.dataset.ui ?? owner?.className ?? 'none'}`)
      }
    }
    const touchLayer = [...document.querySelectorAll('[data-ui="touch"]')].filter(node => getComputedStyle(node).display !== 'none')
    // HUD 面板（比分胶囊 / 状态 toast）互不重叠。
    const panels = ['.play-scoreboard', '#play-console']
      .map(selector => ({ selector, element: document.querySelector(selector) }))
      .filter(panel => panel.element && getComputedStyle(panel.element).display !== 'none')
      .map(panel => ({ name: panel.selector, rect: panel.element.getBoundingClientRect() }))
    const panelOverlaps = []
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i].rect
        const b = panels[j].rect
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          panelOverlaps.push(`${panels[i].name}|${panels[j].name}`)
        }
      }
    }
    // 常驻 HUD = 比分胶囊与暂停键；状态行是会淡出的漂浮 toast，不算常驻。
    const resident = ['.play-scoreboard', '.play-touch-pause']
      .map(selector => document.querySelector(selector))
      .filter(node => node && getComputedStyle(node).display !== 'none')
      .map(node => node.getBoundingClientRect().bottom)
    const residentHudRatio = resident.length === 0 ? 0 : Math.max(...resident) / vh
    return { overflow, small, overlaps: [...overlaps], panelOverlaps, touchControlsVisible: touchLayer.length, residentHudRatio }
  })
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
