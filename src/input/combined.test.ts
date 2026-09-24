import { describe, expect, it, vi } from 'vitest'
import { combineInputAdapters } from './combined'
import type { InputAdapter, InputEvent } from './types'

function fakeAdapter() {
  const connect = vi.fn()
  const disconnect = vi.fn()
  return { adapter: { connect, disconnect } satisfies InputAdapter, connect, disconnect }
}

describe('combineInputAdapters', () => {
  it('forwards the same listener to every adapter and disconnects all of them', () => {
    const keyboard = fakeAdapter()
    const touch = fakeAdapter()
    const combined = combineInputAdapters([keyboard.adapter, touch.adapter])
    const listener = (_event: InputEvent) => {}

    combined.connect(listener)
    expect(keyboard.connect).toHaveBeenCalledWith(listener)
    expect(touch.connect).toHaveBeenCalledWith(listener)

    combined.disconnect()
    expect(keyboard.disconnect).toHaveBeenCalledOnce()
    expect(touch.disconnect).toHaveBeenCalledOnce()
  })

  it('is idempotent so pause / resume does not double-register adapters', () => {
    const keyboard = fakeAdapter()
    const combined = combineInputAdapters([keyboard.adapter])

    combined.connect(() => {})
    combined.connect(() => {})
    expect(keyboard.connect).toHaveBeenCalledOnce()

    combined.disconnect()
    combined.disconnect()
    expect(keyboard.disconnect).toHaveBeenCalledOnce()
  })
})
