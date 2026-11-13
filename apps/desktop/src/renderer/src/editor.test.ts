import { insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown'
import {
  copyLineDown,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  selectLine
} from '@codemirror/commands'
import { EditorSelection, type StateCommand, type Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { createEditorState } from './editor'

const hooks = { onchange: () => {}, onblur: () => {} }

/** Runs a command with the cursor at the end of `doc`; returns the new text. */
function run(doc: string, command: StateCommand): string {
  let state = createEditorState(doc, hooks)
  state = state.update({ selection: EditorSelection.cursor(doc.length) }).state
  command({
    state,
    dispatch: (tr: Transaction) => {
      state = tr.state
    }
  })
  return state.doc.toString()
}

describe('editor behaviour in lists', () => {
  it('continues a bullet list on Enter', () => {
    expect(run('- one', insertNewlineContinueMarkup)).toBe('- one\n- ')
  })

  it('continues and renumbers an ordered list', () => {
    expect(run('1. one', insertNewlineContinueMarkup)).toBe('1. one\n2. ')
  })

  it('continues a block quote', () => {
    expect(run('> quoted', insertNewlineContinueMarkup)).toBe('> quoted\n> ')
  })

  it('ends the list when Enter is pressed on an empty item', () => {
    expect(run('- one\n- two\n- ', insertNewlineContinueMarkup)).toBe('- one\n- two\n')
  })

  it('turns the marker of an empty item into indentation on Backspace', () => {
    expect(run('- one\n- ', deleteMarkupBackward)).toBe('- one\n  ')
  })

  it('nests with Tab using four spaces', () => {
    expect(run('- one\n- two', indentMore)).toBe('- one\n    - two')
  })

  it('continues a task list with an unchecked box', () => {
    expect(run('- [x] done', insertNewlineContinueMarkup)).toBe('- [x] done\n- [ ] ')
  })

  it('moves a nested item back out with Shift-Tab', () => {
    expect(run('- one\n    - two', indentLess)).toBe('- one\n- two')
  })

  it('nests an ordered item under its parent', () => {
    expect(run('1. one\n2. two', indentMore)).toBe('1. one\n    2. two')
  })
})

/** Runs a command with the selection `from`..`to` (default: a cursor at `from`). */
function runAt(doc: string, from: number, to: number, command: StateCommand): string {
  let state = createEditorState(doc, hooks)
  state = state.update({ selection: EditorSelection.range(from, to) }).state
  command({
    state,
    dispatch: (tr: Transaction) => {
      state = tr.state
    }
  })
  return state.doc.toString()
}

describe('keyboard behaviour audit', () => {
  it('Tab nests every item of a multi-line selection, Shift-Tab brings them back', () => {
    const doc = '- one\n- two\n- three'
    const nested = runAt(doc, 2, doc.length, indentMore)
    expect(nested).toBe('    - one\n    - two\n    - three')
    expect(runAt(nested, 0, nested.length, indentLess)).toBe(doc)
  })

  it('Backspace right after a list marker removes the marker', () => {
    expect(runAt('- one', 2, 2, deleteMarkupBackward)).toBe('one')
    expect(runAt('1. one', 3, 3, deleteMarkupBackward)).toBe('one')
    expect(runAt('> quote', 2, 2, deleteMarkupBackward)).toBe('quote')
  })

  it('Enter in a nested quoted list continues it at the same depth', () => {
    expect(runAt('> - one', 7, 7, insertNewlineContinueMarkup)).toBe('> - one\n> - ')
  })

  it('moves and duplicates lines', () => {
    expect(runAt('a\nb\nc', 2, 2, moveLineUp)).toBe('b\na\nc')
    expect(runAt('a\nb\nc', 2, 2, moveLineDown)).toBe('a\nc\nb')
    expect(runAt('a\nb', 0, 0, copyLineDown)).toBe('a\na\nb')
  })

  it('selects the whole line', () => {
    let state = createEditorState('one\ntwo\nthree', hooks)
    state = state.update({ selection: EditorSelection.cursor(5) }).state
    selectLine({
      state,
      dispatch: (tr: Transaction) => {
        state = tr.state
      }
    })
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('two\n')
  })
})
