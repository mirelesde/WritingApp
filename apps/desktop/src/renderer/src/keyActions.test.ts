import { describe, expect, it } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import { visibleGroups, type VisibleGroup } from './organise'
import { sheetsKey, tabKey, treeKey, windowKey, type KeyInfo, type SheetsKeyContext } from './keyActions'

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})
const group = (path: string, children: (GroupNode | SheetNode)[] = []): GroupNode =>
  ({ kind: 'group', path, name: path.split('/').pop()!, children }) as GroupNode

const sub = group('/L/A/Sub')
const a = group('/L/A', [sub])
const b = group('/L/B')
const root = group('/L', [a, b])
const no = (): boolean => false

describe('treeKey', () => {
  const flat = (expanded: Record<string, boolean>): VisibleGroup[] => visibleGroups(root, expanded)

  it('moves the selection down and up', () => {
    const f = flat({ '/L': true })
    expect(treeKey(key('ArrowDown'), f, '/L/A', {}, no).action).toEqual({ kind: 'select', path: '/L/B' })
    expect(treeKey(key('ArrowUp'), f, '/L/B', {}, no).action).toEqual({ kind: 'select', path: '/L/A' })
  })

  it('handles but does nothing at the end of the list', () => {
    const f = flat({ '/L': true })
    expect(treeKey(key('ArrowDown'), f, '/L/B', {}, no)).toEqual({ handled: true, action: undefined })
  })

  it('opens a group on Right, then steps into it; closes on Left, then steps out', () => {
    const closed = flat({ '/L': true })
    expect(treeKey(key('ArrowRight'), closed, '/L/A', { '/L': true }, no).action).toEqual({
      kind: 'expand',
      path: '/L/A',
      open: true
    })
    const open = flat({ '/L': true, '/L/A': true })
    const ex = { '/L': true, '/L/A': true }
    expect(treeKey(key('ArrowRight'), open, '/L/A', ex, no).action).toEqual({ kind: 'select', path: '/L/A/Sub' })
    expect(treeKey(key('ArrowLeft'), open, '/L/A', ex, no).action).toEqual({ kind: 'expand', path: '/L/A', open: false })
    expect(treeKey(key('ArrowLeft'), open, '/L/A/Sub', ex, no).action).toEqual({ kind: 'select', path: '/L/A' })
  })

  it('renames on Enter and F2', () => {
    const f = flat({ '/L': true })
    expect(treeKey(key('Enter'), f, '/L/A', {}, no).action).toEqual({ kind: 'rename', path: '/L/A' })
    expect(treeKey(key('F2'), f, '/L/A', {}, no).action).toEqual({ kind: 'rename', path: '/L/A' })
  })

  it('moves a group among its siblings with Cmd+Alt+Arrow', () => {
    const f = flat({ '/L': true })
    const r = treeKey(key('ArrowDown', { metaKey: true, altKey: true }), f, '/L/A', {}, no)
    expect(r.action).toEqual({ kind: 'move', paths: ['/L/A'], parent: '/L', slot: 1 })
    expect(treeKey(key('ArrowUp', { metaKey: true, altKey: true }), f, '/L/A', {}, no)).toEqual({
      handled: true,
      action: undefined
    })
  })

  it('lets the clipboard take its keys, and leaves other modified keys alone', () => {
    const f = flat({ '/L': true })
    expect(treeKey(key('c', { metaKey: true }), f, '/L/A', {}, () => true)).toEqual({ handled: true })
    expect(treeKey(key('Enter', { metaKey: true }), f, '/L/A', {}, no).handled).toBe(false)
    expect(treeKey(key('x'), f, '/L/A', {}, no).handled).toBe(false)
  })

  it('ignores a key when the selected group is not shown', () => {
    expect(treeKey(key('ArrowDown'), flat({ '/L': true }), '/gone', {}, no).handled).toBe(false)
  })
})

