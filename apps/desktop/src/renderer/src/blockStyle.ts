import { EditorSelection, type EditorState, type Line, type TransactionSpec } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { toggleComment } from './formatting'

/** Everything the Format menu and the style popover can apply. */
export type FormatKind =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'quote'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'strike'
  | 'highlight'
  | 'code'
  | 'codeblock'
  | 'comment'
  | 'rule'

export type LineStyle = 'h1' | 'h2' | 'h3' | 'body' | 'quote' | 'bullet' | 'numbered' | 'task'

/** The block markers a line can start with, longest first. */
const MARKER = /^(#{1,6} |> ?|[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/

const PREFIX: Record<Exclude<LineStyle, 'body'>, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  quote: '> ',
  bullet: '- ',
  numbered: '1. ',
  task: '- [ ] '
}

/** Which block style a line has. */
export function styleOfLine(text: string): LineStyle {
  const m = MARKER.exec(text)?.[0]
  if (!m) return 'body'
  if (m.startsWith('#')) return m.length === 2 ? 'h1' : m.length === 3 ? 'h2' : m.length === 4 ? 'h3' : 'body'
  if (m.startsWith('>')) return 'quote'
  if (/\[[ xX]\]/.test(m)) return 'task'
  if (/^\d/.test(m)) return 'numbered'
  return 'bullet'
}

/**
 * Sets every line the selection touches to `style`. If they all have it
 * already, the style comes off again (back to body text). Blank lines are
 * left alone when several lines are selected.
 */
export function setLineStyle(state: EditorState, style: LineStyle): TransactionSpec {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  const lines: Line[] = []
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n))
  const targets = lines.length > 1 ? lines.filter((l) => l.text.trim() !== '') : lines
  const target = targets.every((l) => styleOfLine(l.text) === style) ? 'body' : style

  const changes: { from: number; to: number; insert: string }[] = []
  let number = 1
  for (const line of targets) {
    const old = MARKER.exec(line.text)?.[0] ?? ''
    // A heading-like "#hashtag" without a space is not a marker, so nothing is lost.
    const marker = target === 'body' ? '' : target === 'numbered' ? `${number++}. ` : PREFIX[target]
    if (old !== marker) changes.push({ from: line.from, to: line.from + old.length, insert: marker })
  }
  return { changes, userEvent: 'input' }
}

/** Wraps the selection, or the word at the cursor, in `mark`; takes it off if already there. */
export function toggleWrap(state: EditorState, mark: string): TransactionSpec {
  const range = state.selection.main
  let { from, to } = range
  if (range.empty) {
    const word = state.wordAt(from)
    if (!word) {
      return {
        changes: { from, insert: mark + mark },
        selection: EditorSelection.cursor(from + mark.length),
        userEvent: 'input'
      }
    }
    ;({ from, to } = word)
  }
  const n = mark.length
  if (state.sliceDoc(from - n, from) === mark && state.sliceDoc(to, to + n) === mark) {
    return {
      changes: [
        { from: from - n, to: from },
        { from: to, to: to + n }
      ],
      selection: EditorSelection.range(from - n, to - n),
      userEvent: 'input'
    }
  }
  return {
    changes: [
      { from, insert: mark },
      { from: to, insert: mark }
    ],
    selection: EditorSelection.range(from + n, to + n),
    userEvent: 'input'
  }
}

/** Fences the lines the selection touches as a code block, or removes the fence around them. */
export function toggleCodeBlock(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  const before = first.number > 1 ? state.doc.line(first.number - 1) : null
  const after = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null
  if (before && after && /^```/.test(before.text) && after.text.trim() === '```') {
    return {
      changes: [
        { from: before.from, to: first.from },
        { from: last.to, to: after.to }
      ],
      userEvent: 'input'
    }
  }
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' }
    ],
    selection: EditorSelection.cursor(first.from + 4),
    userEvent: 'input'
  }
}

/** Puts a horizontal rule on its own line after the current one. */
export function insertRule(state: EditorState): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.to)
  const insert = line.text.trim() === '' ? '---\n' : '\n\n---\n'
  const at = line.text.trim() === '' ? line.from : line.to
  return { changes: { from: at, insert }, selection: EditorSelection.cursor(at + insert.length), userEvent: 'input' }
}

/** The spec for `kind`, or null when it does not apply here. */
export function formatSpec(state: EditorState, kind: FormatKind): TransactionSpec | null {
  switch (kind) {
    case 'strike':
      return toggleWrap(state, '~~')
    case 'highlight':
      return toggleWrap(state, '==')
    case 'code':
      return toggleWrap(state, '`')
    case 'codeblock':
      return toggleCodeBlock(state)
    case 'comment':
      return toggleComment(state)
    case 'rule':
      return insertRule(state)
    default:
      return setLineStyle(state, kind)
  }
}

export const formatCommand =
  (kind: FormatKind): Command =>
  (view) => {
    const spec = formatSpec(view.state, kind)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }

/** Cmd/Ctrl+Alt+1–4 set heading levels and body text. */
export const blockKeymap = [
  { key: 'Mod-Alt-1', run: formatCommand('h1') },
  { key: 'Mod-Alt-2', run: formatCommand('h2') },
  { key: 'Mod-Alt-3', run: formatCommand('h3') },
  { key: 'Mod-Alt-4', run: formatCommand('body') }
]
