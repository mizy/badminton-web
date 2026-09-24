/** 组合输入适配器 — 让同一会话同时接受键盘与触屏输入。
 *
 * 触屏设备并不代表没有键盘：触屏笔记本、平板外接键盘、带触摸能力的浏览器都很常见。
 * 组合器只负责把 connect / disconnect 原样转发；各适配器仍独立维护按键与手指状态。 */

import type { InputAdapter, InputListener } from './types'

export function combineInputAdapters(adapters: readonly InputAdapter[]): InputAdapter {
  let connected = false

  return {
    connect(nextListener: InputListener): void {
      if (connected) return
      connected = true
      for (const adapter of adapters) adapter.connect(nextListener)
    },
    disconnect(): void {
      if (!connected) return
      connected = false
      for (const adapter of adapters) adapter.disconnect()
    },
  }
}
