import { describe, expect, it } from 'vitest'
import {
  addFootnoteChanges,
  findFootnoteDefs,
  findFootnoteRefs,
  nextFootnoteId,
  removeFootnoteChanges,
  setFootnoteChange,
  stripFootnotes,
  type TextChange
} from './footnotes'

const apply = (text: string, changes: TextChange[]): string =>
  [...changes].sort((a, b) => b.from - a.from).reduce(
    (t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to),
    text
  )

const DOC = 'Hello[^1] world[^note].\n\n[^1]: First note.\n[^note]: Second\n    more lines\n'

describe('finding footnotes', () => {
  it('finds references, not definition labels', () => {
    expect(findFootnoteRefs(DOC).map((r) => r.id)).toEqual(['1', 'note'])
  })

  it('finds definitions with their continuation lines', () => {
    const defs = findFootnoteDefs(DOC)
    expect(defs.map((d) => [d.id, d.text])).toEqual([
      ['1', 'First note.'],
      ['note', 'Second\nmore lines']
    ])
    expect(DOC.slice(defs[1]!.from, defs[1]!.to)).toBe('[^note]: Second\n    more lines')
  })

  it('ignores code fences', () => {
    expect(findFootnoteRefs('```\n[^1]\n```')).toEqual([])
    expect(findFootnoteDefs('```\n[^1]: x\n```')).toEqual([])
  })

  it('picks the next free number', () => {
    expect(nextFootnoteId('')).toBe('1')
    expect(nextFootnoteId('a[^1] b[^3]')).toBe('2')
  })
})

describe('editing footnotes', () => {
  it('adds a reference and an empty definition at the end', () => {
    const { changes, id, refEnd, noteAt } = addFootnoteChanges('Some text.', 4)
    const next = apply('Some text.', changes)
    expect(id).toBe('1')
    expect(next).toBe('Some[^1] text.\n\n[^1]: ')
    expect(next.slice(0, refEnd)).toBe('Some[^1]')
    expect(noteAt).toBe(next.length)
  })

  it('keeps definitions together', () => {
    const next = apply('A[^1]\n\n[^1]: one', addFootnoteChanges('A[^1]\n\n[^1]: one', 1).changes)
    expect(next).toBe('A[^2][^1]\n\n[^1]: one\n[^2]: ')
  })

  it('sets and creates note text', () => {
    expect(apply(DOC, [setFootnoteChange(DOC, '1', 'Changed.')])).toContain('[^1]: Changed.\n[^note]')
    expect(apply('A[^2]', [setFootnoteChange('A[^2]', '2', 'New')])).toBe('A[^2]\n\n[^2]: New')
    expect(apply('x', [setFootnoteChange('x', '1', 'a\nb')])).toBe('x\n\n[^1]: a\n    b')
  })

  it('removes references and the definition', () => {
    const next = apply(DOC, removeFootnoteChanges(DOC, 'note'))
    expect(next).toBe('Hello[^1] world.\n\n[^1]: First note.\n')
  })

  it('strips footnotes for previews', () => {
    expect(stripFootnotes(DOC).trim()).toBe('Hello world.')
  })
})

describe('footnotes elsewhere', () => {
  it('leaves them out of sheet previews', async () => {
    const { sheetPreview } = await import('./sheet')
    expect(sheetPreview('# T\n\nHello[^1] world.\n\n[^1]: A note')).toBe('Hello world.')
  })

  it('numbers them in exported HTML', async () => {
    const { markdownToHtml } = await import('./export')
    const html = markdownToHtml('One[^b] two[^a].\n\n[^a]: Alpha\n[^b]: Beta')
    expect(html).toContain('<a href="#fn-1" id="fnref-1">1</a>')
    expect(html).toContain('<li id="fn-1">Beta')
    expect(html).toContain('<li id="fn-2">Alpha')
    expect(html).not.toContain('[^')
  })
})
