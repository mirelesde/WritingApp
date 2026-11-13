import { EditorSelection, Prec, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/** The characters Markdown uses for emphasis. */
const MARKERS = new Set(['*', '_'])

/** Longest run that is still treated as one marker (`***` is bold italic). */
const MAX_RUN = 3

const isWord = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch)
const isSpace = (ch: string): boolean => ch === '' || /\s/.test(ch)

/** Where an opening marker may start: after nothing, a space, or an opening bracket or quote. */
const canOpenAfter = (ch: string): boolean => isSpace(ch) || '([{"\'“‘—-'.includes(ch)

/** Where a closing marker may end: before nothing, a space, or closing punctuation. */
const canCloseBefore = (ch: string): boolean => isSpace(ch) || ')]}"\'”’.,;:!?—-'.includes(ch)

interface Runs {
  before: number
  after: number
  /** The character just before the run that ends at the cursor. */
  beforeRun: string
  /** The character just after the run that starts at the cursor. */
  afterRun: string
}

function runsAround(state: EditorState, pos: number, marker: string): Runs {
  const doc = state.doc
  let before = 0
  while (before < MAX_RUN + 1 && doc.sliceString(pos - before - 1, pos - before) === marker) before++
  let after = 0
  while (after < MAX_RUN + 1 && doc.sliceString(pos + after, pos + after + 1) === marker) after++
  return {
    before,
    after,
    beforeRun: doc.sliceString(Math.max(0, pos - before - 1), pos - before),
    afterRun: doc.sliceString(pos + after, pos + after + 1)
  }
}

/** True if the cursor sits in the middle of an empty marker pair like `*|*` or `**|**`. */
function inEmptyPair(runs: Runs): boolean {
  return (
    runs.before >= 1 &&
    runs.before === runs.after &&
    runs.before <= MAX_RUN &&
    canOpenAfter(runs.beforeRun) &&
    canCloseBefore(runs.afterRun)
  )
}

/**
 * What typing `marker` at `from`..`to` should do instead of the plain insert,
 * or null to let the editor insert it normally:
 *  - with a selection, wrap it, keeping the text selected;
 *  - in an empty pair, widen it (`*|*` becomes `**|**`);
 *  - just before the same marker, step over it;
 *  - where an opening marker belongs, insert the pair.
 */
export function typedMarker(
  state: EditorState,
  from: number,
  to: number,
  marker: string
): TransactionSpec | null {
  if (!MARKERS.has(marker)) return null
  const userEvent = 'input.type'

  if (from !== to) {
    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker }
      ],
      selection: EditorSelection.range(from + 1, to + 1),
      userEvent
    }
  }

  const doc = state.doc
  const before = doc.sliceString(Math.max(0, from - 1), from)
  const after = doc.sliceString(from, from + 1)
  const runs = runsAround(state, from, marker)

  if (after === marker) {
    if (inEmptyPair(runs) && runs.before < MAX_RUN) {
      return {
        changes: { from, insert: marker + marker },
        selection: EditorSelection.cursor(from + 1),
        userEvent
      }
    }
    return { selection: EditorSelection.cursor(from + 1), userEvent }
  }

  // Open a new pair only where an opening marker makes sense.
  if (before !== marker && !isWord(before) && canCloseBefore(after) && !isWord(after)) {
    return {
      changes: { from, insert: marker + marker },
      selection: EditorSelection.cursor(from + 1),
      userEvent
    }
  }
  return null
}

/**
 * A space typed right after an auto-closed `*` at the start of a line means
 * the star was a list bullet, so the closing star is taken back.
 */
export function typedSpace(state: EditorState, from: number, to: number): TransactionSpec | null {
  if (from !== to) return null
  const line = state.doc.lineAt(from)
  const atBullet =
    state.doc.sliceString(from - 1, from) === '*' &&
    state.doc.sliceString(from, from + 1) === '*' &&
    /^\s*$/.test(state.doc.sliceString(line.from, from - 1)) &&
    state.doc.sliceString(from + 1, line.to).trim() === ''
  if (!atBullet) return null
  return {
    changes: { from, to: from + 1, insert: ' ' },
    selection: EditorSelection.cursor(from + 1),
    userEvent: 'input.type'
  }
}

/** Backspace in an empty pair removes both markers (one pair at a time). */
export function backspaceInPair(state: EditorState): TransactionSpec | null {
  const range = state.selection.main
  if (!range.empty) return null
  const pos = range.head
  for (const marker of MARKERS) {
    if (state.doc.sliceString(pos - 1, pos) !== marker) continue
    if (state.doc.sliceString(pos, pos + 1) !== marker) continue
    if (!inEmptyPair(runsAround(state, pos, marker))) continue
    return {
      changes: [
        { from: pos - 1, to: pos },
        { from: pos, to: pos + 1 }
      ],
      userEvent: 'delete.backward'
    }
  }
  return null
}

/** Auto-closing for `*` and `_`, with wrap-the-selection and step-over. */
export const emphasisPairs = [
  EditorView.inputHandler.of((view, from, to, text) => {
    const spec = text === ' ' ? typedSpace(view.state, from, to) : typedMarker(view.state, from, to, text)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }),
  Prec.high(
    keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          const spec = backspaceInPair(view.state)
          if (!spec) return false
          view.dispatch(spec)
          return true
        }
      }
    ])
  )
]
