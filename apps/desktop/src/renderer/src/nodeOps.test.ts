import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import type { LibraryInfo, OpResult } from '../../preload/api'
import { GroupNav } from './groupNav.svelte'
import { NodeOps, type NodeHost } from './nodeOps.svelte'
import { SelectionState } from './selectionState.svelte'

const sheet = (path: string): SheetNode => ({ kind: 'sheet', path, name: path.split('/').pop()! }) as SheetNode
const group = (path: string, children: (GroupNode | SheetNode)[] = []): GroupNode =>
  ({ kind: 'group', path, name: path.split('/').pop()!, children }) as GroupNode
const tree = group('/L', [group('/L/A', [sheet('/L/A/a'), sheet('/L/A/b'), sheet('/L/A/c')]), group('/L/B')])
const library = { path: '/L', tree } as unknown as LibraryInfo
const result = (over: Partial<OpResult> = {}): OpResult => ({ library, moved: [], ...over })

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(opts: { treeFocused?: boolean; lib?: LibraryInfo | null } = {}) {
  const sel = new SelectionState()
  const nav = new GroupNav()
  nav.reset('/L')
  nav.selectedGroup = '/L/A'
  const api = {
    merge: vi.fn(async () => result()),
    glue: vi.fn(async () => result()),
    unglue: vi.fn(async () => result()),
    deleteNodes: vi.fn(async () => result()),
    copy: vi.fn(async () => result({ copied: ['/L/A/a copy'] })),
    move: vi.fn(async () => result()),
    undo: vi.fn(async () => result({ label: 'Delete' })),
    split: vi.fn(async () => result({ created: '/L/A/d' })),
    createGroup: vi.fn(async () => result({ created: '/L/A/New' })),
    renameGroup: vi.fn(async () => result())
  }
  const host = {
    library: () => (opts.lib === undefined ? library : opts.lib),
    runOp: vi.fn(async (op: () => Promise<OpResult>) => op()),
    setSelection: vi.fn(async () => undefined),
    selectGroup: vi.fn(),
    clearSheets: vi.fn(),
    treeFocused: () => opts.treeFocused ?? false,
    focusTree: vi.fn(async () => undefined),
    cursor: vi.fn(() => undefined as { path: string; text: string; offset: number } | undefined),
    info: vi.fn(),
    warn: vi.fn()
  } satisfies NodeHost
  return { api, host, sel, nav, ops: new NodeOps(api as never, sel, nav, host) }
}

let t: ReturnType<typeof setup>
beforeEach(() => {
  t = setup()
})

describe('copy, cut and paste', () => {
  it('says what it took, and warns when nothing is selected', () => {
    t.nav.selectedGroup = '/L'
    t.ops.copy(false)
    expect(t.host.warn).toHaveBeenCalledWith('Select a sheet or group to copy first.')
    t.nav.selectedGroup = '/L/A'
    t.sel.paths = ['/L/A/a', '/L/A/b']
    t.ops.copy(true)
    expect(t.ops.clip).toEqual({ paths: ['/L/A/a', '/L/A/b'], cut: true })
    expect(t.host.info).toHaveBeenCalledWith('Cut 2 items. Paste with Cmd/Ctrl+V.')
  })

  it('acts on the selected group when the tree has focus', () => {
    const tree = setup({ treeFocused: true })
    tree.sel.paths = ['/L/A/a']
    tree.ops.copy(false)
    expect(tree.ops.clip?.paths).toEqual(['/L/A'])
  })

  it('does not copy the library root', () => {
    t.nav.selectedGroup = '/L'
    t.ops.copy(false)
    expect(t.host.warn).toHaveBeenCalled()
  })

  it('pastes a copy after the cursor and selects the new sheet', async () => {
    t.sel.paths = ['/L/A/a']
    t.sel.cursor = '/L/A/b'
    t.ops.copy(false)
    await t.ops.paste()
    expect(t.api.copy).toHaveBeenCalledWith(['/L/A/a'], '/L/A', 2, 'Paste')
    expect(t.api.copy).toHaveBeenCalled()
  })

  it('pastes a cut by moving, then forgets it', async () => {
    t.sel.paths = ['/L/A/a']
    t.ops.copy(true)
    t.nav.selectedGroup = '/L/B'
    await t.ops.paste()
    expect(t.api.move).toHaveBeenCalledWith(['/L/A/a'], '/L/B', undefined)
    expect(t.ops.clip).toBeNull()
  })

  it('keeps the cut when the move fails', async () => {
    t.sel.paths = ['/L/A/a']
    t.ops.copy(true)
    t.host.runOp.mockResolvedValue(undefined as never)
    await t.ops.paste()
    expect(t.ops.clip).not.toBeNull()
  })

  it('does nothing without a clip', async () => {
    await t.ops.paste()
    expect(t.host.runOp).not.toHaveBeenCalled()
  })
})

describe('duplicate', () => {
  it('copies after the last chosen sheet', async () => {
    t.sel.paths = ['/L/A/a', '/L/A/b']
    await t.ops.duplicate()
    expect(t.api.copy).toHaveBeenCalledWith(['/L/A/a', '/L/A/b'], '/L/A', 2, 'Duplicate')
  })
  it('warns with nothing to duplicate', async () => {
    t.nav.selectedGroup = '/L'
    await t.ops.duplicate()
    expect(t.host.warn).toHaveBeenCalledWith('Select a sheet or group to duplicate first.')
  })
})

