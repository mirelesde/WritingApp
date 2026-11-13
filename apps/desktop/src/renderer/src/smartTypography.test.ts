import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { createEditorState } from './editor'
import { typedSmart } from './smartTypography'

const hooks = { onchange: () => {}, onblur: () => {} }

/** Types `typed` at the `|` in `doc`, returning the text with `|` at the new cursor. */
function type(doc: string, typed: string): string {
  const cursor = doc.indexOf('|')
  const state: EditorState = createEditorState(doc.replace('|', ''), hooks)
  const spec = typedSmart(state, cursor, cursor, typed)
  if (!spec) return doc.replace('|', typed + '|')
  const next = state.update(spec).state
  const head = next.selection.main.head
  return next.doc.toString().slice(0, head) + '|' + next.doc.toString().slice(head)
}

describe('smart quotes', () => {
  it('opens with a curly pair and closes by stepping over', () => {
    expect(type('say |', '"')).toBe('say “|”')
    expect(type('say “hi|”', '"')).toBe('say “hi”|')
  })

  it('closes a quote that follows a word', () => {
    expect(type('he said “yes|', '"')).toBe('he said “yes”|')
    expect(type('(“yes|', '"')).toBe('(“yes”|')
  })

  it('does not pair an opening quote before a word', () => {
    expect(type('|word', '"')).toBe('“|word')
  })

  it('makes apostrophes right single quotes and opens single quotes after a space', () => {
    expect(type("don|", "'")).toBe('don’|')
    expect(type("say |", "'")).toBe('say ‘|')
  })

  it('wraps a selection', () => {
    const state = createEditorState('a word b', hooks)
    const next = state.update(typedSmart(state, 2, 6, '"')!).state
    expect(next.doc.toString()).toBe('a “word” b')
  })
})

describe('dashes and ellipses', () => {
  it('turns -- into an en dash and --- into an em dash', () => {
    expect(type('pages 1-|', '-')).toBe('pages 1–|')
    expect(type('so – |', '-')).toBe('so – -|')
    expect(type('wait–|', '-')).toBe('wait—|')
  })

  it('leaves Markdown syntax at the start of a line alone', () => {
    expect(type('-|', '-')).toBe('--|')
    expect(type('--|', '-')).toBe('---|')
    expect(type('  - |', '-')).toBe('  - -|')
  })

  it('turns three dots into an ellipsis', () => {
    expect(type('wait..|', '.')).toBe('wait…|')
    expect(type('wait.|', '.')).toBe('wait..|')
    expect(type('wait...|', '.')).toBe('wait....|')
  })
})

describe('literal text', () => {
  it('leaves code and comments alone', () => {
    expect(type('`say |`', '"')).toBe('`say "|`')
    expect(type('```\nsay |\n```', '"')).toBe('```\nsay "|\n```')
    expect(type('<!-- say | -->', '"')).toBe('<!-- say "| -->')
    expect(type('`a..|`', '.')).toBe('`a...|`')
  })
})
