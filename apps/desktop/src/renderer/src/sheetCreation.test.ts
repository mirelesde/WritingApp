import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import type { OpResult } from '../../preload/api'
import { SelectionState } from './selectionState.svelte'
import { SheetCreation, type CreationHost } from './sheetCreation.svelte'

const sheet = (path: string): SheetNode => ({ kind: 'sheet', path, name: path }) as SheetNode
const parent = { kind: 'group', path: '/L/A', name: 'A', children: [sheet('/L/A/a'), sheet('/L/A/b')] } as GroupNode
const result = (over: Partial<OpResult> = {}): OpResult => ({ library: {}, moved: [], ...over }) as OpResult

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(group: GroupNode | null = parent) {
  const sel = new SelectionState()
  const api = {
    createSheet: vi.fn(async () => result({ created: '/L/A/new' })),
    newFromTemplate: vi.fn(async () => result({ created: '/L/A/tpl' })),
    dailyNote: vi.fn(async () => result({ created: '/L/A/today' })),
    importFiles: vi.fn(async () => result({ copied: ['/L/A/x'] })),
    writeSheet: vi.fn(async () => undefined),
    saveTemplate: vi.fn(async () => undefined),
    listTemplates: vi.fn(async () => [{ name: 'Scene', path: '/t/Scene' }])
  }
  const host = {
    resolveLink: vi.fn((target: string) => (target === 'Known' ? '/L/A/known' : undefined)),
    reveal: vi.fn(async () => undefined),
    group: () => group ?? undefined,
    runOp: vi.fn(async (op: () => Promise<OpResult>) => op()),
    setSelection: vi.fn(async () => undefined),
    selectCopies: vi.fn(async () => undefined),
    settle: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    currentText: vi.fn(() => 'text' as string | undefined),
    info: vi.fn(),
    warn: vi.fn()
  } satisfies CreationHost
  return { api, host, sel, make: new SheetCreation(api as never, sel, host) }
}

let t: ReturnType<typeof setup>
beforeEach(() => {
  t = setup()
})

describe('SheetCreation', () => {
  it('makes a sheet at the end, and opens it with the cursor in it', async () => {
    await t.make.newSheet()
    expect(t.api.createSheet).toHaveBeenCalledWith('/L/A', undefined)
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/new'], '/L/A/new', true)
    expect(t.sel.anchor).toBe('/L/A/new')
  })

  it('puts a new sheet after the one the cursor is on', async () => {
    t.sel.cursor = '/L/A/a'
    await t.make.newSheet()
    expect(t.api.createSheet).toHaveBeenCalledWith('/L/A', 1)
  })

  it('does nothing without a group, or when nothing was made', async () => {
    const none = setup(null)
    await none.make.newSheet()
    expect(none.api.createSheet).not.toHaveBeenCalled()
    t.api.createSheet.mockResolvedValueOnce(result())
    await t.make.newSheet()
    expect(t.host.setSelection).not.toHaveBeenCalled()
  })

  it('makes a sheet from a template, and the daily note', async () => {
    t.sel.cursor = '/L/A/b'
    await t.make.fromTemplate('/t/Scene')
    expect(t.api.newFromTemplate).toHaveBeenCalledWith('/L/A', '/t/Scene', 2)
    await t.make.dailyNote()
    expect(t.api.dailyNote).toHaveBeenCalledWith('/L/A')
    expect(t.host.setSelection).toHaveBeenLastCalledWith(['/L/A/today'], '/L/A/today', true)
  })

  it('makes the sheet a link names, titled by the link', async () => {
    await t.make.forLink('  Castle ')
    expect(t.host.flush).toHaveBeenCalled()
    expect(t.api.writeSheet).toHaveBeenCalledWith('/L/A/new', '# Castle\n\n')
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/new'], '/L/A/new', true)
  })

  it('opens the sheet a link names, or makes it when there is none', async () => {
    await t.make.follow('Known')
    expect(t.host.reveal).toHaveBeenCalledWith('/L/A/known')
    expect(t.api.createSheet).not.toHaveBeenCalled()
    await t.make.follow('Missing')
    expect(t.api.writeSheet).toHaveBeenCalledWith('/L/A/new', '# Missing\n\n')
  })

  it('selects imported sheets and says how many', async () => {
    await t.make.importFiles()
    expect(t.host.selectCopies).toHaveBeenCalledWith(['/L/A/x'])
    expect(t.host.info).toHaveBeenCalledWith('Imported 1 sheet.')
    t.api.importFiles.mockResolvedValueOnce(result({ copied: ['a', 'b'] }))
    await t.make.importFiles()
    expect(t.host.info).toHaveBeenLastCalledWith('Imported 2 sheets.')
  })

  it('warns about files that could not be imported', async () => {
    t.api.importFiles.mockResolvedValueOnce(result({ copied: ['a'], skipped: ['p', 'q', 'r', 's'] }))
    await t.make.importFiles()
    expect(t.host.warn).toHaveBeenCalledWith('Imported 1. Could not import p, q, r and 1 more.')
    expect(t.host.info).not.toHaveBeenCalled()
  })

  it('saves the open sheet as a template and reloads the list', async () => {
    await t.make.saveAsTemplate()
    expect(t.api.saveTemplate).toHaveBeenCalledWith('text')
    expect(t.make.templates).toEqual([{ name: 'Scene', path: '/t/Scene' }])
    expect(t.host.info).toHaveBeenCalledWith('Saved as a template')
    t.host.currentText.mockReturnValue(undefined)
    t.api.saveTemplate.mockClear()
    await t.make.saveAsTemplate()
    expect(t.api.saveTemplate).not.toHaveBeenCalled()
  })
})
