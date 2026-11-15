import { describe, expect, it, vi } from 'vitest'
import type { LibraryInfo, OpResult } from '../../preload/api'
import { OpRunner } from './opRunner'
import { SelectionState } from './selectionState.svelte'
import type { SheetRun } from './sheetRun.svelte'

const lib = { tree: { kind: 'group', path: '/L', name: 'L', children: [{ kind: 'sheet', path: '/L/a', name: 'a' }] } } as unknown as LibraryInfo
const result = { library: lib, moved: [['/L/old', '/L/a']] } as unknown as OpResult

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(current: LibraryInfo | null = lib) {
  const sel = new SelectionState()
  const run = { open: null as unknown, isOpen: vi.fn(() => false), load: vi.fn(async () => undefined), clear: vi.fn() }
  const host = {
    flush: vi.fn(async () => undefined),
    library: () => current,
    setLibrary: vi.fn(),
    remap: vi.fn(),
    notice: vi.fn()
  }
  return { sel, run, host, ops: new OpRunner(sel, run as unknown as SheetRun, host) }
}

describe('OpRunner', () => {
  it('saves first, then applies the result and clears the notice', async () => {
    const t = setup()
    const op = vi.fn(async () => result)
    expect(await t.ops.runOp(op)).toBe(result)
    expect(t.host.flush.mock.invocationCallOrder[0]).toBeLessThan(op.mock.invocationCallOrder[0]!)
    expect(t.host.setLibrary).toHaveBeenCalledWith(lib)
    const change = t.host.remap.mock.calls[0]![0] as (p: string) => string
    expect(change('/L/old')).toBe('/L/a')
    expect(t.host.notice).toHaveBeenLastCalledWith('')
  })

  it('shows the error and returns nothing when the change fails', async () => {
    const t = setup()
    expect(await t.ops.runOp(async () => Promise.reject(new Error('disk full')))).toBeUndefined()
    expect(t.host.notice).toHaveBeenCalledWith(expect.stringContaining('disk full'))
    expect(t.host.setLibrary).not.toHaveBeenCalled()
  })

  it('opens the one selected sheet, reloading when told to', async () => {
    const t = setup()
    t.sel.paths = ['/L/a']
    await t.ops.refreshOpen(false)
    expect(t.run.load).toHaveBeenCalledWith('/L/a')
    t.run.isOpen.mockReturnValue(true)
    t.run.load.mockClear()
    await t.ops.refreshOpen(false)
    expect(t.run.load).not.toHaveBeenCalled()
    await t.ops.refreshOpen(true)
    expect(t.run.load).toHaveBeenCalled()
  })

  it('drops selected sheets that are gone, and clears the editor with no single sheet', async () => {
    const t = setup()
    t.sel.paths = ['/L/gone']
    t.run.open = {}
    await t.ops.refreshOpen(false)
    expect(t.sel.paths).toEqual([])
    expect(t.run.clear).toHaveBeenCalled()
  })
})
