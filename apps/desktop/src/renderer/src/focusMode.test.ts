import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { paragraphLines } from './focusMode'

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
