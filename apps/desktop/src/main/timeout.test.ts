import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './timeout'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('returns the result when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'slow')).resolves.toBe(7)
  })

  it('rejects with the message when the work hangs', async () => {
    const hung = new Promise<number>(() => {})
    const result = withTimeout(hung, 1000, 'took too long')
    const assertion = expect(result).rejects.toThrow('took too long')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('passes the work’s own error through and leaves no timer behind', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'slow')).rejects.toThrow('boom')
    expect(vi.getTimerCount()).toBe(0)
  })
})
