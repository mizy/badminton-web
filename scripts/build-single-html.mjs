/**
 * 把 dist/ 打成一个自包含单文件 HTML（JS/CSS 全部内联），方便丢到手机/聊天里直接玩。
 *
 * 用法：
 *   node scripts/build-single-html.mjs [--skip-build] [--out <path>]
 *
 * 行为：
 *   1. 默认先跑 `npx vite build`（--skip-build 则复用现有 dist/）
 *   2. 读 dist/index.html，把 <script src="/assets/*.js"> 与外链 CSS 换成内联内容
 *   3. 断言：内联后 HTML 里不再出现 /assets/ 引用；JS 里不含 `</script`
 *   4. 写单文件并打印 JSON manifest（路径、字节数、内联了几段）
 *
 * 注意：单文件里 Service Worker 注册会失败（file:// 或 404），源码已 catch 成 console.warn，
 * 不影响游玩；离线缓存只有多文件部署版本才有。
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_BUILD = process.argv.includes('--skip-build')
const OUT = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : path.join(ROOT, 'dist', 'badminton-single.html')

const DIST = path.join(ROOT, 'dist')
assert(existsSync(path.join(DIST, 'index.html')), `dist/ 缺少 index.html：请先跑一次 vite build`)
if (!SKIP_BUILD) {
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
}

const distHtmlPath = path.join(DIST, 'index.html')
let html = readFileSync(distHtmlPath, 'utf8')
const inlined = { js: 0, css: 0 }

html = html.replace(/<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/g, (_match, src) => {
  const file = resolveDistAsset(src)
  const code = readFileSync(file, 'utf8')
  assert(!code.includes('</script'), `内联 JS 含 </script，无法安全内联：${src}`)
  inlined.js += 1
  return `<script type="module">\n${code}\n</script>`
})

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g, (_match, href) => {
  const file = resolveDistAsset(href)
  inlined.css += 1
  return `<style>\n${readFileSync(file, 'utf8')}\n</style>`
})

assert(inlined.js === 1, `期望内联 1 段 JS，实际 ${inlined.js}`)
assert(inlined.css === 1, `期望内联 1 段 CSS，实际 ${inlined.css}`)
assert(!/["'(]\/assets\//.test(html), '单文件里仍存在 /assets/ 外链引用，说明有资源没被内联')

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(JSON.stringify({
  out: OUT,
  bytes: Buffer.byteLength(html),
  inlined,
  source: { html: distHtmlPath },
}, null, 2))

function resolveDistAsset(ref) {
  const rel = ref.startsWith('/') ? ref.slice(1) : ref.replace(/^\.\//, '')
  const file = path.join(DIST, rel)
  assert(existsSync(file), `dist 里找不到被引用的资源：${ref}`)
  return file
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[build-single-html] ${message}`)
    process.exit(1)
  }
}
