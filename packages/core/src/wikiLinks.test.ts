import { describe, expect, it } from 'vitest'
import { backlinksTo, completeTitles, findWikiLinks, linkTargets, resolveWikiLink } from './wikiLinks'
import type { GroupNode, SheetNode } from './library'

const sheet = (title: string, links: string[] = []): SheetNode => ({
  kind: 'sheet', name: `${title}.md`, path: `/lib/${title}.md`, title, preview: '', glued: false, words: 0, images: [], links
})
const tree = (...children: SheetNode[]): GroupNode => ({ kind: 'group', name: 'lib', path: '/lib', children })

describe('findWikiLinks', () => {
  it('finds links with offsets, targets and labels', () => {
    const text = 'See [[Plot]] and [[Cast|the cast]].'
    const [a, b] = findWikiLinks(text)
    expect(text.slice(a!.from, a!.to)).toBe('[[Plot]]')
    expect(a!.target).toBe('Plot')
    expect(b).toMatchObject({ target: 'Cast', label: 'the cast' })
  })
  it('skips code fences and inline code', () => {
    expect(findWikiLinks('`[[a]]`\n```\n[[b]]\n```\n[[c]]').map((l) => l.target)).toEqual(['c'])
  })
  it('ignores empty and unfinished links', () => {
    expect(findWikiLinks('[[]] [[open and [[ok]]').map((l) => l.target)).toEqual(['ok'])
  })
  it('lists distinct targets', () => {
    expect(linkTargets('[[A]] [[A|x]] [[B]]')).toEqual(['A', 'B'])
  })
})

describe('resolving and backlinks', () => {
  const root = tree(sheet('Plot', ['Cast']), sheet('Cast', ['plot ']), sheet('Notes', ['Plot', 'Cast']))
  it('resolves by title ignoring case and spacing', () => {
    expect(resolveWikiLink(root, ' cast ')).toBe('/lib/Cast.md')
    expect(resolveWikiLink(root, 'Nope')).toBeNull()
  })
  it('finds the sheets linking to one', () => {
    expect(backlinksTo(root, '/lib/Plot.md').map((b) => b.title)).toEqual(['Cast', 'Notes'])
    expect(backlinksTo(root, '/lib/Notes.md')).toEqual([])
  })
  it('does not count a sheet linking to itself', () => {
    expect(backlinksTo(tree(sheet('A', ['A'])), '/lib/A.md')).toEqual([])
  })
  it('completes titles, prefix matches first', () => {
    expect(completeTitles(root, 'c')).toEqual(['Cast', 'Notes'].slice(0, 1))
    expect(completeTitles(tree(sheet('Zed'), sheet('Red'), sheet('Edit')), 'ed')).toEqual(['Edit', 'Zed', 'Red'])
  })
})
