import { describe, expect, it } from 'vitest'
import { sheetTitle, UNTITLED } from './sheet'

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
