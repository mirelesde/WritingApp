import { describe, expect, it, vi } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import { DragDrop, type DragHost } from './dragDrop.svelte'

const sheet = (path: string): SheetNode => ({ kind: 'sheet', path, name: path.split('/').pop()! }) as SheetNode
const group = (path: string, children: (GroupNode | SheetNode)[] = []): GroupNode =>
  ({ kind: 'group', path, name: path.split('/').pop()!, children }) as GroupNode

const tree = group('/L', [group('/L/A', [sheet('/L/A/a'), sheet('/L/A/b'), sheet('/L/A/c')]), group('/L/B'), group('/L/C')])

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const event = (init: Partial<DragEvent> = {}): DragEvent => {
  const data: Record<string, string> = {}
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientY: 0,
    dataTransfer: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: '' },
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }) },
    ...init
  } as unknown as DragEvent
}

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<{ manual: boolean; selected: string[] }> = {}) {
  let selected = over.selected ?? []
  const host = {
    tree: () => tree,
    selectedGroup: () => '/L/A',
    manualOrder: () => over.manual ?? true,
    listPaths: () => ['/L/A/a', '/L/A/b', '/L/A/c'],
    isSelected: (p: string) => selected.includes(p),
    selection: () => [...selected],
    selectOnly: vi.fn((p: string) => (selected = [p])),
    move: vi.fn(async () => ({ ok: true })),
    expand: vi.fn(),
    clearSheets: vi.fn()
  } satisfies DragHost
  return { host, dnd: new DragDrop(host) }
}

describe('dragging sheets in the list', () => {
  it('drags the selection when the grabbed sheet is part of it, else selects the grabbed one', () => {
    const a = setup({ selected: ['/L/A/a', '/L/A/b'] })
    a.dnd.sheetStart('/L/A/b', event())
    a.dnd.paneOver(event())
    expect(a.dnd.sheetHint).toBe('end')
    const b = setup({ selected: ['/L/A/a'] })
    b.dnd.sheetStart('/L/A/c', event())
    expect(b.host.selectOnly).toHaveBeenCalledWith('/L/A/c')
  })

  it('shows the line before or after a row by which half the pointer is over', () => {
    const { dnd } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.sheetOver('/L/A/b', event({ clientY: 20 }))
    expect(dnd.sheetHint).toEqual({ path: '/L/A/b', after: false })
    dnd.sheetOver('/L/A/b', event({ clientY: 80 }))
    expect(dnd.sheetHint).toEqual({ path: '/L/A/b', after: true })
  })

  it('does not accept a drop on itself, or when the list is sorted', () => {
    const { dnd } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.sheetOver('/L/A/a', event({ clientY: 20 }))
    expect(dnd.sheetHint).toBeNull()
    const sorted = setup({ manual: false })
    sorted.dnd.sheetStart('/L/A/a', event())
    sorted.dnd.sheetOver('/L/A/b', event({ clientY: 20 }))
    expect(sorted.dnd.sheetHint).toBeNull()
  })

  it('moves the dragged sheets to the slot the line shows', () => {
    const { dnd, host } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.sheetOver('/L/A/c', event({ clientY: 80 }))
    dnd.drop(event())
    expect(host.move).toHaveBeenCalledWith(['/L/A/a'], '/L/A', 2)
    expect(dnd.sheetHint).toBeNull()
  })

  it('drops at the end when the pointer is below the rows', () => {
    const { dnd, host } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.paneOver(event())
    dnd.drop(event())
    expect(host.move).toHaveBeenCalledWith(['/L/A/a'], '/L/A', undefined)
  })

  it('does nothing on a drop with no drag', () => {
    const { dnd, host } = setup()
    dnd.drop(event())
    expect(host.move).not.toHaveBeenCalled()
  })
})

describe('dragging onto the tree', () => {
  it('moves sheets into a group, opens it and empties the editor', async () => {
    const { dnd, host } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.tree.over('/L/B', 'inside', event())
    expect(dnd.tree.hint).toEqual({ path: '/L/B', zone: 'inside' })
    dnd.tree.drop('/L/B', 'inside', event())
    await Promise.resolve()
    await Promise.resolve()
    expect(host.move).toHaveBeenCalledWith(['/L/A/a'], '/L/B')
    expect(host.expand).toHaveBeenCalledWith('/L/B')
    expect(host.clearSheets).toHaveBeenCalled()
    expect(dnd.tree.hint).toBeNull()
  })

  it('does not offer sheets a place between groups', () => {
    const { dnd } = setup()
    dnd.sheetStart('/L/A/a', event())
    dnd.tree.over('/L/B', 'before', event())
    expect(dnd.tree.hint).toBeNull()
  })

  it('reorders a group among its siblings', () => {
    const { dnd, host } = setup()
    dnd.tree.start('/L/C', event())
    dnd.tree.drop('/L/A', 'before', event())
    expect(host.move).toHaveBeenCalledWith(['/L/C'], '/L', 0)
  })

  it('refuses to drop a group into itself or onto the root edge', () => {
    const { dnd } = setup()
    dnd.tree.start('/L/A', event())
    dnd.tree.over('/L/A/sub', 'inside', event())
    expect(dnd.tree.hint).toBeNull()
    dnd.tree.over('/L', 'before', event())
    expect(dnd.tree.hint).toBeNull()
    dnd.tree.over('/L', 'inside', event())
    expect(dnd.tree.hint).toEqual({ path: '/L', zone: 'inside' })
  })

  it('does not expand a group when the move failed', async () => {
    const { dnd, host } = setup()
    host.move.mockResolvedValue(undefined as never)
    dnd.tree.start('/L/C', event())
    dnd.tree.drop('/L/B', 'inside', event())
    await Promise.resolve()
    await Promise.resolve()
    expect(host.expand).not.toHaveBeenCalled()
  })
})
