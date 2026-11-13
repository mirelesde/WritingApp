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
const dimmedText = Decoration.mark({ class: 'cm-dim-text' })

/**
 * The sentence around `pos` in `text` (a paragraph): from its first letter to
 * its last character, without the space that follows. Sentences end at
 * `.`, `!`, `?` or `…`, plus any closing quote or bracket, then whitespace.
 */
export function sentenceBounds(text: string, pos: number): { from: number; to: number } {
  const end = /[.!?…]+["'”’)\]]*(?=\s|$)/g
  let from = 0
  for (let match = end.exec(text); match; match = end.exec(text)) {
    const to = match.index + match[0].length
    if (pos <= to) return { from, to }
    from = to
    while (from < text.length && /\s/.test(text[from]!)) from++
    if (pos < from) return { from: to, to: from } // in the gap: stay with the sentence before
  }
  return { from, to: text.length }
}

export type Scope = 'line' | 'sentence' | 'paragraph'

/** Dims every line outside the paragraph with the cursor, while the editor has focus. */
function dimOthers(scope: Scope): Extension {
  return ViewPlugin.fromClass(
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
      const head = view.state.selection.main.head
      const lineScope = scope === 'line'
      const { first, last } = lineScope
        ? { first: view.state.doc.lineAt(head).number, last: view.state.doc.lineAt(head).number }
        : paragraphLines(view.state, head)
      const marks: { from: number; to: number }[] = []
      if (scope === 'sentence' && last >= first) {
        // Within the paragraph, fade the text before and after the sentence being written.
        const start = view.state.doc.line(first).from
        const text = view.state.sliceDoc(start, view.state.doc.line(last).to)
        const sentence = sentenceBounds(text, head - start)
        if (sentence.from > 0) marks.push({ from: start, to: start + sentence.from })
        if (sentence.to < text.length) marks.push({ from: start + sentence.to, to: start + text.length })
      }
      // Line decorations and mark decorations share one set, ordered by position.
      const items: { from: number; to: number; value: Decoration }[] = []
      for (const { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos)
          if (line.number < first || line.number > last) {
            items.push({ from: line.from, to: line.from, value: dimmed })
          }
          pos = line.to + 1
        }
      }
      for (const m of marks) if (m.to > m.from) items.push({ ...m, value: dimmedText })
      items.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
      for (const item of items) builder.add(item.from, item.to, item.value)
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
  )
}

/** The nearest ancestor that scrolls vertically: the pane the editor sits in. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return el
  }
  return null
}

/** Keeps the line with the cursor in the vertical middle of the pane while typing. */
function typewriterScrolling(fraction: number): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.view.hasFocus || !(update.docChanged || update.selectionSet)) return
    const view = update.view
    requestAnimationFrame(() => {
      const box = scrollParent(view.dom)
      const caret = view.coordsAtPos(view.state.selection.main.head)
      if (!box || !caret) return
      const rect = box.getBoundingClientRect()
      const offset = (caret.top + caret.bottom) / 2 - (rect.top + rect.height * fraction)
      if (Math.abs(offset) > 2) box.scrollTop += offset
    })
  })
}

export interface FocusOptions {
  dim: boolean
  typewriter: boolean
  /** What stays bright when dimming. Default: the paragraph. */
  scope?: Scope
  /** Where the line sits in the pane when typewriter scrolling: the middle, or higher up. */
  position?: 'centre' | 'upper'
}

export function focusExtensions({
  dim,
  typewriter: scrolling,
  scope = 'paragraph',
  position = 'centre'
}: FocusOptions): Extension {
  return [dim ? dimOthers(scope) : [], scrolling ? typewriterScrolling(position === 'upper' ? 0.35 : 0.5) : []]
}
