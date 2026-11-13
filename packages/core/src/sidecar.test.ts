import { describe, expect, it } from 'vitest'
import type { DirEntry } from './filesystem'
import { isVisibleEntry, parseSidecar, reconcileFolder, type Sidecar } from './sidecar'

const f = (name: string): DirEntry => ({ name, kind: 'file' })
const d = (name: string): DirEntry => ({ name, kind: 'directory' })
const sc = (order: string[] = [], glued: string[] = []): Sidecar => ({ version: 1, order, glued })
const names = (r: { children: DirEntry[] }) => r.children.map((c) => c.name)

describe('parseSidecar', () => {
  it('reads a well-formed sidecar', () => {
    const text = JSON.stringify({ version: 1, order: ['a.md', 'G'], glued: ['a.md'] })
    expect(parseSidecar(text)).toEqual(sc(['a.md', 'G'], ['a.md']))
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed JSON', '{"order": ['],
    ['a JSON array', '[]'],
    ['a JSON string', '"hi"'],
    ['null', 'null'],
  ])('yields an empty sidecar when %s', (_label, text) => {
    expect(parseSidecar(text)).toEqual(sc())
  })

  it('ignores fields of the wrong type and non-string items', () => {
    expect(parseSidecar('{"order": "a.md", "glued": [1, "b.md", null]}')).toEqual(sc([], ['b.md']))
  })

  it('tolerates unknown extra fields and versions', () => {
    expect(parseSidecar('{"version": 9, "order": ["a.md"], "future": true}')).toEqual(sc(['a.md']))
  })
})

describe('isVisibleEntry', () => {
  it('shows folders and .md files only, never dotfiles', () => {
    expect(isVisibleEntry(f('a.md'))).toBe(true)
    expect(isVisibleEntry(d('Part One'))).toBe(true)
    expect(isVisibleEntry(f('a.txt'))).toBe(false)
    expect(isVisibleEntry(f('.writingapp.json'))).toBe(false)
    expect(isVisibleEntry(f('.hidden.md'))).toBe(false)
    expect(isVisibleEntry(d('.git'))).toBe(false)
  })
})

describe('reconcileFolder', () => {
  it('follows sidecar order, mixing sheets and groups', () => {
    const r = reconcileFolder(sc(['b.md', 'G', 'a.md']), [f('a.md'), f('b.md'), d('G')])
    expect(names(r)).toEqual(['b.md', 'G', 'a.md'])
  })

  it('puts unlisted entries last, in name order', () => {
    const r = reconcileFolder(sc(['b.md']), [f('z.md'), f('b.md'), d('Alpha'), f('m.md')])
    expect(names(r)).toEqual(['b.md', 'Alpha', 'm.md', 'z.md'])
  })

  it('sorts unlisted names case-insensitively and numerically', () => {
    const r = reconcileFolder(sc(), [f('chapter10.md'), f('Chapter2.md'), f('banana.md')])
    expect(names(r)).toEqual(['banana.md', 'Chapter2.md', 'chapter10.md'])
  })

  it('drops listed entries whose file is gone', () => {
    const r = reconcileFolder(sc(['gone.md', 'a.md']), [f('a.md')])
    expect(names(r)).toEqual(['a.md'])
  })

  it('ignores duplicates in the sidecar', () => {
    const r = reconcileFolder(sc(['a.md', 'a.md', 'b.md']), [f('a.md'), f('b.md')])
    expect(names(r)).toEqual(['a.md', 'b.md'])
  })

  it('ignores hidden entries even if the sidecar lists them', () => {
    const r = reconcileFolder(sc(['.writingapp.json', 'notes.txt', 'a.md']), [
      f('.writingapp.json'),
      f('notes.txt'),
      f('a.md'),
      d('.git'),
    ])
    expect(names(r)).toEqual(['a.md'])
  })

  it('returns an empty folder for no entries', () => {
    expect(reconcileFolder(sc(['a.md'], ['a.md']), [])).toEqual({ children: [], glued: [] })
  })

  it('keeps a glue flag when the next child is a sheet', () => {
    const r = reconcileFolder(sc(['a.md', 'b.md'], ['a.md']), [f('a.md'), f('b.md')])
    expect(r.glued).toEqual(['a.md'])
  })

  it('drops glue on the last child', () => {
    const r = reconcileFolder(sc(['a.md', 'b.md'], ['b.md']), [f('a.md'), f('b.md')])
    expect(r.glued).toEqual([])
  })

  it('drops glue when the next child is a group', () => {
    const r = reconcileFolder(sc(['a.md', 'G'], ['a.md']), [f('a.md'), d('G')])
    expect(r.glued).toEqual([])
  })

  it('drops glue on a group, and on names that do not exist', () => {
    const r = reconcileFolder(sc(['G', 'a.md'], ['G', 'ghost.md']), [d('G'), f('a.md')])
    expect(r.glued).toEqual([])
  })

  it('drops glue when the file the sheet was glued to has been deleted', () => {
    // a was glued to b; b is gone, so a is now followed by a group.
    const r = reconcileFolder(sc(['a.md', 'b.md', 'G'], ['a.md']), [f('a.md'), d('G')])
    expect(r.glued).toEqual([])
  })

  it('treats an outside-added file as unlisted, so glue still applies to its neighbours', () => {
    const r = reconcileFolder(sc(['a.md', 'b.md'], ['a.md']), [f('a.md'), f('b.md'), f('new.md')])
    expect(names(r)).toEqual(['a.md', 'b.md', 'new.md'])
    expect(r.glued).toEqual(['a.md'])
  })
})

describe('colour', () => {
  it('is kept when valid and dropped when unknown', () => {
    expect(parseSidecar('{"color":"blue"}').color).toBe('blue')
    expect(parseSidecar('{"color":"chartreuse"}').color).toBeUndefined()
    expect(parseSidecar('{"color":5}').color).toBeUndefined()
  })
})
