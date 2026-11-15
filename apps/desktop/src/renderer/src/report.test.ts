import { afterEach, describe, expect, it, vi } from 'vitest'
import { report } from './report'

afterEach(() => vi.unstubAllGlobals())

describe('report', () => {
  it('sends the message and the error stack to the log', () => {
    const logError = vi.fn(async () => undefined)
    vi.stubGlobal('window', { api: { logError } })
    report('saving a sheet', new Error('disk full'))
    expect(logError).toHaveBeenCalledWith('saving a sheet', expect.stringContaining('disk full'))
  })

  it('accepts anything that was thrown', () => {
    const logError = vi.fn(async () => undefined)
    vi.stubGlobal('window', { api: { logError } })
    report('x', 'plain text')
    expect(logError).toHaveBeenCalledWith('x', 'plain text')
  })

  it('does nothing without a bridge, and never throws', () => {
    expect(() => report('x', new Error('e'))).not.toThrow()
    vi.stubGlobal('window', { api: { logError: () => { throw new Error('bridge down') } } })
    expect(() => report('x', 'e')).not.toThrow()
  })
})
