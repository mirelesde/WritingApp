import { ensureSyntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { endsInLineBreak, paragraphBreakSpec } from './breaks'

/** A state for `doc` with the cursor at `|`. */
function at(doc: string): EditorState {
  const pos = doc.indexOf('|')
  const state = EditorState.create({
    doc: doc.replace('|', ''),
    selection: { anchor: pos },
    extensions: [markdown({ base: markdownLanguage })]
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

const result = (doc: string): string | null => {
  const state = at(doc)
  const spec = paragraphBreakSpec(state)
  return spec ? state.update(spec).state.doc.toString() : null
}

describe('Return', () => {
  it('ends the paragraph with a blank line', () => {
    expect(result('one|two')).toBe('one\n\ntwo')
    expect(result('one two|')).toBe('one two\n\n')
  })
  it('leaves lists, quotes, headings and code to their own behaviour', () => {
    expect(result('- item|')).toBeNull()
    expect(result('> quote|')).toBeNull()
    expect(result('# Title|')).toBeNull()
    expect(result('```\ncode|\n```')).toBeNull()
  })
  it('adds a single line on an empty line', () => {
    expect(result('one\n\n|')).toBeNull()
  })
})

describe('soft line breaks', () => {
  it('knows a backslash or two spaces at the end of a line', () => {
    expect(endsInLineBreak('one\\')).toBe(true)
    expect(endsInLineBreak('one  ')).toBe(true)
    expect(endsInLineBreak('one\\\\')).toBe(false)
    expect(endsInLineBreak('one ')).toBe(false)
    expect(endsInLineBreak('   ')).toBe(false)
  })
})
