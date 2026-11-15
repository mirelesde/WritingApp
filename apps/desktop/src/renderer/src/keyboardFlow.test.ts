import { describe, expect, it, vi } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import { KeyboardFlow, type KeyboardHost } from './keyboardFlow'

const group = (path: string, children: GroupNode[] = []): GroupNode =>
  ({ kind: 'group', path, name: path, children }) as unknown as GroupNode
const tree = group('/L', [group('/L/A'), group('/L/B')])

function key(k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}): KeyboardEvent {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault: vi.fn(), ...mods } as unknown as KeyboardEvent
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<KeyboardHost> = {}) {
  const step = vi.fn()
  const host = {
    tree: () => tree as GroupNode | undefined,
    expanded: () => ({ '/L': true }),
    setExpanded: vi.fn(),
    selectedGroup: () => '/L/A',
    selectGroup: vi.fn(),
    renaming: () => false,
    startRename: vi.fn(),
    clipboardKey: vi.fn(() => false),
    move: vi.fn(),
    listPaths: () => ['a', 'b', 'c'],
    selection: () => ({ paths: ['a'], cursor: 'a' as string | null, anchor: 'a' as string | null }),
    setAnchor: vi.fn(),
    setSelection: vi.fn(),
    manualOrder: () => true,
    siblings: () => ['a', 'b', 'c'] as string[] | undefined,
    focusEditor: vi.fn(),
    step,
    focusLibrary: vi.fn(),
    focusSheets: vi.fn(),
    ...over
  }
  return { host, step, keys: new KeyboardFlow(host) }
}

describe('KeyboardFlow tree', () => {
  it('moves the selection down the groups', () => {
    const t = setup()
    const e = key('ArrowDown')
    t.keys.tree(e)
    expect(t.host.selectGroup).toHaveBeenCalledWith('/L/B')
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('renames on Enter, but leaves the keys to the text box while renaming', () => {
    const t = setup()
    t.keys.tree(key('Enter'))
    expect(t.host.startRename).toHaveBeenCalledWith('/L/A')
    const r = setup({ renaming: () => true })
    r.keys.tree(key('Enter'))
    expect(r.host.startRename).not.toHaveBeenCalled()
  })

  it('does nothing without a library', () => {
    const t = setup({ tree: () => undefined })
    t.keys.tree(key('ArrowDown'))
    expect(t.host.selectGroup).not.toHaveBeenCalled()
  })

  it('moves a group with the move shortcut', () => {
    const t = setup({ selectedGroup: () => '/L/B' })
    t.keys.tree(key('ArrowUp', { metaKey: true, altKey: true }))
    expect(t.host.move).toHaveBeenCalledWith(['/L/B'], '/L', 0)
  })
})

describe('KeyboardFlow sheets', () => {
  it('moves the selection down the list', () => {
    const t = setup()
    t.keys.sheets(key('ArrowDown'))
    expect(t.host.setSelection).toHaveBeenCalledWith(['b'], 'b')
  })

  it('moves sheets with the move shortcut, in manual order', () => {
    const t = setup()
    t.keys.sheets(key('ArrowDown', { metaKey: true, altKey: true }))
    expect(t.host.move).toHaveBeenCalledWith(['a'], expect.any(String), expect.any(Number))
  })

  it('lets the clipboard keys through first', () => {
    const t = setup({ clipboardKey: vi.fn(() => true) })
    const e = key('c', { metaKey: true })
    t.keys.sheets(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(t.host.setSelection).not.toHaveBeenCalled()
  })
})

describe('KeyboardFlow window', () => {
  it('goes back and forward', () => {
    const t = setup()
    t.keys.window(key('[', { metaKey: true }))
    t.keys.window(key(']', { ctrlKey: true }))
    expect(t.step.mock.calls).toEqual([[-1], [1]])
  })

  it('jumps between the panes', () => {
    const t = setup()
    const e = key('1', { metaKey: true })
    t.keys.window(e)
    t.keys.window(key('2', { metaKey: true }))
    t.keys.window(key('3', { metaKey: true }))
    expect(t.host.focusLibrary).toHaveBeenCalled()
    expect(t.host.focusSheets).toHaveBeenCalled()
    expect(t.host.focusEditor).toHaveBeenCalledWith('a')
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('ignores keys without the command key, or without a library', () => {
    const t = setup()
    const e = key('1')
    t.keys.window(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    const none = setup({ tree: () => undefined })
    none.keys.window(key('1', { metaKey: true }))
    expect(none.host.focusLibrary).not.toHaveBeenCalled()
  })
})
