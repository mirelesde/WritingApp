import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { backspaceInBrackets, typedPair } from './pairs'

/** Types `typed` at the `|` in `doc` (with `[a,b]` selection support via `{from,to}`). */
function type(doc: string, typed: string): string {
  const cursor = doc.indexOf('|')
  const state = EditorState.create({ doc: doc.replace('|', '') })
  const spec = typedPair(state, cursor, cursor, typed)
  if (!spec) return doc.replace('|', typed + '|')
  const next = state.update(spec).state
  const head = next.selection.main.head
  return next.doc.toString().slice(0, head) + '|' + next.doc.toString().slice(head)
}

describe('typing a bracket, quote or backtick', () => {
  it('closes brackets and leaves the cursor between', () => {
    expect(type('|', '(')).toBe('(|)')
    expect(type('see |', '[')).toBe('see [|]')
    expect(type('|', '{')).toBe('{|}')
  })

  it('closes quotes and backticks after a space or at the start', () => {
    expect(type('say |', '"')).toBe('say "|"')
    expect(type('|', '`')).toBe('`|`')
  })

  it('leaves quotes and backticks inside a word alone', () => {
    expect(type('5|', '"')).toBe('5"|')
    expect(type('word|', '`')).toBe('word`|')
  })

  it('steps over a closing character that is already there', () => {
    expect(type('(a|)', ')')).toBe('(a)|')
    expect(type('"a|"', '"')).toBe('"a"|')
    expect(type('`a|`', '`')).toBe('`a`|')
  })

  it('does not close a bracket before a word', () => {
    expect(type('|word', '(')).toBe('(|word')
  })

  it('lets three backticks through for a code fence', () => {
    let doc = '|'
    for (let i = 0; i < 3; i++) doc = type(doc, '`')
    expect(doc).toBe('```|')
  })

  it('wraps a selection and keeps it selected', () => {
    const state = EditorState.create({ doc: 'a word b' })
    const next = state.update(typedPair(state, 2, 6, '(')!).state
    expect(next.doc.toString()).toBe('a (word) b')
    expect(next.selection.main.from).toBe(3)
    expect(next.selection.main.to).toBe(7)
  })

  it('ignores other characters', () => {
    expect(type('|', 'a')).toBe('a|')
    expect(typedPair(EditorState.create({ doc: 'x' }), 0, 1, 'a')).toBeNull()
  })
})

describe('Backspace in an empty pair', () => {
  it('removes both characters', () => {
    const state = EditorState.create({ doc: 'a()', selection: { anchor: 2 } })
    expect(state.update(backspaceInBrackets(state)!).state.doc.toString()).toBe('a')
  })

  it('leaves a non-empty or mismatched pair alone', () => {
    const state = EditorState.create({ doc: '(a)', selection: { anchor: 2 } })
    expect(backspaceInBrackets(state)).toBeNull()
    const mixed = EditorState.create({ doc: '(]', selection: { anchor: 1 } })
    expect(backspaceInBrackets(mixed)).toBeNull()
  })
})
