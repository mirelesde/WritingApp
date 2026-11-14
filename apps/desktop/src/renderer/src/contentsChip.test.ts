import { describe, expect, it } from 'vitest'
import { insertContentsChange } from './contentsChip'

function apply(doc: string, pos: number): string | null {
  const r = insertContentsChange(doc, pos)
  if (!r) return null
  const c = r.changes as { from: number; to: number; insert: string }
  return doc.slice(0, c.from) + c.insert + doc.slice(c.to) + `|${r.cursor}`
}

describe('insertContentsChange', () => {
  it('fills an empty line', () => {
    expect(apply('', 0)).toBe('(cnt)\n\n|7')
  })
  it('goes after the current paragraph with blank lines', () => {
    expect(apply('# Title', 3)).toBe('# Title\n\n(cnt)\n\n|16')
  })
  it('does not stack blank lines before following text', () => {
    expect(apply('# T\n\n# U', 3)).toBe('# T\n\n(cnt)\n\n# U|12')
  })
  it('does nothing on a (cnt) line', () => {
    expect(insertContentsChange('(cnt)', 2)).toBeNull()
  })
})
