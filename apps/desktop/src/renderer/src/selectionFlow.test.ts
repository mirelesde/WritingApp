import { describe, expect, it, vi } from 'vitest'
import type { OpResult } from '../../preload/api'
import { SelectionFlow, type SelectionHost } from './selectionFlow'
import { SelectionState } from './selectionState.svelte'
import type { SheetRun } from './sheetRun.svelte'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<SelectionHost> = {}, openPath: string | null = null) {
  const sel = new SelectionState()
  const run = {
    open: openPath ? { parts: [{ path: 'a' }, { path: 'b' }] } : null,
    isOpen: vi.fn((p: string) => p === openPath),
    load: vi.fn(async () => undefined),
    clear: vi.fn()
  }
  const api = { syncSheetNames: vi.fn(async () => ({ moved: [], library: {} }) as unknown as OpResult) }
  const host = {
    settle: vi.fn(async () => undefined),
    visit: vi.fn(),
    wantFocus: vi.fn(),
    focusEditor: vi.fn(),
    focusAt: vi.fn(),
    scrollToPart: vi.fn(async () => undefined),
    reveal: vi.fn(async () => undefined),
    manual: () => false,
    hasUnsaved: () => false,
    apply: vi.fn(async () => undefined),
    listPaths: () => ['a', 'b', 'c', 'd'],
    keywordMode: () => false,
    ...over
  }
  return { sel, run, api, host, flow: new SelectionFlow(api, sel, run as unknown as SheetRun, host) }
}
const plain = { shiftKey: false, metaKey: false, ctrlKey: false }

describe('SelectionFlow', () => {
  it('loads the sheet when exactly one is selected, and records the visit', async () => {
    const t = setup()
    await t.flow.setSelection(['a'], 'a', true)
    expect([t.sel.paths, t.sel.cursor]).toEqual([['a'], 'a'])
    expect(t.host.visit).toHaveBeenCalledWith('a')
    expect(t.host.wantFocus).toHaveBeenCalledWith(true)
    expect(t.run.load).toHaveBeenCalledWith('a')
  })

  it('focuses a sheet already open instead of reloading it', async () => {
    const t = setup({}, 'a')
    await t.flow.setSelection(['a'], 'a', true)
    expect(t.run.load).not.toHaveBeenCalled()
    expect(t.host.focusEditor).toHaveBeenCalledWith('a')
  })

  it('shows nothing for several sheets', async () => {
    const t = setup()
    await t.flow.setSelection(['a', 'b'], 'b')
    expect(t.run.clear).toHaveBeenCalled()
  })

  it('renames the sheets just left, unless saving is manual with unsaved text', async () => {
    const t = setup()
    t.sel.paths = ['x']
    await t.flow.setSelection(['a'], 'a')
    expect(t.api.syncSheetNames).toHaveBeenCalledWith(['x'])
    const m = setup({ manual: () => true, hasUnsaved: () => true })
    m.sel.paths = ['x']
    await m.flow.setSelection(['a'], 'a')
    expect(m.api.syncSheetNames).not.toHaveBeenCalled()
  })

  it('follows a rename that moved sheets, and ignores a failure', async () => {
    const t = setup()
    t.sel.paths = ['x']
    t.api.syncSheetNames.mockResolvedValueOnce({ moved: [['x', 'y']] } as unknown as OpResult)
    await t.flow.renameToMatchTitles(['x'])
    expect(t.host.apply).toHaveBeenCalled()
    t.api.syncSheetNames.mockRejectedValueOnce(new Error('no'))
    await expect(t.flow.renameToMatchTitles(['x'])).resolves.toBeUndefined()
  })

  it('lets the cursor move into a neighbour in the run', () => {
    const t = setup({}, 'a')
    expect(t.flow.crossEdge('a', 'forward')).toBe(true)
    expect(t.host.focusAt).toHaveBeenCalledWith('b', 'start')
    expect(t.flow.crossEdge('a', 'back')).toBe(false)
    t.flow.focusedPart('b')
    expect(t.sel.only).toBe('b')
    expect(t.host.visit).toHaveBeenCalledWith('b')
  })

  it('selects by click, shift-click ranges, and toggling with the command key', async () => {
    const t = setup()
    await t.flow.clickSheet('b', plain)
    expect(t.sel.paths).toEqual(['b'])
    await t.flow.clickSheet('d', { ...plain, shiftKey: true })
    expect(t.sel.paths).toEqual(['b', 'c', 'd'])
    await t.flow.clickSheet('c', { ...plain, metaKey: true })
    expect(t.sel.paths).toEqual(['b', 'd'])
  })

  it('only reveals a sheet clicked while listing keyword matches', async () => {
    const t = setup({ keywordMode: () => true })
    await t.flow.clickSheet('c', plain)
    expect(t.host.reveal).toHaveBeenCalledWith('c')
    expect(t.sel.paths).toEqual([])
  })
})
