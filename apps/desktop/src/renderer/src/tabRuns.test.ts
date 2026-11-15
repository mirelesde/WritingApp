import { describe, expect, it } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import { runInOwnGroup, sheetName, tabHasChanges } from './tabRuns'

const s = (path: string, glued = false): unknown => ({ kind: 'sheet', path, name: path, glued })
const tree = {
  kind: 'group',
  path: '/L',
  name: 'L',
  children: [{ kind: 'group', path: '/L/A', name: 'A', children: [s('/L/A/a', true), s('/L/A/b', true), s('/L/A/c'), s('/L/A/d')] }]
} as unknown as GroupNode

describe('tab runs', () => {
  it('finds the glued run a sheet belongs to', () => {
    expect(runInOwnGroup(tree, '/L/A/c')).toEqual(['/L/A/a', '/L/A/b', '/L/A/c'])
    expect(runInOwnGroup(tree, '/L/A/d')).toEqual(['/L/A/d'])
  })

  it('is just the sheet when its group is not found, or there is no library', () => {
    expect(runInOwnGroup(tree, '/L/Z/x')).toEqual(['/L/Z/x'])
    expect(runInOwnGroup(undefined, '/x')).toEqual(['/x'])
  })

  it('has changes when any sheet of the run is unsaved', () => {
    expect(tabHasChanges(tree, ['/L/A/b'], '/L/A/a')).toBe(true)
    expect(tabHasChanges(tree, ['/L/A/d'], '/L/A/a')).toBe(false)
    expect(tabHasChanges(tree, [], '/L/A/a')).toBe(false)
  })

  it('names a sheet by title, else by file name', () => {
    expect(sheetName(new Map([['/L/A/a', 'Apple']]), '/L/A/a')).toBe('Apple')
    expect(sheetName(new Map(), '/L/A/a.md')).toBe('a.md')
  })
})
