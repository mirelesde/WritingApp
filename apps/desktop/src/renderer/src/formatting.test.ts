import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { insertLink, toggleEmphasis } from './formatting'

/** Applies `spec` to `doc`, where `[` `]` mark the selection; returns the result in the same notation. */
function apply(
  doc: string,
  make: (state: EditorState) => ReturnType<typeof insertLink>
): string {
  const from = doc.indexOf('[')
  const rest = doc.replace('[', '')
  const to = rest.indexOf(']')
  const text = rest.replace(']', '')
  const hasSel = from !== -1 && to !== -1
  const cursor = doc.indexOf('|')
  const state = hasSel
    ? EditorState.create({ doc: text, selection: EditorSelection.range(from, to) })
    : EditorState.create({
        doc: doc.replace('|', ''),
        selection: EditorSelection.cursor(cursor)
      })
  const next = state.update(make(state)).state
  const r = next.selection.main
  const out = next.doc.toString()
  return r.empty
    ? out.slice(0, r.head) + '|' + out.slice(r.head)
    : out.slice(0, r.from) + '[' + out.slice(r.from, r.to) + ']' + out.slice(r.to)
}

const bold = (s: EditorState): ReturnType<typeof insertLink> => toggleEmphasis(s, 2)
const italic = (s: EditorState): ReturnType<typeof insertLink> => toggleEmphasis(s, 1)

describe('bold and italic', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(apply('make [this] bold', bold)).toBe('make **[this]** bold')
    expect(apply('make [this] slanted', italic)).toBe('make *[this]* slanted')
  })

  it('unwraps when the selection is already wrapped', () => {
    expect(apply('a **[this]** b', bold)).toBe('a [this] b')
    expect(apply('a *[this]* b', italic)).toBe('a [this] b')
  })

  it('unwraps when the markers are inside the selection', () => {
    expect(apply('a [**this**] b', bold)).toBe('a [this] b')
  })

  it('adds italic on top of bold, and removes only the requested level', () => {
    expect(apply('**[this]**', italic)).toBe('***[this]***')
    expect(apply('***[this]***', italic)).toBe('**[this]**')
    expect(apply('***[this]***', bold)).toBe('*[this]*')
  })

  it('adds bold on top of italic', () => {
    expect(apply('*[this]*', bold)).toBe('***[this]***')
  })

  it('wraps the word at the cursor when nothing is selected', () => {
    expect(apply('make thi|s bold', bold)).toBe('make **[this]** bold')
  })

  it('inserts an empty pair between words', () => {
    expect(apply('a |', bold)).toBe('a **|**')
    expect(apply('a |', italic)).toBe('a *|*')
  })
})

describe('links', () => {
  it('wraps the selection and selects the placeholder address', () => {
    expect(apply('see [the docs] now', insertLink)).toBe('see [the docs]([url]) now')
  })

  it('uses a selected web address as the target', () => {
    expect(apply('see [https://example.com] now', insertLink)).toBe(
      'see [|](https://example.com) now'
    )
  })

  it('inserts an empty link with the cursor in the label', () => {
    expect(apply('go |', insertLink)).toBe('go [|](url)')
  })
})