describe('clipboardKey', () => {
  const key = (k: string, over: object = {}): KeyboardEvent =>
    ({ key: k, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: { closest: () => null }, preventDefault: vi.fn(), ...over }) as unknown as KeyboardEvent
  it('takes Cmd+C, X, V and D, and nothing else', () => {
    t.sel.paths = ['/L/A/a']
    expect(t.ops.clipboardKey(key('c'))).toBe(true)
    expect(t.ops.clip?.cut).toBe(false)
    expect(t.ops.clipboardKey(key('q'))).toBe(false)
    expect(t.ops.clipboardKey(key('c', { shiftKey: true }))).toBe(false)
    expect(t.ops.clipboardKey(key('c', { metaKey: false }))).toBe(false)
  })
  it('leaves text fields to type in', () => {
    expect(t.ops.clipboardKey(key('c', { target: { closest: () => ({}) } }))).toBe(false)
  })
})

describe('merge, glue, split, delete, undo', () => {
  it('merges two or more sheets and selects the result', async () => {
    t.sel.paths = ['/L/A/a']
    await t.ops.merge()
    expect(t.host.warn).toHaveBeenCalledWith('Select two or more sheets to merge.')
    t.sel.paths = ['/L/A/a', '/L/A/b']
    t.api.merge.mockResolvedValue(result({ created: '/L/A/ab' }))
    await t.ops.merge()
    expect(t.api.merge).toHaveBeenCalledWith(['/L/A/a', '/L/A/b'])
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/ab'], '/L/A/ab')
  })

  it('glues or unglues the selection', async () => {
    await t.ops.glue(true)
    expect(t.host.warn).toHaveBeenCalledWith('Select a sheet first.')
    t.sel.paths = ['/L/A/a']
    await t.ops.glue(true)
    await t.ops.glue(false)
    expect(t.api.glue).toHaveBeenCalledWith(['/L/A/a'])
    expect(t.api.unglue).toHaveBeenCalledWith(['/L/A/a'])
  })

  it('splits at the cursor and focuses the new sheet', async () => {
    await t.ops.split()
    expect(t.host.warn).toHaveBeenCalledWith('Put the cursor in a sheet to split it there.')
    t.host.cursor.mockReturnValue({ path: '/L/A/a', text: 'hello', offset: 2 })
    await t.ops.split()
    expect(t.api.split).toHaveBeenCalledWith('/L/A/a', 'hello', 2)
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/d'], '/L/A/d', true)
  })

  it('moves the selected sheets to the trash and says how to undo', async () => {
    t.sel.paths = ['/L/A/a']
    await t.ops.remove()
    expect(t.api.deleteNodes).toHaveBeenCalledWith(['/L/A/a'])
    expect(t.host.info).toHaveBeenCalledWith('Moved 1 item to the trash. Undo with Cmd/Ctrl+Alt+Z.')
  })

  it('deletes the selected group when the tree has focus, but never the root', async () => {
    const tree = setup({ treeFocused: true })
    await tree.ops.remove()
    expect(tree.api.deleteNodes).toHaveBeenCalledWith(['/L/A'])
    tree.nav.selectedGroup = '/L'
    await tree.ops.remove()
    expect(tree.host.warn).toHaveBeenCalledWith('Select a sheet or group to delete first.')
  })

  it('names what an undo undid', async () => {
    await t.ops.undo()
    expect(t.host.info).toHaveBeenCalledWith('Undid delete')
  })
})

describe('groups', () => {
  it('makes a group, opens its name for editing and empties the editor', async () => {
    await t.ops.newGroup(false)
    expect(t.api.createGroup).toHaveBeenCalledWith('/L/A', undefined)
    expect(t.nav.selectedGroup).toBe('/L/A/New')
    expect(t.ops.renaming).toBe('/L/A/New')
    expect(t.host.clearSheets).toHaveBeenCalled()
  })

  it('names a new project in the root', async () => {
    await t.ops.newGroup(true)
    expect(t.api.createGroup).toHaveBeenCalledWith('/L', 'Untitled Project')
  })

  it('renames only when the name changed', async () => {
    await t.ops.startRename('/L/B')
    await t.ops.commitRename('/L/B', '  B  ')
    expect(t.api.renameGroup).not.toHaveBeenCalled()
    expect(t.ops.renaming).toBeNull()
    await t.ops.startRename('/L/B')
    await t.ops.commitRename('/L/B', ' Bee ')
    expect(t.api.renameGroup).toHaveBeenCalledWith('/L/B', 'Bee')
  })

  it('ignores an empty name, a stale commit and a rename of the root', async () => {
    await t.ops.startRename('/L/B')
    await t.ops.commitRename('/L/B', '  ')
    await t.ops.commitRename('/L/B', 'Late')
    await t.ops.startRename('/L')
    expect(t.api.renameGroup).not.toHaveBeenCalled()
    expect(t.ops.renaming).toBeNull()
  })
})
