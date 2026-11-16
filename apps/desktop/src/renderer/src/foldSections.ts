import {
  codeFolding,
  foldAll,
  foldEffect,
  foldable,
  foldedRanges,
  foldService,
  syntaxTree,
  unfoldAll,
  unfoldEffect
} from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type Extension, type StateEffect } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'

/** The level (1 to 6) of the ATX heading that starts at `pos`, or 0 if none does. */
function headingLevel(state: EditorState, pos: number): number {
  for (let node = syntaxTree(state).resolveInner(pos, 1); ; node = node.parent!) {
    const m = /^ATXHeading(\d)$/.exec(node.name)
    if (m) return node.from === pos ? Number(m[1]) : 0
    if (!node.parent) return 0
  }
}

/**
 * The text under a heading, up to the next heading of the same or a higher level.
 * Trailing blank lines stay outside, so a folded section keeps its spacing.
 */
function section(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
  const level = headingLevel(state, lineStart)
  if (!level) return null
  const doc = state.doc
  let last = doc.lineAt(lineEnd)
  for (let n = last.number + 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const m = /^(#{1,6})(?:\s|$)/.exec(line.text)
    if (m && m[1].length <= level && headingLevel(state, line.from)) break
    if (line.text.trim() !== '') last = line
  }
  const from = doc.lineAt(lineEnd).to
  return last.to > from ? { from, to: last.to } : null
}

class Chevron extends WidgetType {
  constructor(readonly folded: boolean) {
    super()
  }
  eq(other: Chevron): boolean {
    return other.folded === this.folded
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'cm-fold-chevron' + (this.folded ? ' cm-fold-closed' : '')
    dom.setAttribute('aria-hidden', 'true')
    // Drawn as a shape, not text, so it looks the same in every editor font: right when folded, down when open.
    const path = this.folded ? 'M5 3l5 5-5 5' : 'M3 5l5 5 5-5'
    dom.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>`
    dom.onmousedown = (event) => {
      event.preventDefault()
      toggleAt(view, view.posAtDOM(dom))
    }
    return dom
  }
  ignoreEvent(): boolean {
    return true
  }
}

const closed = new Chevron(true)
const open = new Chevron(false)

/** The folded range starting at the end of the line holding `pos`, if there is one. */
function foldedAt(state: EditorState, lineEnd: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  foldedRanges(state).between(lineEnd, lineEnd, (from, to) => {
    if (from === lineEnd) found = { from, to }
  })
  return found
}

/** Folds the section whose heading line holds `pos`, or unfolds it if it is folded. */
export function toggleAt(view: EditorView, pos: number): void {
  const line = view.state.doc.lineAt(pos)
  const folded = foldedAt(view.state, line.to)
  if (folded) {
    view.dispatch({ effects: unfoldEffect.of(folded) })
    return
  }
  const range = foldable(view.state, line.from, line.to)
  if (!range) return
  // Keep the cursor out of the text that is about to disappear.
  const head = view.state.selection.main.head
  view.dispatch({
    effects: foldEffect.of(range),
    selection: head > range.from && head <= range.to ? { anchor: line.to } : undefined
  })
}

/** Folds or unfolds the section under the heading nearest above the cursor. */
export function toggleCurrent(fold: boolean): (view: EditorView) => boolean {
  return (view) => {
    const { state } = view
    for (let n = state.doc.lineAt(state.selection.main.head).number; n >= 1; n--) {
      const line = state.doc.line(n)
      if (!headingLevel(state, line.from)) continue
      if (fold !== (foldedAt(state, line.to) !== null)) toggleAt(view, line.from)
      break
    }
    return true
  }
}

/** Makes a position visible by unfolding whatever hides it. */
export function reveal(view: EditorView, pos: number): void {
  const hiding: { from: number; to: number }[] = []
  foldedRanges(view.state).between(pos, pos, (from, to) => {
    if (from < pos && to >= pos) hiding.push({ from, to })
  })
  if (hiding.length) view.dispatch({ effects: hiding.map((r) => unfoldEffect.of(r)) })
}

export const foldAllSections = (view: EditorView): boolean => foldAll(view)
export const unfoldAllSections = (view: EditorView): boolean => unfoldAll(view)

/** The identity of each folded heading ("level:text"), to restore folds later. */
export function foldedHeadings(state: EditorState): string[] {
  const out: string[] = []
  foldedRanges(state).between(0, state.doc.length, (from) => {
    const line = state.doc.lineAt(from)
    out.push(line.text.trim())
  })
  return out
}

/** Folds the headings named in `ids` (as `foldedHeadings` gave them). */
export function restoreFolds(view: EditorView, ids: string[]): void {
  if (!ids.length) return
  const wanted = new Set(ids)
  const effects: StateEffect<unknown>[] = []
  const { state } = view
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (!wanted.has(line.text.trim())) continue
    const range = foldable(state, line.from, line.to)
    if (range) effects.push(foldEffect.of(range))
  }
  if (effects.length) view.dispatch({ effects })
}

const chevrons = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        foldedRanges(update.state) !== foldedRanges(update.startState) ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = this.build(update.view)
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const { state } = view
      let lastLine = 0
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = state.doc.lineAt(pos)
          pos = line.to + 1
          if (line.number <= lastLine) continue
          lastLine = line.number
          if (!/^#{1,6}(\s|$)/.test(line.text) || !section(state, line.from, line.to)) continue
          const folded = foldedAt(state, line.to) !== null
          builder.add(line.from, line.from, Decoration.widget({ widget: folded ? closed : open, side: -1 }))
        }
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/** Folding for the text under each heading, with a chevron in the margin that shows on hover. */
export const foldSections: Extension = [
  foldService.of((state, from, to) => section(state, from, to)),
  codeFolding({
    placeholderDOM(_view, onclick) {
      const dom = document.createElement('span')
      dom.className = 'cm-fold-placeholder'
      dom.textContent = '…'
      dom.title = 'Unfold'
      dom.onclick = onclick
      return dom
    }
  }),
  chevrons,
  keymap.of([
    { key: 'Mod-Alt-[', run: toggleCurrent(true), preventDefault: true },
    { key: 'Mod-Alt-]', run: toggleCurrent(false), preventDefault: true }
  ])
]
