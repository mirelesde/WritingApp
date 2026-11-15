import { describe, expect, it, vi } from 'vitest'
import type { OpResult } from '../../preload/api'
import { FindFlow, type FindEditor, type FindFlowHost } from './findFlow.svelte'

const scopes = [
  { value: 'sheet', label: 'This sheet', path: 'a' },
  { value: 'group', label: 'Group', path: '/L' },
  { value: 'library', label: 'Library', path: undefined }
] as unknown as ReturnType<FindFlowHost['scopes']>

function fakeEditor(): FindEditor {
  return {
    getText: vi.fn(() => 'hello'),
    cursorOffset: vi.fn(() => 2),
    selectRange: vi.fn(),
    markMatches: vi.fn(),
    clearMarks: vi.fn(),
    replaceRanges: vi.fn(),
    focus: vi.fn()
  } as unknown as FindEditor
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<FindFlowHost> = {}) {
  const editors: Record<string, FindEditor> = { a: fakeEditor(), b: fakeEditor() }
  const restore = vi.fn()
  const runOp = vi.fn(async (op: () => Promise<OpResult>): Promise<OpResult | undefined> => op())
  const host = {
    scopes: () => scopes,
    selectedText: () => '',
    only: () => 'a' as string | undefined,
    editor: (p: string) => editors[p],
    editors: () => Object.entries(editors),
    openSheet: vi.fn(async () => undefined),
    focusBar: vi.fn(),
    tick: vi.fn(async () => undefined),
    rememberFocus: () => restore,
    runOp,
    flush: vi.fn(async () => undefined),
    info: vi.fn(),
    ...over
  }
  const api = { replaceAll: vi.fn(async () => ({ replaced: 3 }) as unknown as OpResult) }
  return { editors, restore, host, runOp, api, flow: new FindFlow(api, host) }
}

describe('FindFlow', () => {
  it('opens narrow by default, seeded with the selected text', () => {
    const t = setup({ selectedText: () => 'castle' })
    t.flow.open()
    expect(t.flow.current).toMatchObject({ scope: 'sheet', replace: false, query: 'castle' })
  })

  it('search starts on the group when there is one', () => {
    const t = setup()
    t.flow.search()
    expect(t.flow.current?.scope).toBe('group')
  })

  it('reuses the open bar, changing its scope and focusing it', () => {
    const t = setup()
    t.flow.open()
    const key = t.flow.current?.key
    t.flow.open('library', true)
    expect(t.flow.current).toMatchObject({ scope: 'library', key })
    expect(t.host.focusBar).toHaveBeenCalledWith(undefined, true)
  })

  it('closes by clearing the marks and focusing the open sheet', () => {
    const t = setup()
    t.flow.open()
    t.flow.close()
    expect(t.flow.current).toBeNull()
    expect(t.editors.a!.clearMarks).toHaveBeenCalled()
    expect(t.editors.b!.clearMarks).toHaveBeenCalled()
    expect(t.editors.a!.focus).toHaveBeenCalled()
  })

  it('gives the focus back when no sheet is open', () => {
    const t = setup({ only: () => undefined })
    t.flow.open()
    t.flow.close()
    expect(t.restore).toHaveBeenCalled()
  })

  it('toggles', () => {
    const t = setup()
    t.flow.toggle()
    expect(t.flow.current).not.toBeNull()
    t.flow.toggle()
    expect(t.flow.current).toBeNull()
  })

  it('replaces in the library, says how many, and reloads', async () => {
    const t = setup()
    const n = await t.flow.replaceFound('x', 'y', undefined, {} as never)
    expect(n).toBe(3)
    expect(t.runOp).toHaveBeenCalledWith(expect.any(Function), true)
    expect(t.host.info).toHaveBeenCalled()
    t.runOp.mockResolvedValueOnce(undefined)
    expect(await t.flow.replaceFound('x', 'y', 'a', {} as never)).toBe(0)
  })

  describe('bar', () => {
    it('reports the open sheet, its text and cursor', () => {
      const t = setup()
      expect(t.flow.bar.sheet()).toEqual({ path: 'a', text: 'hello', cursor: 2 })
      const none = setup({ only: () => undefined })
      expect(none.flow.bar.sheet()).toBeNull()
    })

    it('marks matches in one sheet and clears the rest', () => {
      const t = setup()
      t.flow.bar.mark('a', 'q', {} as never)
      expect(t.editors.a!.markMatches).toHaveBeenCalledWith('q', {})
      expect(t.editors.b!.clearMarks).toHaveBeenCalled()
    })

    it('opens a sheet that is not shown, then selects the match', async () => {
      const t = setup({ only: () => 'b' })
      await t.flow.bar.reveal('a', 1, 3)
      expect(t.host.openSheet).toHaveBeenCalledWith('a')
      expect(t.editors.a!.selectRange).toHaveBeenCalledWith(1, 3)
      const shown = setup()
      await shown.flow.bar.reveal('a', 0, 1)
      expect(shown.host.openSheet).not.toHaveBeenCalled()
    })

    it('replaces across the library within a scope', async () => {
      const t = setup()
      await t.flow.bar.replaceAll('x', 'y', '/L', { caseSensitive: false } as never)
      expect(t.api.replaceAll).toHaveBeenCalledWith('x', 'y', undefined, { caseSensitive: false, within: '/L' })
    })
  })
})
