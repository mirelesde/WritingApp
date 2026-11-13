import { describe, expect, it } from 'vitest'
import { inlineSpans } from './inlineMarks'

describe('inlineSpans', () => {
  it('leaves plain text alone', () => {
    expect(inlineSpans('just text')).toEqual([
      { text: 'just text', marks: [], bold: false, italic: false, strike: false, code: false }
    ])
  })

  it('finds bold, italic and bold italic', () => {
    const spans = inlineSpans('a **b** *c* ***d***')
    expect(spans.map((s) => [s.text, s.marks[0], s.bold, s.italic])).toEqual([
      ['a ', undefined, false, false],
      ['b', '**', true, false],
      [' ', undefined, false, false],
      ['c', '*', false, true],
      [' ', undefined, false, false],
      ['d', '***', true, true]
    ])
  })

  it('finds strikethrough and code', () => {
    const spans = inlineSpans('~~x~~ `y`')
    expect(spans[0]).toMatchObject({ text: 'x', strike: true })
    expect(spans[2]).toMatchObject({ text: 'y', code: true })
  })

  it('does not treat snake_case or lone asterisks as emphasis', () => {
    expect(inlineSpans('snake_case_name')).toHaveLength(1)
    expect(inlineSpans('2 * 3 * 4')).toHaveLength(1)
  })

  it('handles an unclosed mark as text', () => {
    expect(inlineSpans('**open').map((s) => s.text).join('')).toBe('**open')
  })
})
