import { EditorState, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { findMath, mathToHtml } from '@writingapp/core'

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean
  ) {
    super()
  }
  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display
  }
  toDOM(): HTMLElement {
    const dom = document.createElement(this.display ? 'div' : 'span')
    dom.className = this.display ? 'cm-math cm-math-block' : 'cm-math'
    dom.innerHTML = mathToHtml(this.tex, this.display)
    return dom
  }
  // A click goes to the editor, which puts the cursor there and shows the source.
  ignoreEvent(): boolean {
    return false
  }
}

function build(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  if (!text.includes('$')) return Decoration.none
  const out: Range<Decoration>[] = []
  for (const m of findMath(text)) {
    // Source shows while the cursor or a selection is in or touching the formula.
    if (state.selection.ranges.some((r) => r.from <= m.to && r.to >= m.from)) continue
    const widget = new MathWidget(m.tex, m.display)
    if (m.block) {
      const from = state.doc.lineAt(m.from).from
      out.push(Decoration.replace({ widget, block: true }).range(from, m.to))
    } else {
      out.push(Decoration.replace({ widget }).range(m.from, m.to))
    }
  }
  return Decoration.set(out, true)
}

const field = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    return tr.docChanged || tr.selection ? build(tr.state) : value
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Draws `$formulas$` and `$$blocks$$` as maths (MathML), showing the TeX while the cursor is in one. */
export const mathWidgets: Extension = field
