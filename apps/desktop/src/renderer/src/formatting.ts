import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import type { Command } from '@codemirror/view'

/** Counts the `marker` characters in a row ending at `pos`, going back. */
function runBefore(state: EditorState, pos: number, marker: string): number {
  let n = 0
  while (pos - n > 0 && state.sliceDoc(pos - n - 1, pos - n) === marker) n++
  return n
}

/** Counts the `marker` characters in a row starting at `pos`. */
function runAfter(state: EditorState, pos: number, marker: string): number {
  let n = 0
  while (pos + n < state.doc.length && state.sliceDoc(pos + n, pos + n + 1) === marker) n++
  return n
}

/** True if a run of `run` stars contains emphasis of `width` (1 = italic, 2 = bold). */
const hasLevel = (run: number, width: number): boolean =>
  width === 1 ? run === 1 || run === 3 : run >= 2

/**
 * Toggles `*` (italic, width 1) or `**` (bold, width 2) around the selection,
 * or around the word at the cursor, or inserts an empty pair.
 */
export function toggleEmphasis(state: EditorState, width: 1 | 2): TransactionSpec {
  const mark = '*'.repeat(width)
  const range = state.selection.main
  let { from, to } = range

  if (range.empty) {
    const word = state.wordAt(from)
    if (!word) {
      return {
        changes: { from, insert: mark + mark },
        selection: EditorSelection.cursor(from + width),
        userEvent: 'input'
      }
    }
    ;({ from, to } = word)
  }

  // Stars around the selection, or inside its ends, count the same way.
  const outside = Math.min(runBefore(state, from, '*'), runAfter(state, to, '*'))
  const text = state.sliceDoc(from, to)
  const inside = Math.min(/^\*+/.exec(text)?.[0].length ?? 0, /\*+$/.exec(text)?.[0].length ?? 0)

  if (outside >= width && hasLevel(outside, width)) {
    return {
      changes: [
        { from: from - width, to: from },
        { from: to, to: to + width }
      ],
      selection: EditorSelection.range(from - width, to - width),
      userEvent: 'input'
    }
  }
  if (inside >= width && hasLevel(inside, width) && text.length > 2 * width) {
    return {
      changes: [
        { from, to: from + width },
        { from: to - width, to }
      ],
      selection: EditorSelection.range(from, to - 2 * width),
      userEvent: 'input'
    }
  }
  return {
    changes: [
      { from, insert: mark },
      { from: to, insert: mark }
    ],
    selection: EditorSelection.range(from + width, to + width),
    userEvent: 'input'
  }
}

/** True if `text` is a web address worth using as a link target. */
const looksLikeUrl = (text: string): boolean => /^(https?:\/\/|www\.|mailto:)\S+$/i.test(text.trim())

/**
 * Turns the selection into a link: `[text](url)` with `url` selected for
 * typing. A selected web address becomes the target, with the cursor in the
 * label. With nothing selected it inserts `[](url)`, cursor in the label.
 */
export function insertLink(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)

  if (text !== '' && !looksLikeUrl(text)) {
    const urlFrom = from + text.length + 3
    return {
      changes: { from, to, insert: `[${text}](url)` },
      selection: EditorSelection.range(urlFrom, urlFrom + 3),
      userEvent: 'input'
    }
  }
  if (text !== '') {
    return {
      changes: { from, to, insert: `[](${text.trim()})` },
      selection: EditorSelection.cursor(from + 1),
      userEvent: 'input'
    }
  }
  return {
    changes: { from, insert: '[](url)' },
    selection: EditorSelection.cursor(from + 1),
    userEvent: 'input'
  }
}

function asCommand(spec: (state: EditorState) => TransactionSpec): Command {
  return (view) => {
    view.dispatch(spec(view.state))
    return true
  }
}

export const toggleBold: Command = asCommand((s) => toggleEmphasis(s, 2))
export const toggleItalic: Command = asCommand((s) => toggleEmphasis(s, 1))
export const linkCommand: Command = asCommand(insertLink)

/** Keyboard shortcuts for the formatting commands. */
export const formattingKeymap = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-k', run: linkCommand }
]
