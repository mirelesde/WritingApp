import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { backspaceInPair, typedMarker, typedSpace } from './emphasis'

/** Types `typed` at the `|` in `doc`, applying the same rule the editor does. */
function type(doc: string, typed: string): string {
  const cursor = doc.indexOf('|')
  const text = doc.replace('|', '')
  const state = EditorState.create({ doc: text })
  const spec = typed === ' ' ? typedSpace(state, cursor, cursor) : typedMarker(state, cursor, cursor, typed)
  if (!spec) return doc.replace('|', typed + '|') // the plain insert
  const next = state.update(spec).state
  const head = next.selection.main.head
  return next.doc.toString().slice(0, head) + '|' + next.doc.toString().slice(head)
}

describe('typing an emphasis marker', () => {
  it('closes a single star and leaves the cursor between', () => {
    expect(type('|', '*')).toBe('*|*')
    expect(type('some |', '*')).toBe('some *|*')
  })

  it('widens an empty pair into bold', () => {
    expect(type('*|*', '*')).toBe('**|**')
  })

  it('steps over the closing markers when they are typed', () => {
    expect(type('**bold|**', '*')).toBe('**bold*|*')
    expect(type('**bold*|*', '*')).toBe('**bold**|')
    expect(type('*it|*', '*')).toBe('*it*|')
  })

  it('steps over a closer that follows punctuation instead of widening', () => {
    expect(type('**Wow!*|*', '*')).toBe('**Wow!**|')
  })

  it('works for underscores too', () => {
    expect(type('|', '_')).toBe('_|_')
    expect(type('_it|_', '_')).toBe('_it_|')
  })

  it('does not close inside a word or before a word', () => {
    expect(type('2|', '*')).toBe('2*|')
    expect(type('snake|', '_')).toBe('snake_|')
    expect(type('|word', '*')).toBe('*|word')
  })

  it('does not close right after another marker', () => {
    expect(type('*it*|', '*')).toBe('*it**|')
  })

  it('wraps the selection and keeps it selected', () => {
    const state = EditorState.create({ doc: 'make bold now' })
    const next = state.update(typedMarker(state, 5, 9, '*')!).state
    expect(next.doc.toString()).toBe('make *bold* now')
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe('bold')
    // typing again wraps it a second time, giving bold
    const again = next.update(
      typedMarker(next, next.selection.main.from, next.selection.main.to, '*')!
    ).state
    expect(again.doc.toString()).toBe('make **bold** now')
  })

  it('ignores other characters', () => {
    const state = EditorState.create({ doc: '' })
    expect(typedMarker(state, 0, 0, 'a')).toBeNull()
  })
})

describe('list bullets', () => {
  it('takes back the closing star when a space follows a line-start star', () => {
    expect(type('*|*', ' ')).toBe('* |')
    expect(type('  *|*', ' ')).toBe('  * |')
  })

  it('leaves a space inside real emphasis alone', () => {
    expect(type('word *a|*', ' ')).toBe('word *a |*')
    expect(type('*a|*', ' ')).toBe('*a |*')
  })
})

describe('Backspace in a pair', () => {
  function backspace(doc: string): string {
    const cursor = doc.indexOf('|')
    const state = EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: cursor } })
    const spec = backspaceInPair(state)
    if (!spec) return doc
    const next = state.update(spec).state
    const head = next.selection.main.head
    return next.doc.toString().slice(0, head) + '|' + next.doc.toString().slice(head)
  }

  it('removes an empty pair', () => {
    expect(backspace('a *|* b')).toBe('a | b')
  })

  it('peels one level off an empty bold pair', () => {
    expect(backspace('**|**')).toBe('*|*')
  })

  it('leaves non-empty emphasis alone', () => {
    expect(backspace('*a|*')).toBe('*a|*')
    expect(backspace('**Wow!*|*')).toBe('**Wow!*|*')
  })
})
