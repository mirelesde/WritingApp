import { describe, expect, it, vi } from 'vitest'
import { RecoveryFlow, type RecoveryHost } from './recoveryFlow.svelte'
import type { RecoveredSheet } from '../../preload/api'

const sheet = (name: string, missing = false): RecoveredSheet =>
  ({ path: `/L/${name}.md`, text: `text ${name}`, disk: 'old', savedAt: 1, missing }) as RecoveredSheet

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(found: RecoveredSheet[]) {
  const api = {
    journalPending: vi.fn(async () => found),
    journalClear: vi.fn(async () => undefined),
    recreateSheet: vi.fn(async (path: string) => path.replace('.md', ' (restored).md'))
  }
  const host = {
    flush: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    showText: vi.fn(),
    trust: vi.fn(),
    info: vi.fn(),
    fail: vi.fn()
  } satisfies RecoveryHost
  return { api, host, flow: new RecoveryFlow(api as never, host) }
}

describe('RecoveryFlow', () => {
  it('lists what a crash left and counts it', async () => {
    const { flow } = setup([sheet('A'), sheet('B')])
    await flow.check()
    expect(flow.total).toBe(2)
    expect(flow.current?.path).toBe('/L/A.md')
  })

  it('shows nothing when the journal cannot be read', async () => {
    const { api, flow } = setup([])
    api.journalPending.mockRejectedValue(new Error('no'))
    await flow.check()
    expect(flow.current).toBeUndefined()
  })

  it('restores: saves the text, shows it, clears the journal and moves on', async () => {
    const { api, host, flow } = setup([sheet('A'), sheet('B')])
    await flow.check()
    await flow.finish(true)
    expect(host.flush).toHaveBeenCalled()
    expect(host.save).toHaveBeenCalledWith('/L/A.md', 'text A')
    expect(host.showText).toHaveBeenCalledWith('/L/A.md', 'text A')
    expect(api.journalClear).toHaveBeenCalledWith('/L/A.md')
    expect(flow.current?.path).toBe('/L/B.md')
  })

  it('discards without touching the sheet', async () => {
    const { api, host, flow } = setup([sheet('A')])
    await flow.check()
    await flow.finish(false)
    expect(host.save).not.toHaveBeenCalled()
    expect(api.journalClear).toHaveBeenCalledWith('/L/A.md')
    expect(flow.current).toBeUndefined()
  })

  it('recreates a sheet that is gone', async () => {
    const { api, host, flow } = setup([sheet('A', true)])
    await flow.check()
    await flow.finish(true)
    expect(api.recreateSheet).toHaveBeenCalledWith('/L/A.md', 'text A')
    expect(host.trust).toHaveBeenCalledWith('/L/A (restored).md', 'text A')
    expect(host.info).toHaveBeenCalledWith('Restored the text as “A (restored).md”')
  })

  it('stays on the sheet and reports when saving fails', async () => {
    const { api, host, flow } = setup([sheet('A')])
    host.save.mockRejectedValue(new Error('disk'))
    await flow.check()
    await flow.finish(true)
    expect(host.fail).toHaveBeenCalled()
    expect(api.journalClear).not.toHaveBeenCalled()
    expect(flow.current?.path).toBe('/L/A.md')
  })
})
