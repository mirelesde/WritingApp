import { describe, expect, it, vi } from 'vitest'
import type { UnsavedAnswer } from './unsavedPrompt.svelte'
import { UnsavedResolver, type ResolverHost } from './unsavedResolver'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<ResolverHost> = {}, answer: UnsavedAnswer = 'save') {
  const discard = vi.fn()
  const host = {
    manual: () => true,
    dirty: () => ['a', 'b'],
    name: (p: string) => p.toUpperCase(),
    ask: vi.fn(async () => answer),
    discard,
    flush: vi.fn(async () => undefined),
    unsaved: () => [] as string[],
    warn: vi.fn(),
    ...over
  }
  return { host, discard, r: new UnsavedResolver(host) }
}

describe('UnsavedResolver', () => {
  it('does not ask when saving is automatic or nothing is unsaved', async () => {
    const auto = setup({ manual: () => false })
    expect(await auto.r.resolve(['a'], 'tab')).toBe(true)
    const clean = setup({ dirty: () => [] })
    expect(await clean.r.resolve(['a'], 'tab')).toBe(true)
    expect(auto.host.ask).not.toHaveBeenCalled()
    expect(clean.host.ask).not.toHaveBeenCalled()
  })

  it('asks about the unsaved sheets by title, and saves them', async () => {
    const t = setup()
    expect(await t.r.resolve(['a', 'x'], 'window')).toBe(true)
    expect(t.host.ask).toHaveBeenCalledWith(['A'], 'window')
    expect(t.host.flush).toHaveBeenCalledWith(['a'])
  })

  it('stops when the user cancels', async () => {
    const t = setup({}, 'cancel')
    expect(await t.r.resolve(['a'], 'tab')).toBe(false)
    expect(t.host.flush).not.toHaveBeenCalled()
    expect(t.discard).not.toHaveBeenCalled()
  })

  it('drops the text when told to discard', async () => {
    const t = setup({}, 'discard')
    expect(await t.r.resolve(['a', 'b'], 'library')).toBe(true)
    expect(t.discard.mock.calls).toEqual([['a'], ['b']])
    expect(t.host.flush).not.toHaveBeenCalled()
  })

  it('says so and stops when a save did not go through', async () => {
    const t = setup({ unsaved: () => ['a'] })
    expect(await t.r.resolve(['a'], 'tab')).toBe(false)
    expect(t.host.warn).toHaveBeenCalledWith('Could not save, so nothing was closed.')
  })

  it('flushes everything when automatic saving has nothing flagged', async () => {
    const t = setup({ manual: () => false, dirty: () => [] })
    await t.r.resolve(['a'], 'tab')
    expect(t.host.flush).toHaveBeenCalledWith(undefined)
  })
})
