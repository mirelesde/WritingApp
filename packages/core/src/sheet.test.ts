import { describe, expect, it } from 'vitest'
import { sheetPreview, sheetTitle, UNTITLED } from './sheet'

describe('sheetTitle', () => {
  it('uses the first line', () => {
    expect(sheetTitle('The Station\n\nIt was raining.')).toBe('The Station')
  })

  it('strips a heading marker', () => {
    expect(sheetTitle('## The Station\ntext')).toBe('The Station')
  })

  it('skips leading blank lines', () => {
    expect(sheetTitle('\n  \r\n# Opening\n')).toBe('Opening')
  })

  it('keeps a hash that is not a heading', () => {
    expect(sheetTitle('#hashtag first')).toBe('#hashtag first')
  })

  it('falls back when the sheet is empty', () => {
    expect(sheetTitle('')).toBe(UNTITLED)
    expect(sheetTitle(' \n\n')).toBe(UNTITLED)
  })
})

describe('sheetPreview', () => {
  it('is the text after the title, on one line', () => {
    expect(sheetPreview('# Title\n\nIt was\nraining.')).toBe('It was raining.')
  })

  it('is empty when there is only a title or nothing', () => {
    expect(sheetPreview('Title')).toBe('')
    expect(sheetPreview('\n\n')).toBe('')
  })

  it('skips leading blank lines before the title', () => {
    expect(sheetPreview('\n\nTitle\nBody')).toBe('Body')
  })

  it('drops Markdown markers and comments', () => {
    expect(sheetPreview('T\n**Bold** and *it* with [a link](http://x.org) and `code`.')).toBe(
      'Bold and it with a link and code.'
    )
    expect(sheetPreview('T\n> quoted\n- [x] item\n1. first\n<!-- hidden -->\nend')).toBe(
      'quoted item first end'
    )
  })

  it('keeps underscores inside words', () => {
    expect(sheetPreview('T\nsnake_case and _em_ here')).toBe('snake_case and em here')
  })

  it('shows (Table) in place of a table', () => {
    expect(sheetPreview('T\nBefore\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter')).toBe(
      'Before (Table) After'
    )
    expect(sheetPreview('T\n\nTable: Stock\n\n| a |\n| - |\n| 1 |')).toBe('(Table)')
  })

  it('truncates long text with an ellipsis', () => {
    const preview = sheetPreview('T\n' + 'word '.repeat(100))
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBeLessThanOrEqual(201)
  })
})
