import { insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown'
import { indentMore } from '@codemirror/commands'
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
})