describe('sheetsKey', () => {
  const ctx = (over: Partial<SheetsKeyContext> = {}): SheetsKeyContext => ({
    listPaths: ['/L/a', '/L/b', '/L/c'],
    selected: ['/L/b'],
    cursor: '/L/b',
    anchor: '/L/b',
    manual: true,
    siblings: () => ['/L/a', '/L/b', '/L/c'],
    ...over
  })

  it('moves the cursor and the selection', () => {
    expect(sheetsKey(key('ArrowDown'), ctx(), no).action).toEqual({
      kind: 'select',
      paths: ['/L/c'],
      cursor: '/L/c',
      anchor: '/L/c'
    })
    expect(sheetsKey(key('Home'), ctx(), no).action).toMatchObject({ paths: ['/L/a'] })
    expect(sheetsKey(key('End'), ctx(), no).action).toMatchObject({ paths: ['/L/c'] })
  })

  it('extends a range from the anchor with Shift, keeping the anchor', () => {
    expect(sheetsKey(key('ArrowDown', { shiftKey: true }), ctx(), no).action).toEqual({
      kind: 'select',
      paths: ['/L/b', '/L/c'],
      cursor: '/L/c'
    })
  })

  it('selects everything with Cmd+A', () => {
    expect(sheetsKey(key('a', { metaKey: true }), ctx(), no).action).toEqual({
      kind: 'select',
      paths: ['/L/a', '/L/b', '/L/c'],
      cursor: '/L/b'
    })
  })

  it('moves to the editor on Enter', () => {
    expect(sheetsKey(key('Enter'), ctx(), no).action).toEqual({ kind: 'edit' })
  })

  it('reorders only in manual order and only within one group', () => {
    const up = key('ArrowUp', { metaKey: true, altKey: true })
    expect(sheetsKey(up, ctx(), no).action).toEqual({ kind: 'move', paths: ['/L/b'], parent: '/L', slot: 0 })
    expect(sheetsKey(up, ctx({ manual: false }), no)).toEqual({ handled: true })
    expect(sheetsKey(up, ctx({ selected: ['/L/a', '/M/x'] }), no)).toEqual({ handled: true })
  })

  it('does not cancel keys it has no use for', () => {
    expect(sheetsKey(key('q'), ctx(), no).handled).toBe(false)
    expect(sheetsKey(key('Enter', { altKey: true }), ctx(), no).handled).toBe(false)
  })
})

describe('tabKey', () => {
  it('maps Ctrl+Tab, Ctrl+PageDown/Up and Cmd/Ctrl+Shift+] and [', () => {
    expect(tabKey(key('Tab', { ctrlKey: true }), true)).toBe(1)
    expect(tabKey(key('Tab', { ctrlKey: true, shiftKey: true }), true)).toBe(-1)
    expect(tabKey(key('PageDown', { ctrlKey: true }), true)).toBe(1)
    expect(tabKey(key('PageUp', { ctrlKey: true }), true)).toBe(-1)
    expect(tabKey(key('}', { metaKey: true, shiftKey: true }), true)).toBe(1)
    expect(tabKey(key('{', { metaKey: true, shiftKey: true }), true)).toBe(-1)
  })
  it('leaves plain Tab, Alt combinations and a missing library alone', () => {
    expect(tabKey(key('Tab'), true)).toBeUndefined()
    expect(tabKey(key('Tab', { ctrlKey: true, altKey: true }), true)).toBeUndefined()
    expect(tabKey(key('Tab', { ctrlKey: true }), false)).toBeUndefined()
  })
})

describe('windowKey', () => {
  const mod = { metaKey: true }
  it('maps the shortcuts', () => {
    expect(windowKey(key('[', mod), true, true)).toBe('back')
    expect(windowKey(key(']', mod), true, true)).toBe('forward')
    expect(windowKey(key('1', mod), true, true)).toBe('focus-library')
    expect(windowKey(key('2', mod), true, true)).toBe('focus-sheets')
    expect(windowKey(key('3', mod), true, true)).toBe('focus-editor')
  })
  it('needs a library, and a sheet for the editor', () => {
    expect(windowKey(key('1', mod), false, false)).toBeUndefined()
    expect(windowKey(key('3', mod), true, false)).toBeUndefined()
  })
  it('ignores plain, Shift and Alt presses', () => {
    expect(windowKey(key('1'), true, true)).toBeUndefined()
    expect(windowKey(key('1', { ...mod, shiftKey: true }), true, true)).toBeUndefined()
    expect(windowKey(key('1', { ...mod, altKey: true }), true, true)).toBeUndefined()
  })
})
