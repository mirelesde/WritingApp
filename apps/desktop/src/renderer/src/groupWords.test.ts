import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupWords } from './groupWords.svelte'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('GroupWords', () => {
  it('counts after a pause', async () => {
    const api = { groupWords: vi.fn(async () => 42) }
    const w = new GroupWords(api)
    w.schedule('/L')
    expect(api.groupWords).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(api.groupWords).toHaveBeenCalledWith('/L')
    expect(w.total).toBe(42)
  })

  it('does not count when cancelled', async () => {
    const api = { groupWords: vi.fn(async () => 1) }
    const w = new GroupWords(api)
    w.schedule('/L')()
    await vi.advanceTimersByTimeAsync(500)
    expect(api.groupWords).not.toHaveBeenCalled()
    expect(w.total).toBeNull()
  })

  it('drops an answer that a newer count has overtaken', async () => {
    let first!: (n: number) => void
    const api = {
      groupWords: vi
        .fn<(p: string) => Promise<number>>()
        .mockImplementationOnce(() => new Promise((r) => (first = r)))
        .mockResolvedValueOnce(7)
    }
    const w = new GroupWords(api)
    w.schedule('/A')
    await vi.advanceTimersByTimeAsync(300)
    w.schedule('/B')
    await vi.advanceTimersByTimeAsync(300)
    expect(w.total).toBe(7)
    first(99)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.total).toBe(7)
  })

  it('keeps the old total when counting fails', async () => {
    const api = { groupWords: vi.fn(async () => Promise.reject(new Error('x'))) }
    const w = new GroupWords(api)
    w.total = 5
    w.schedule('/L')
    await vi.advanceTimersByTimeAsync(300)
    expect(w.total).toBe(5)
  })
})
