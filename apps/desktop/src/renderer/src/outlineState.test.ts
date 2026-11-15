import { describe, expect, it } from 'vitest'
import type { LibraryInfo } from '../../preload/api'
import { OutlineState, type OutlineHost } from './outlineState.svelte'

function setup(over: Partial<OutlineHost> = {}): { out: OutlineState; jumps: [string, number][]; edits: Record<string, string> } {
  const jumps: [string, number][] = []
  const edits: Record<string, string> = {}
  const parts = [
    { path: 'a', text: '# One\n\ntext\n\n## Two' },
    { path: 'b', text: '# Three' }
  ]
  const out = new OutlineState({
    parts: () => parts,
    edited: (p) => edits[p],
    library: () => null as LibraryInfo | null,
    selected: () => [],
    goTo: (p, o) => void jumps.push([p, o]),
    ...over
  })
  return { out, jumps, edits }
}

describe('OutlineState', () => {
  it('lists the headings of every open sheet, tagged with the sheet', () => {
    const { out } = setup()
    expect(out.entries.map((e) => [e.path, e.text])).toEqual([
      ['a', 'One'],
      ['a', 'Two'],
      ['b', 'Three']
    ])
  })

  it('is empty when nothing is open', () => {
    expect(setup({ parts: () => undefined }).out.entries).toEqual([])
  })

  it('uses text typed since loading in place of the loaded text', () => {
    const { out, edits } = setup()
    edits['b'] = '# Renamed'
    expect(out.entries.map((e) => e.text)).toContain('Renamed')
  })

  it('finds the heading the cursor is under, by its sheet and index', () => {
    const { out } = setup()
    expect(out.current).toBeNull()
    out.moved('a', 1)
    expect(out.current?.text).toBe('Two')
    out.moved('b', 0)
    expect(out.current?.text).toBe('Three')
    out.moved('b', 5)
    expect(out.current).toBeNull()
  })

  it('jumps the editor to a heading', () => {
    const { out, jumps } = setup()
    const entry = out.entries[1]!
    out.goTo(entry)
    expect(jumps).toEqual([['a', entry.offset]])
  })

  it('shows no backlinks without a library or with several sheets selected', () => {
    expect(setup().out.backlinks).toEqual([])
    expect(setup({ selected: () => ['a', 'b'] }).out.backlinks).toEqual([])
  })
})
