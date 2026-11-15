import { beforeEach, describe, expect, it } from 'vitest'
import { SelectionState } from './selectionState.svelte'

let sel: SelectionState
beforeEach(() => {
  sel = new SelectionState()
})

describe('SelectionState', () => {
  it('names the only sheet, and none when there are none or several', () => {
    expect(sel.only).toBeUndefined()
    sel.paths = ['a']
    expect(sel.only).toBe('a')
    sel.paths = ['a', 'b']
    expect(sel.only).toBeUndefined()
  })

  it('knows what is selected', () => {
    sel.paths = ['a', 'b']
    expect([sel.has('a'), sel.has('c')]).toEqual([true, false])
  })

  it('selects one sheet as cursor and anchor, and clears everything', () => {
    sel.selectOnly('a')
    expect([sel.paths, sel.cursor, sel.anchor]).toEqual([['a'], 'a', 'a'])
    sel.clear()
    expect([sel.paths, sel.cursor, sel.anchor]).toEqual([[], null, null])
  })

  it('follows moved sheets, leaving an empty cursor or anchor empty', () => {
    sel.paths = ['/L/a.md', '/L/b.md']
    sel.cursor = '/L/b.md'
    sel.remap((p) => p.replace('/L/', '/L/G/'))
    expect([sel.paths, sel.cursor, sel.anchor]).toEqual([
      ['/L/G/a.md', '/L/G/b.md'],
      '/L/G/b.md',
      null
    ])
  })

  it('drops missing sheets, and the cursor and anchor when none are left', () => {
    sel.paths = ['a', 'b']
    sel.cursor = sel.anchor = 'b'
    sel.prune((p) => p === 'a')
    expect([sel.paths, sel.cursor]).toEqual([['a'], 'b'])
    sel.prune(() => false)
    expect([sel.paths, sel.cursor, sel.anchor]).toEqual([[], null, null])
  })
})
