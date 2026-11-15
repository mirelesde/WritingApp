import { describe, expect, it } from 'vitest'
import { MAX_RELOADS, RELOAD_WINDOW_MS, shouldReload } from './crash'

describe('shouldReload', () => {
  it('reloads the first few crashes, then stops', () => {
    const history: number[] = []
    const results = Array.from({ length: MAX_RELOADS + 1 }, (_, i) => shouldReload(history, 1000 + i))
    expect(results).toEqual([true, true, true, false])
  })
  it('forgets crashes older than the window', () => {
    const history: number[] = []
    for (let i = 0; i < MAX_RELOADS + 1; i++) shouldReload(history, i)
    expect(shouldReload(history, RELOAD_WINDOW_MS + 10_000)).toBe(true)
  })
})
