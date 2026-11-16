import { beforeEach, describe, expect, it } from 'vitest'
import { PaneWidths, clamp, LIBRARY, SHEETS } from './paneWidths.svelte'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  }
})

describe('PaneWidths', () => {
  it('starts at the defaults', () => {
    const w = new PaneWidths()
    expect([w.library, w.sheets]).toEqual([LIBRARY.fallback, SHEETS.fallback])
  })
  it('keeps widths within their limits', () => {
    expect(clamp(10, LIBRARY)).toBe(LIBRARY.min)
    expect(clamp(9999, SHEETS)).toBe(SHEETS.max)
  })
  it('remembers what was saved', () => {
    const a = new PaneWidths()
    a.set('library', 300)
    a.save()
    expect(new PaneWidths().library).toBe(300)
  })
  it('goes back to the default on reset', () => {
    const w = new PaneWidths()
    w.set('sheets', 400)
    w.reset('sheets')
    expect(w.sheets).toBe(SHEETS.fallback)
  })
})
