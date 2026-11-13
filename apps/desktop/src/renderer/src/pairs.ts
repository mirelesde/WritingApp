import { EditorSelection, Prec, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/** Opening character to its closing one. Quotes and backticks close with themselves. */
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', '`': '`' }
const CLOSERS = new Set(Object.values(PAIRS))

const isWord = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch)

/** Where a new pair may open: before nothing, a space, or closing punctuation. */
const canOpenBefore = (ch: string): boolean => ch === '' || /\s/.test(ch) || ')]}>.,;:!?-'.includes(ch)

/**
 * What typing `typed` at `from`..`to` should do instead of the plain insert,
 * or null to let the editor insert it normally:
 *  - with a selection, wrap it, keeping the text selected;
 *  - just before the same closing character, step over it;
 *  - where a pair may open, insert both and leave the cursor between.
 * Quotes and backticks only open after a non-word character, so `5"` and
 * `don`t` are left alone.
 */
export function typedPair(
  state: EditorState,
  from: number,
  to: number,
  typed: string
): TransactionSpec | null {
  const closing = PAIRS[typed]
  const userEvent = 'input.type'

  if (from !== to) {
    if (closing === undefined) return null
    return {
      changes: [
        { from, insert: typed },
        { from: to, insert: closing }
      ],
      selection: EditorSelection.range(from + 1, to + 1),
      userEvent
    }
  }

  const doc = state.doc
  const before = doc.sliceString(Math.max(0, from - 1), from)
  const after = doc.sliceString(from, from + 1)

  if (CLOSERS.has(typed) && after === typed) {
    return { selection: EditorSelection.cursor(from + 1), userEvent }
  }
  if (closing === undefined) return null

  const symmetric = closing === typed
  if (symmetric && (isWord(before) || before === typed)) return null
  if (!symmetric && !canOpenBefore(before) && !'([{'.includes(before)) return null
  if (after !== '' && !/\s/.test(after) && !')]}.,;:!?'.includes(after)) return null

  return {
    changes: { from, insert: typed + closing },
    selection: EditorSelection.cursor(from + 1),
    userEvent
  }
}

/** Backspace between an empty pair removes both characters. */
export function backspaceInBrackets(state: EditorState): TransactionSpec | null {
  const range = state.selection.main
  if (!range.empty) return null
  const pos = range.head
  const open = state.doc.sliceString(pos - 1, pos)
  const close = state.doc.sliceString(pos, pos + 1)
  if (PAIRS[open] === undefined || PAIRS[open] !== close) return null
  return {
    changes: { from: pos - 1, to: pos + 1 },
    userEvent: 'delete.backward'
  }
}

/** Auto-closing for brackets, quotes and backticks, with wrap, step-over and Backspace. */
export const bracketPairs = [
  EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1) return false
    const spec = typedPair(view.state, from, to, text)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }),
  Prec.high(
    keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          const spec = backspaceInBrackets(view.state)
          if (!spec) return false
          view.dispatch(spec)
          return true
        }
      }
    ])
  )
]
