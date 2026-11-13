import { syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const isWord = (ch: string): boolean => /[\p{L}\p{N}]/u.test(ch)

/** Where an opening quote belongs: after nothing, a space, an opening bracket or a dash. */
const opensAfter = (ch: string): boolean => ch === '' || /\s/.test(ch) || '([{—–-“‘'.includes(ch)

/** Syntax nodes whose text is code, where typography must be left alone. */
const CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'CodeMark', 'CodeInfo'])

/** True when `pos` is inside code or an HTML comment. */
export function inLiteral(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, -1); ; node = node.parent!) {
    if (CODE.has(node.name)) return true
    if (!node.parent) break
  }
  const before = state.sliceDoc(0, pos)
  return before.lastIndexOf('<!--') > before.lastIndexOf('-->')
}

/**
 * What typing `typed` at `from`..`to` should do with smart typography on, or
 * null for a plain insert:
 *  - `"` and `'` become curly quotes (a pair for `"`, with the cursor between;
 *    an apostrophe inside a word is always `’`);
 *  - a second `-` makes an en dash and a third an em dash, except at the
 *    start of a line, where `--` and `---` are list or rule syntax;
 *  - a third `.` makes an ellipsis.
 * Never inside code or comments.
 */
export function typedSmart(
  state: EditorState,
  from: number,
  to: number,
  typed: string
): TransactionSpec | null {
  const userEvent = 'input.type'
  if (typed.length !== 1 || !'"\'-.'.includes(typed)) return null
  if (inLiteral(state, from)) return null
  const doc = state.doc
  const before = doc.sliceString(Math.max(0, from - 1), from)
  const after = doc.sliceString(to, to + 1)

  if (typed === '"' || typed === "'") {
    const [open, close] = typed === '"' ? ['“', '”'] : ['‘', '’']
    if (from !== to) {
      return {
        changes: [
          { from, insert: open },
          { from: to, insert: close }
        ],
        selection: EditorSelection.range(from + 1, to + 1),
        userEvent
      }
    }
    if (after === close && typed === '"') {
      return { selection: EditorSelection.cursor(from + 1), userEvent }
    }
    const opening = typed === '"' ? opensAfter(before) : opensAfter(before) && !isWord(after)
    if (!opening) {
      return { changes: { from, insert: close }, selection: EditorSelection.cursor(from + 1), userEvent }
    }
    const pair = typed === '"' && (after === '' || /\s/.test(after) || ')]}.,;:!?'.includes(after))
    return pair
      ? { changes: { from, insert: open + close }, selection: EditorSelection.cursor(from + 1), userEvent }
      : { changes: { from, insert: open }, selection: EditorSelection.cursor(from + 1), userEvent }
  }

  if (from !== to) return null

  if (typed === '-') {
    const line = doc.lineAt(from)
    const lead = doc.sliceString(line.from, from)
    if (/^\s*-*$/.test(lead)) return null // `--`, `---` and `- -` at a line start are Markdown
    if (before === '–') {
      return {
        changes: { from: from - 1, to: from, insert: '—' },
        selection: EditorSelection.cursor(from),
        userEvent
      }
    }
    if (before === '-' && doc.sliceString(Math.max(0, from - 2), from - 1) !== '-') {
      return {
        changes: { from: from - 1, to: from, insert: '–' },
        selection: EditorSelection.cursor(from),
        userEvent
      }
    }
    return null
  }

  // typed === '.'
  if (before === '.' && doc.sliceString(Math.max(0, from - 2), from - 1) === '.') {
    if (doc.sliceString(Math.max(0, from - 3), from - 2) === '.') return null
    return {
      changes: { from: from - 2, to: from, insert: '…' },
      selection: EditorSelection.cursor(from - 1),
      userEvent
    }
  }
  return null
}

/** Curly quotes, dashes and ellipses as you type. Runs before bracket pairing so it owns `"`. */
export const smartTypography = Prec.high(
  EditorView.inputHandler.of((view, from, to, text) => {
    const spec = typedSmart(view.state, from, to, text)
    if (!spec) return false
    view.dispatch(spec)
    return true
  })
)
