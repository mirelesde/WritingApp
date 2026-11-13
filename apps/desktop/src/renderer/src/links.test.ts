import { EditorSelection } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { createEditorState } from './editor'
import { isOpenable, linkUrlAt, pasteAsLink } from './links'

const hooks = { onchange: () => {}, onblur: () => {} }

function paste(doc: string, from: number, to: number, pasted: string): string | null {
  let state = createEditorState(doc, hooks)
  state = state.update({ selection: EditorSelection.range(from, to) }).state
  const spec = pasteAsLink(state, pasted)
  return spec ? state.update(spec).state.doc.toString() : null
}

describe('pasting an address over a selection', () => {
  it('makes the selection a link', () => {
    expect(paste('see the article now', 4, 15, 'https://example.com/a?b=1')).toBe(
      'see [the article](https://example.com/a?b=1) now'
    )
  })

  it('ignores surrounding whitespace in the pasted address', () => {
    expect(paste('word', 0, 4, '  https://example.com \n')).toBe('[word](https://example.com)')
  })

  it('does nothing without a selection, for other text, or across lines', () => {
    expect(paste('word', 2, 2, 'https://example.com')).toBeNull()
    expect(paste('word', 0, 4, 'not a link')).toBeNull()
    expect(paste('a\nb', 0, 3, 'https://example.com')).toBeNull()
    expect(paste('word', 0, 4, 'javascript:alert(1)')).toBeNull()
  })
})

describe('finding the address of a link', () => {
  const state = createEditorState('go [here](https://example.com/x) or https://b.org', hooks)

  it('finds an inline link from its text or its address', () => {
    expect(linkUrlAt(state, 5)).toBe('https://example.com/x')
    expect(linkUrlAt(state, 15)).toBe('https://example.com/x')
  })

  it('finds a bare address and returns null elsewhere', () => {
    expect(linkUrlAt(state, 42)).toBe('https://b.org')
    expect(linkUrlAt(state, 1)).toBeNull()
  })

  it('only opens web and mail addresses', () => {
    expect(isOpenable('https://a.b')).toBe(true)
    expect(isOpenable('mailto:a@b.c')).toBe(true)
    expect(isOpenable('file:///etc/passwd')).toBe(false)
    expect(isOpenable('javascript:alert(1)')).toBe(false)
  })
})
