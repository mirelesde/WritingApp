import { beforeEach, describe, expect, it } from 'vitest'
import { TabsState } from './tabsState.svelte'

let tabs: TabsState
const none = (): boolean => false

beforeEach(() => {
  tabs = new TabsState()
})

const setup = (list: string[], active = 0): void => {
  tabs.list = list
  tabs.active = active
}

describe('follow', () => {
  it('starts the first tab', () => {
    tabs.follow('a', false, none)
    expect([tabs.list, tabs.active]).toEqual([['a'], 0])
  })

  it('fills an empty front tab with the sheet chosen', () => {
    setup(['a', ''], 1)
    tabs.follow('x', false, none)
    expect([tabs.list, tabs.active]).toEqual([['a', 'x'], 1])
  })

  it('replaces the front tab, leaving the others', () => {
    setup(['a', 'b', 'c'], 1)
    tabs.follow('x', false, none)
    expect(tabs.list).toEqual(['a', 'x', 'c'])
  })

  it('does nothing when the front tab already has the sheet', () => {
    setup(['a', 'b'], 1)
    tabs.follow('b', true, () => true)
    expect([tabs.list, tabs.active]).toEqual([['a', 'b'], 1])
  })

  it('brings forward a tab that has the sheet when saving is manual', () => {
    setup(['a', 'b', 'c'], 0)
    tabs.follow('c', true, none)
    expect([tabs.list, tabs.active]).toEqual([['a', 'b', 'c'], 2])
  })

  it('opens beside a front tab with unsaved changes, when saving is manual', () => {
    setup(['a', 'b'], 0)
    tabs.follow('x', true, (p) => p === 'a')
    expect([tabs.list, tabs.active]).toEqual([['a', 'x', 'b'], 1])
  })

  it('replaces a front tab without changes even when saving is manual', () => {
    setup(['a', 'b'], 0)
    tabs.follow('x', true, none)
    expect(tabs.list).toEqual(['x', 'b'])
  })
})

describe('prune', () => {
  it('drops missing sheets and keeps the same sheet in front', () => {
    setup(['a', 'b', 'c'], 2)
    tabs.prune((p) => p !== 'a')
    expect([tabs.list, tabs.active]).toEqual([['b', 'c'], 1])
  })

  it('goes to the first tab when the front sheet is gone', () => {
    setup(['a', 'b', 'c'], 2)
    tabs.prune((p) => p !== 'c')
    expect([tabs.list, tabs.active]).toEqual([['a', 'b'], 0])
  })

  it('leaves everything alone when all survive', () => {
    setup(['a', 'b'], 1)
    tabs.prune(() => true)
    expect([tabs.list, tabs.active]).toEqual([['a', 'b'], 1])
  })

  it('copes with every tab gone', () => {
    setup(['a'], 0)
    tabs.prune(none)
    expect([tabs.list, tabs.active]).toEqual([[], 0])
  })
})

describe('select and open', () => {
  it('selects an existing tab and ignores a missing one', () => {
    setup(['a', 'b'], 0)
    expect(tabs.select(1)).toBe('b')
    expect(tabs.active).toBe(1)
    expect(tabs.select(5)).toBeUndefined()
    expect(tabs.active).toBe(1)
  })

  it('reuses the tab that has the sheet, or adds one after the front', () => {
    setup(['a', 'b', 'c'], 0)
    expect(tabs.open('c', true)).toBe(2)
    expect(tabs.list).toEqual(['a', 'b', 'c'])
    expect(tabs.open('a', false)).toBe(1)
    expect(tabs.list).toEqual(['a', 'a', 'b', 'c'])
  })
})

describe('remove and cycle', () => {
  it('removes a tab before the front one without losing the front', () => {
    setup(['a', 'b', 'c'], 2)
    expect(tabs.remove(0)).toBe(false)
    expect([tabs.list, tabs.active]).toEqual([['b', 'c'], 1])
  })

  it('reports removing the front tab, and stays in range', () => {
    setup(['a', 'b', 'c'], 2)
    expect(tabs.remove(2)).toBe(true)
    expect([tabs.list, tabs.active]).toEqual([['a', 'b'], 1])
  })

  it('cycles round both ways, and not with fewer than two tabs', () => {
    setup(['a', 'b', 'c'], 2)
    expect(tabs.cycleTarget(1)).toBe(0)
    expect(tabs.cycleTarget(-1)).toBe(1)
    setup(['a'], 0)
    expect(tabs.cycleTarget(1)).toBeUndefined()
  })
})

describe('dragging', () => {
  it('reorders in place', () => {
    setup(['a', 'b', 'c'], 0)
    tabs.startDrag(0)
    tabs.reorder(0, 3)
    expect([tabs.list, tabs.active]).toEqual([['b', 'c', 'a'], 2])
  })

  it('reports a drag nobody took, and not one that was dropped', () => {
    tabs.startDrag(1)
    tabs.hint = 2
    expect(tabs.endDrag()).toBe(1)
    expect([tabs.dragFrom, tabs.hint]).toEqual([null, null])
    tabs.startDrag(1)
    tabs.dropped = true
    expect(tabs.endDrag()).toBeNull()
  })

  it('remaps and inserts', () => {
    setup(['a', 'b'], 0)
    tabs.remap((p) => p + '2')
    tabs.insert(1, 'x')
    expect(tabs.list).toEqual(['a2', 'x', 'b2'])
  })
})
