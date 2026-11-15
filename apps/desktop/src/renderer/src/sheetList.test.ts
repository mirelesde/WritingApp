import { describe, expect, it } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import type { LibraryInfo } from '../../preload/api'
import { SheetList } from './sheetList.svelte'

const sheet = (path: string, title: string, keywords: string[] = []): SheetNode =>
  ({ kind: 'sheet', path, name: title, title, preview: '', links: [], keywords, glued: false }) as unknown as SheetNode
const sub = { kind: 'group', path: '/L/A/B', name: 'B', children: [sheet('/L/A/B/c', 'Cat')] } as unknown as GroupNode
const group = {
  kind: 'group',
  path: '/L/A',
  name: 'A',
  children: [sheet('/L/A/a', 'Apple', ['fruit']), sheet('/L/A/b', 'Banana'), sub]
} as unknown as GroupNode
const tree = { kind: 'group', path: '/L', name: 'L', children: [group] } as unknown as GroupNode

function make(): SheetList {
  return new SheetList({
    library: () => ({ path: '/L', tree }) as unknown as LibraryInfo,
    group: () => group,
    sortBy: () => 'manual'
  })
}

describe('SheetList', () => {
  it('lists the group, then the groups inside it', () => {
    const l = make()
    expect(l.listed.map((s) => s.path)).toEqual(['/L/A/a', '/L/A/b', '/L/A/B/c'])
    expect(l.paths).toEqual(l.listed.map((s) => s.path))
    expect(l.keywordMode).toBe(false)
  })

  it('narrows the list to the sheets that match the filter', () => {
    const l = make()
    l.filter = 'ban'
    expect(l.paths).toEqual(['/L/A/b'])
    expect(l.listed).toHaveLength(3)
  })

  it('switches to the whole library when the filter names a keyword', () => {
    const l = make()
    l.filter = '#fruit'
    expect(l.keywordMode).toBe(true)
    expect(l.knownKeywords).toEqual([{ keyword: 'fruit', count: 1 }])
    expect(l.paths).toEqual(['/L/A/a'])
  })

  it('says where a sheet is, and whether the list has it', () => {
    const l = make()
    expect(l.whereIs('/L/A/B/c')).toContain('B')
    expect(l.has('/L/A/a')).toBe(true)
    expect(l.has('/nope')).toBe(false)
  })

  it('keeps a card in step with typed text', () => {
    const l = make()
    l.edited('/L/A/a', '# Pear\n\nsome words here')
    const card = l.listed.find((s) => s.path === '/L/A/a')!
    expect(card.title).toBe('Pear')
    expect(card.preview).toContain('some words')
    l.edited('/nope', 'x')
  })
})
