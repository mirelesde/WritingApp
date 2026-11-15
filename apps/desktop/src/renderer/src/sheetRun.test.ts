import { describe, expect, it, vi } from 'vitest'
import { SheetRun, type RunHost } from './sheetRun.svelte'

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(files: Record<string, string>, runs: Record<string, string[]> = {}, pending: Record<string, string> = {}) {
  const gates: Record<string, () => void> = {}
  const host = {
    readSheet: vi.fn(async (p: string) => {
      if (!(p in files)) throw new Error('missing')
      return files[p]!
    }),
    pathsOf: (p: string) => runs[p] ?? [p],
    trust: vi.fn(),
    pending: (p: string) => pending[p]
  } satisfies RunHost
  return { host, gates, run: new SheetRun(host) }
}

describe('SheetRun', () => {
  it('loads a sheet, trusting what the file holds', async () => {
    const { host, run } = setup({ '/a': 'text a' })
    await run.load('/a')
    expect(run.open).toEqual({ parts: [{ path: '/a', text: 'text a' }] })
    expect(host.trust).toHaveBeenCalledWith('/a', 'text a')
    expect(run.error).toBe('')
  })

  it('loads a whole glued run, joined for counting', async () => {
    const { run } = setup({ '/a': 'A', '/b': 'B' }, { '/a': ['/a', '/b'] })
    await run.load('/a')
    expect(run.open?.parts.map((p) => p.path)).toEqual(['/a', '/b'])
    expect(run.text).toBe('A\n\nB')
  })

  it('shows text waiting to be saved instead of the file', async () => {
    const { run } = setup({ '/a': 'on disk' }, {}, { '/a': 'unsaved' })
    await run.load('/a')
    expect(run.open?.parts[0]?.text).toBe('unsaved')
    expect(run.edits).toEqual({ '/a': 'unsaved' })
  })

  it('counts what was typed since loading', async () => {
    const { run } = setup({ '/a': 'old' })
    await run.load('/a')
    run.edits['/a'] = 'new text'
    expect(run.text).toBe('new text')
  })

  it('says so when a sheet cannot be read', async () => {
    const { run } = setup({})
    await run.load('/gone')
    expect(run.open).toBeNull()
    expect(run.error).toBe('This sheet could not be read.')
  })

  it('knows whether a path is part of what is shown', async () => {
    const { run } = setup({ '/a': 'A', '/b': 'B', '/c': 'C' }, { '/a': ['/a', '/b'], '/b': ['/a', '/b'] })
    expect(run.isOpen('/a')).toBe(false)
    await run.load('/a')
    expect(run.isOpen('/b')).toBe(true)
    expect(run.isOpen('/c')).toBe(false)
  })

  it('lets a later load win over one still under way', async () => {
    let release!: () => void
    const slow = new Promise<string>((r) => (release = () => r('slow')))
    const host = {
      readSheet: vi.fn((p: string) => (p === '/slow' ? slow : Promise.resolve('fast'))),
      pathsOf: (p: string) => [p],
      trust: vi.fn(),
      pending: () => undefined
    } satisfies RunHost
    const run = new SheetRun(host)
    const first = run.load('/slow')
    await run.load('/fast')
    release()
    await first
    expect(run.open?.parts[0]?.path).toBe('/fast')
  })

  it('abandons a load when cleared', async () => {
    let release!: () => void
    const slow = new Promise<string>((r) => (release = () => r('slow')))
    const run = new SheetRun({
      readSheet: () => slow,
      pathsOf: (p) => [p],
      trust: vi.fn(),
      pending: () => undefined
    })
    const pending = run.load('/a')
    run.clear()
    release()
    await pending
    expect(run.open).toBeNull()
  })
})
