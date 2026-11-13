import { type Extension, type EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/**
 * The paragraph around `pos` as a range of line numbers: the run of
 * non-blank lines it sits in, or just its own line if that line is blank.
 */
export function paragraphLines(state: EditorState, pos: number): { first: number; last: number } {
  const doc = state.doc
  const here = doc.lineAt(pos)
  const blank = (n: number): boolean => doc.line(n).text.trim() === ''
  if (blank(here.number)) return { first: here.number, last: here.number }
  let first = here.number
  let last = here.number
  while (first > 1 && !blank(first - 1)) first--
  while (last < doc.lines && !blank(last + 1)) last++
  return { first, last }
}

const dimmed = Decoration.line({ class: 'cm-dim' })

/** Dims every line outside the paragraph with the cursor, while the editor has focus. */
const dimOthers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
        this.decorations = this.build(update.view)
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      if (!view.hasFocus) return builder.finish()
      const { first, last } = paragraphLines(view.state, view.state.selection.main.head)
      for (const { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos)
          if (line.number < first || line.number > last) builder.add(line.from, line.from, dimmed)
          pos = line.to + 1
        }
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/** The nearest ancestor that scrolls vertically: the pane the editor sits in. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return el
  }
  return null
}

/** Keeps the line with the cursor in the vertical middle of the pane while typing. */
const typewriter = EditorView.updateListener.of((update) => {
  if (!update.view.hasFocus || !(update.docChanged || update.selectionSet)) return
  const view = update.view
  requestAnimationFrame(() => {
    const box = scrollParent(view.dom)
    const caret = view.coordsAtPos(view.state.selection.main.head)
    if (!box || !caret) return
    const rect = box.getBoundingClientRect()
    const offset = (caret.top + caret.bottom) / 2 - (rect.top + rect.height / 2)
    if (Math.abs(offset) > 2) box.scrollTop += offset
  })
})

export interface FocusOptions {
  dim: boolean
  typewriter: boolean
}

export function focusExtensions({ dim, typewriter: centre }: FocusOptions): Extension {
  return [dim ? dimOthers : [], centre ? typewriter : []]
}
