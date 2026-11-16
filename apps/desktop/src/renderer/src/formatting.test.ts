import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { insertLink, insertParagraphBreak, toggleComment, toggleEmphasis } from './formatting'

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

  it('keeps the marks off spaces and line breaks at the edges of the selection', () => {
    expect(apply('a [two words ] b', italic)).toBe('a *[two words]*  b')
    expect(apply('[one line\n]next', italic)).toBe('*[one line]*\nnext')
  })

  it('marks each line of a selection, leaving list and heading markers alone', () => {
    expect(apply('[one\n\ntwo]', italic)).toBe('*[one*\n\n*two]*')
    expect(apply('[- one\n- two]', italic)).toBe('- *[one*\n- *two]*')
    expect(apply('[# Title]', bold)).toBe('# **[Title]**')
  })

  it('takes the marks off again however many times it is pressed', () => {
    let text = 'a [two words\n]b'
    const seen: string[] = []
    for (let i = 0; i < 4; i++) seen.push((text = apply(text, italic)))
    expect(seen).toEqual(['a *[two words]*\nb', 'a [two words]\nb', 'a *[two words]*\nb', 'a [two words]\nb'])
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

describe('commenting out', () => {
  /** `[` `]` mark the selection and `|` the cursor in `doc`; the result is written the same way. */
  function toggle(doc: string): string {
    const from = doc.indexOf('[')
    const rest = doc.replace('[', '')
    const to = rest.indexOf(']')
    const sel = from !== -1 && to !== -1
    const text = sel ? rest.replace(']', '') : doc.replace('|', '')
    const state = EditorState.create({
      doc: text,
      selection: sel ? EditorSelection.range(from, to) : EditorSelection.cursor(doc.indexOf('|')),
      extensions: markdown({ base: markdownLanguage })
    })
    const spec = toggleComment(state)
    if (!spec) return doc
    const next = state.update(spec).state
    const r = next.selection.main
    const out = next.doc.toString()
    return r.empty
      ? out.slice(0, r.head) + '|' + out.slice(r.head)
      : out.slice(0, r.from) + '[' + out.slice(r.from, r.to) + ']' + out.slice(r.to)
  }

  it('comments out the selection and keeps it selected', () => {
    expect(toggle('a [secret] b')).toBe('a <!-- [secret] --> b')
  })

  it('comments out the whole line when nothing is selected', () => {
    expect(toggle('first\nsecond li|ne\nthird')).toBe('first\n<!-- second line| -->\nthird')
  })

  it('keeps indentation outside the comment', () => {
    expect(toggle('  - item|')).toBe('  <!-- - item| -->')
  })

  it('opens an empty comment on an empty line', () => {
    expect(toggle('|')).toBe('<!-- | -->')
  })

  it('takes a comment off when the cursor is in it', () => {
    expect(toggle('a <!-- se|cret --> b')).toBe('a [secret] b')
  })

  it('takes a comment off when it is selected', () => {
    expect(toggle('a [<!-- secret -->] b')).toBe('a [secret] b')
  })

  it('comments out whole lines when the selection spans lines', () => {
    expect(toggle('x\n[one\ntwo]\ny')).toBe('x\n<!-- [one\ntwo] -->\ny')
  })

  it('does nothing where comments would nest', () => {
    expect(toggle('[a <!-- b --> c]')).toBe('[a <!-- b --> c]')
  })
})

describe('insertParagraphBreak', () => {
  it('splits the text with a blank line and puts the cursor after it', () => {
    const state = EditorState.create({ doc: 'onetwo', selection: { anchor: 3 } })
    const next = state.update(insertParagraphBreak(state)).state
    expect(next.doc.toString()).toBe('one\n\ntwo')
    expect(next.selection.main.head).toBe(5)
  })
  it('replaces a selection', () => {
    const state = EditorState.create({ doc: 'one two', selection: { anchor: 3, head: 4 } })
    expect(state.update(insertParagraphBreak(state)).state.doc.toString()).toBe('one\n\ntwo')
  })
})
