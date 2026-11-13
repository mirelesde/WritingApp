import { describe, expect, it } from 'vitest'
import type { SheetNode } from './library'
import { sortSheets } from './sheetSort'

const sheet = (title: string, extra: Partial<SheetNode> = {}): SheetNode => ({
  kind: 'sheet', name: `${title}.md`, path: `/${title}.md`, title, preview: '', glued: false, words: 0, ...extra
})
const titles = (s: SheetNode[]): string[] => s.map((x) => x.title)

describe('sortSheets', () => {
  const list = [
    sheet('b2', { words: 5, modified: 10, created: 3 }),
    sheet('a', { words: 50, modified: 30 }),
    sheet('b10', { words: 20, modified: 20, created: 9 })
  ]
  it('keeps the saved order for manual', () => expect(sortSheets(list, 'manual')).toBe(list))
  it('sorts by title, numbers naturally', () => expect(titles(sortSheets(list, 'title'))).toEqual(['a', 'b2', 'b10']))
  it('sorts by words, longest first', () => expect(titles(sortSheets(list, 'words'))).toEqual(['a', 'b10', 'b2']))
  it('sorts by date, newest first, undated last', () => {
    expect(titles(sortSheets(list, 'modified'))).toEqual(['a', 'b10', 'b2'])
    expect(titles(sortSheets(list, 'created'))).toEqual(['b10', 'b2', 'a'])
  })
  it('does not change the input', () => {
    sortSheets(list, 'title')
    expect(titles(list)).toEqual(['b2', 'a', 'b10'])
  })
})
