import { ensureSyntaxTree } from '@codemirror/language'
import { ChangeSet, EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
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

/** Block markers at the start of a line that emphasis must stay clear of: headings, quotes, list items. */
const BLOCK_PREFIX = /^\s*(#{1,6}\s+|>\s?|[-+*]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/

/**
 * The stretches of a selection that emphasis goes around: one per line, without
 * the spaces, line breaks and list or heading markers at their edges, because
 * emphasis cannot touch whitespace or run across a blank line.
 */
function emphasisSegments(state: EditorState, from: number, to: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos)
    let start = Math.max(from, line.from)
    const end = Math.min(to, line.to)
    if (start === line.from) start += BLOCK_PREFIX.exec(line.text)?.[0].length ?? 0
    const text = state.sliceDoc(start, Math.max(start, end))
    const lead = text.length - text.trimStart().length
    const trimmed = text.trim()
    if (trimmed !== '') out.push({ from: start + lead, to: start + lead + trimmed.length })
    pos = line.to + 1
  }
  return out
}

/** How a stretch is wrapped in `width` stars: around the outside, inside its ends, or not at all. */
function wrapping(state: EditorState, from: number, to: number, width: number): 'outside' | 'inside' | 'none' {
  const outside = Math.min(runBefore(state, from, '*'), runAfter(state, to, '*'))
  if (outside >= width && hasLevel(outside, width)) return 'outside'
  const text = state.sliceDoc(from, to)
  const inside = Math.min(/^\*+/.exec(text)?.[0].length ?? 0, /\*+$/.exec(text)?.[0].length ?? 0)
  if (inside >= width && hasLevel(inside, width) && text.length > 2 * width) return 'inside'
  return 'none'
}

/**
 * Toggles `*` (italic, width 1) or `**` (bold, width 2) around the selection
 * (each line of it, without the spaces at its edges), or around the word at the
 * cursor, or inserts an empty pair. Pressing it again takes the marks off.
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

  const segments = emphasisSegments(state, from, to)
  if (segments.length === 0) {
    return {
      changes: { from: range.from, insert: mark + mark },
      selection: EditorSelection.cursor(range.from + width),
      userEvent: 'input'
    }
  }
  const kinds = segments.map((s) => wrapping(state, s.from, s.to, width))
  const removing = kinds.every((k) => k !== 'none')
  const changes: { from: number; to?: number; insert?: string }[] = []
  segments.forEach((s, i) => {
    if (removing) {
      if (kinds[i] === 'outside') changes.push({ from: s.from - width, to: s.from }, { from: s.to, to: s.to + width })
      else changes.push({ from: s.from, to: s.from + width }, { from: s.to - width, to: s.to })
    } else if (kinds[i] === 'none') {
      changes.push({ from: s.from, insert: mark }, { from: s.to, insert: mark })
    }
  })
  const set = ChangeSet.of(changes, state.doc.length)
  return {
    changes: set,
    selection: EditorSelection.range(set.mapPos(segments[0]!.from, 1), set.mapPos(segments[segments.length - 1]!.to, -1)),
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

/** The `<!-- -->` comment around `pos`, if any, as a range. */
function commentAt(state: EditorState, from: number, to: number): { from: number; to: number } | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 200)
  if (!tree) return null
  let found: { from: number; to: number } | null = null
  tree.iterate({
    from,
    to,
    enter(node) {
      if (
        (node.name === 'Comment' || node.name === 'CommentBlock') &&
        node.from <= from &&
        node.to >= to
      ) {
        found = { from: node.from, to: node.to }
      }
    }
  })
  return found
}

/** Removes the `<!--` and `-->` (and one space inside each) from the comment at `range`. */
function unwrapComment(state: EditorState, range: { from: number; to: number }): TransactionSpec {
  const text = state.sliceDoc(range.from, range.to)
  const open = text.startsWith('<!-- ') ? 5 : 4
  const close = text.endsWith(' -->') ? 4 : 3
  return {
    changes: [
      { from: range.from, to: range.from + open },
      { from: range.to - close, to: range.to }
    ],
    selection: EditorSelection.range(range.from, range.to - open - close),
    userEvent: 'input'
  }
}

/**
 * Comments text out with `<!-- -->`, or brings it back. Works on the
 * selection, or on the line when nothing is selected; selecting inside a
 * comment, or putting the cursor in one, takes the comment off again.
 */
export function toggleComment(state: EditorState): TransactionSpec | null {
  const range = state.selection.main
  const existing = commentAt(state, range.from, range.to)
  if (existing) return unwrapComment(state, existing)

  let { from, to } = range
  const selected = state.sliceDoc(from, to)
  if (selected.trim().startsWith('<!--') && selected.trim().endsWith('-->')) {
    const start = from + (selected.length - selected.trimStart().length)
    return unwrapComment(state, { from: start, to: start + selected.trim().length })
  }

  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  if (range.empty || first.number !== last.number) {
    // The line, or the lines the selection touches, without their indentation.
    from = first.from + (first.text.length - first.text.trimStart().length)
    to = last.to
    if (from > to) from = to
  }
  const text = state.sliceDoc(from, to)
  if (text.includes('-->') || text.includes('<!--')) return null
  const body = text === '' ? '  ' : ` ${text} `
  return {
    changes: { from, to, insert: `<!--${body}-->` },
    selection:
      text === ''
        ? EditorSelection.cursor(from + 5)
        : range.empty
          ? EditorSelection.cursor(from + 5 + text.length)
          : EditorSelection.range(from + 5, from + 5 + text.length),
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
export const commentCommand: Command = (view) => {
  const spec = toggleComment(view.state)
  if (!spec) return false
  view.dispatch(spec)
  return true
}

/** Keyboard shortcuts for the formatting commands. */
export const formattingKeymap = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-k', run: linkCommand },
  { key: 'Mod-/', run: commentCommand }
]
