import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { paragraphLines, sentenceBounds } from './focusMode'

const state = EditorState.create({ doc: 'a\nb\n\nc\nd\ne\n\n\nf' })
const at = (line: number): number => state.doc.line(line).from

describe('paragraphLines', () => {
  it('spans the non-blank lines around the cursor', () => {
    expect(paragraphLines(state, at(1))).toEqual({ first: 1, last: 2 })
    expect(paragraphLines(state, at(5))).toEqual({ first: 4, last: 6 })
    expect(paragraphLines(state, at(9))).toEqual({ first: 9, last: 9 })
  })

  it('is just the line itself when the cursor is on a blank line', () => {
    expect(paragraphLines(state, at(3))).toEqual({ first: 3, last: 3 })
    expect(paragraphLines(state, at(8))).toEqual({ first: 8, last: 8 })
  })
})

describe('sentenceBounds', () => {
  const text = 'First one. Second, longer one! "Third?" Fourth without end'
  const slice = (pos: number): string => {
    const { from, to } = sentenceBounds(text, pos)
    return text.slice(from, to)
  }

  it('finds the sentence around the cursor', () => {
    expect(slice(2)).toBe('First one.')
    expect(slice(text.indexOf('longer'))).toBe('Second, longer one!')
    expect(slice(text.indexOf('Third'))).toBe('"Third?"')
  })

  it('treats the last, unfinished sentence as a sentence', () => {
    expect(slice(text.length)).toBe('Fourth without end')
  })

  it('keeps a cursor in the space between sentences with the one before', () => {
    expect(slice(text.indexOf('. ') + 1)).toBe('First one.')
    expect(slice(text.indexOf(' Second'))).toBe('First one.')
  })

  it('handles text with no sentence end', () => {
    expect(sentenceBounds('just words', 4)).toEqual({ from: 0, to: 10 })
  })
})
