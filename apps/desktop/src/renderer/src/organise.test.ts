import { describe, expect, it } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import {
  dropZone,
  errorMessage,
  filterTargets,
  moveSlot,
  moveTargets,
  pathRange,
  remapPath,
  runOf,
  visibleGroups
} from './organise'

describe('remapPath', () => {
  const moved: [string, string][] = [['/Lib/Old', '/Lib/New']]

  it('maps the moved path itself and everything inside it', () => {
    expect(remapPath('/Lib/Old', moved)).toBe('/Lib/New')
    expect(remapPath('/Lib/Old/a.md', moved)).toBe('/Lib/New/a.md')
    expect(remapPath('/Lib/Old/Sub/a.md', moved)).toBe('/Lib/New/Sub/a.md')
  })

  it('leaves other paths alone, including ones sharing a prefix', () => {
    expect(remapPath('/Lib/Older/a.md', moved)).toBe('/Lib/Older/a.md')
    expect(remapPath('/Lib/other.md', moved)).toBe('/Lib/other.md')
  })

  it('handles several pairs', () => {
    const pairs: [string, string][] = [
      ['/Lib/a.md', '/Lib/G/a.md'],
      ['/Lib/b.md', '/Lib/G/b-2.md']
    ]
    expect(remapPath('/Lib/b.md', pairs)).toBe('/Lib/G/b-2.md')
  })
})

describe('errorMessage', () => {
  it('strips the IPC prefix', () => {
    const e = new Error(
      'Error invoking remote method \'op:renameGroup\': Error: "X" already exists'
    )
    expect(errorMessage(e)).toBe('"X" already exists')
  })

  it('passes other errors through', () => {
    expect(errorMessage(new Error('plain'))).toBe('plain')
    expect(errorMessage('text')).toBe('text')
  })
})

const group = (path: string, ...children: GroupNode['children']): GroupNode => ({
  kind: 'group',
  name: path.split('/').pop()!,
  path,
  children
})
const sheet = (path: string): GroupNode['children'][number] => ({
  kind: 'sheet',
  keywords: [],
  images: [], links: [],
  name: path.split('/').pop()!,
  path,
  title: '',
  preview: '',
  glued: false,
  words: 0
})

describe('visibleGroups', () => {
  const tree = group(
    '/L',
    sheet('/L/a.md'),
    group('/L/A', group('/L/A/x'), group('/L/A/y')),
    group('/L/B')
  )

  it('lists only the root when nothing is expanded', () => {
    expect(visibleGroups(tree, {}).map((v) => v.group.path)).toEqual(['/L'])
  })

  it('lists children of expanded groups in order, with their parents', () => {
    const list = visibleGroups(tree, { '/L': true, '/L/A': true })
    expect(list.map((v) => v.group.path)).toEqual(['/L', '/L/A', '/L/A/x', '/L/A/y', '/L/B'])
    expect(list[0]!.parent).toBeNull()
    expect(list[2]!.parent!.path).toBe('/L/A')
  })

  it('skips the children of a collapsed group', () => {
    const list = visibleGroups(tree, { '/L': true })
    expect(list.map((v) => v.group.path)).toEqual(['/L', '/L/A', '/L/B'])
  })
})

describe('moveSlot', () => {
  // The parent's order mixes sheets and groups; only sheets are shown.
  const children = ['a', 'G', 'b', 'c', 'H', 'd']
  const shown = ['a', 'b', 'c', 'd']

  it('moves up to just before the previous shown sibling', () => {
    expect(moveSlot(children, shown, ['c'], -1)).toBe(2) // rest: a G b H d; before b
  })

  it('moves down to just after the next shown sibling', () => {
    expect(moveSlot(children, shown, ['b'], 1)).toBe(3) // rest: a G c H d; after c
  })

  it('steps over hidden siblings in a single move', () => {
    expect(moveSlot(children, shown, ['d'], -1)).toBe(3) // rest: a G b H; before c, hopping over nothing hidden
  })

  it('moves a contiguous block as one', () => {
    expect(moveSlot(children, shown, ['b', 'c'], -1)).toBe(0) // before a
    expect(moveSlot(children, shown, ['b', 'c'], 1)).toBe(4) // rest: a G H d; after d
  })

  it('gathers a scattered selection when moving', () => {
    expect(moveSlot(children, shown, ['a', 'c'], 1)).toBe(4) // rest: G b H d; after d, the next shown sibling
  })

  it('reports nothing to do at either end', () => {
    expect(moveSlot(children, shown, ['a'], -1)).toBeUndefined()
    expect(moveSlot(children, shown, ['d'], 1)).toBeUndefined()
    expect(moveSlot(children, shown, ['a', 'd'], 1)).toBeUndefined()
  })

  it('does nothing for an empty selection', () => {
    expect(moveSlot(children, shown, [], 1)).toBeUndefined()
  })
})

