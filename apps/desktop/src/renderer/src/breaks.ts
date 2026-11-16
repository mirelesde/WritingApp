import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { insertNewlineAndIndent } from '@codemirror/commands'

/** Blocks where Return keeps its usual meaning: continuing a list, finishing a heading, and so on. */
const OTHER_BLOCKS = new Set([
  'ListItem',
  'Blockquote',
  'FencedCode',
  'CodeBlock',
  'Table',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'HTMLBlock',
  'CommentBlock',
  'FootnoteDefinition'
])

function inOtherBlock(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, -1) as { name: string; parent: unknown } | null; node; node = node.parent as typeof node) {
    if (OTHER_BLOCKS.has(node.name)) return true
  }
  return false
}

/**
 * Return in ordinary prose ends the paragraph and starts the next one: a blank line, which is what
 * Markdown (and the paragraph spacing setting) means by a paragraph. On an empty line it adds just
 * one line, so spacing can still be built up. Lists, quotes, headings, code and tables behave as before.
 */
export function paragraphBreakSpec(state: EditorState): TransactionSpec | null {
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  if (line.text.trim() === '' || inOtherBlock(state, range.from)) return null
  return {
    changes: { from: range.from, to: range.to, insert: '\n\n' },
    selection: { anchor: range.from + 2 },
    scrollIntoView: true,
    userEvent: 'input'
  }
}

/** True for a line that ends in a Markdown hard line break: a backslash, or two spaces. */
export function endsInLineBreak(text: string): boolean {
  if (/ {2,}$/.test(text) && text.trim() !== '') return true
  const slashes = /\\+$/.exec(text)
  return !!slashes && slashes[0].length % 2 === 1
}

const returnKey = (view: EditorView): boolean => {
  const spec = paragraphBreakSpec(view.state)
  if (!spec) return false
  view.dispatch(spec)
  return true
}

/** Shift+Return: a soft line break, which keeps the text in the same paragraph. */
const shiftReturnKey = (view: EditorView): boolean => {
  if (view.state.readOnly) return false
  view.dispatch(view.state.replaceSelection('\\'))
  return insertNewlineAndIndent(view)
}

class Mark extends WidgetType {
  constructor(readonly glyph: string) {
    super()
  }
  eq(other: Mark): boolean {
    return other.glyph === this.glyph
  }
  toDOM(): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'cm-break-mark'
    dom.setAttribute('aria-hidden', 'true')
    dom.textContent = this.glyph
    return dom
  }
  ignoreEvent(): boolean {
    return true
  }
}

const PARAGRAPH = Decoration.widget({ widget: new Mark('¶'), side: 1 })

/** Marks inside the selected text with a ¶ wherever a paragraph ends. Soft line breaks are not marked. */
export const breakMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view.state)
    }
    update(update: ViewUpdate): void {
      if (update.selectionSet || update.docChanged) this.decorations = this.build(update.state)
    }
    build(state: EditorState): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const at = new Map<number, Decoration>()
      for (const range of state.selection.ranges) {
        if (range.empty) continue
        const last = state.doc.lineAt(range.to).number
        for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
          const line = state.doc.line(n)
          // The mark belongs to the break after the line, so the selection has to run past the line's end.
          if (range.to <= line.to || line.text.trim() === '') continue
          if (n < state.doc.lines && state.doc.line(n + 1).text.trim() === '') at.set(line.to, PARAGRAPH)
        }
      }
      for (const pos of [...at.keys()].sort((a, b) => a - b)) builder.add(pos, pos, at.get(pos)!)
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export const lineBreaks: Extension = [
  breakMarks,
  keymap.of([
    { key: 'Enter', run: returnKey },
    { key: 'Shift-Enter', run: shiftReturnKey }
  ])
]