describe('pathRange', () => {
  const list = ['a', 'b', 'c', 'd']
  it('includes both ends in list order', () => {
    expect(pathRange(list, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(pathRange(list, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(pathRange(list, 'c', 'c')).toEqual(['c'])
  })
  it('is empty for unknown paths', () => {
    expect(pathRange(list, 'x', 'b')).toEqual([])
  })
})

describe('moveTargets', () => {
  const tree = group('/L', group('/L/A', group('/L/A/x')), group('/L/B'))

  it('lists every group with a label from the root down', () => {
    expect(moveTargets(tree, [], '/none')).toEqual([
      { path: '/L', label: 'L' },
      { path: '/L/A', label: 'A' },
      { path: '/L/A/x', label: 'A › x' },
      { path: '/L/B', label: 'B' }
    ])
  })

  it('leaves out the current group', () => {
    expect(moveTargets(tree, [], '/L/B').map((t) => t.path)).toEqual(['/L', '/L/A', '/L/A/x'])
  })

  it('leaves out a moving group and everything inside it', () => {
    expect(moveTargets(tree, ['/L/A'], '/L').map((t) => t.path)).toEqual(['/L/B'])
  })
})

describe('filterTargets', () => {
  const targets = [
    { path: '/L/A', label: 'Novel' },
    { path: '/L/B', label: 'Novel › Part One' },
    { path: '/L/C', label: 'Essays › Part One' }
  ]

  it('returns everything for an empty query', () => {
    expect(filterTargets(targets, '  ')).toEqual(targets)
  })

  it('requires every word, in any order, ignoring case', () => {
    expect(filterTargets(targets, 'part novel').map((t) => t.path)).toEqual(['/L/B'])
    expect(filterTargets(targets, 'ESSAYS').map((t) => t.path)).toEqual(['/L/C'])
  })

  it('finds nothing when nothing matches', () => {
    expect(filterTargets(targets, 'zzz')).toEqual([])
  })
})

describe('dropZone', () => {
  it('splits a row into top edge, middle and bottom edge', () => {
    expect(dropZone(2, 30)).toBe('before')
    expect(dropZone(15, 30)).toBe('inside')
    expect(dropZone(28, 30)).toBe('after')
  })

  it('treats a zero-height row as the middle', () => {
    expect(dropZone(0, 0)).toBe('inside')
  })
})

describe('runOf', () => {
  const sheet = (path: string, glued = false): { kind: string; path: string; glued: boolean } => ({
    kind: 'sheet',
    path,
    glued
  })
  const children = [
    sheet('a', true),
    sheet('b', true),
    sheet('c'),
    sheet('d'),
    { kind: 'group', path: 'G', glued: false },
    sheet('e', true),
    sheet('f')
  ]

  it('returns the whole run from any member', () => {
    for (const member of ['a', 'b', 'c']) expect(runOf(children, member)).toEqual(['a', 'b', 'c'])
    expect(runOf(children, 'e')).toEqual(['e', 'f'])
    expect(runOf(children, 'f')).toEqual(['e', 'f'])
  })

  it('returns a lone sheet as a run of one', () => {
    expect(runOf(children, 'd')).toEqual(['d'])
  })

  it('does not run across a group, or for unknown paths', () => {
    expect(runOf([sheet('x', true), { kind: 'group', path: 'G' }, sheet('y')], 'x')).toEqual(['x'])
    expect(runOf(children, 'nope')).toEqual(['nope'])
  })
})
