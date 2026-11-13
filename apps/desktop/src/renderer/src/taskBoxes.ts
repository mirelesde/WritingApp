import { RangeSetBuilder, type EditorState, type TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const TASK = /^(\s*(?:[-*+]|\d+[.)]) )\[([ xX])\]/

/** The transaction that ticks or unticks the task box on the line at `pos`, or null. */
export function toggleTaskAt(state: EditorState, pos: number): TransactionSpec | null {
  const line = state.doc.lineAt(pos)
  const m = TASK.exec(line.text)
  if (!m) return null
  const open = line.from + m[1].length
  if (pos < open || pos > open + 3) return null
  return {
    changes: { from: open + 1, to: open + 2, insert: m[2] === ' ' ? 'x' : ' ' },
    userEvent: 'input'
  }
}

const box = Decoration.mark({ class: 'cm-task-box' })

/** Makes the `[ ]` / `[x]` of a task list item clickable. */
export const taskBoxes = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view)
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        for (const { from, to } of view.visibleRanges) {
          let pos = from
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos)
            const m = TASK.exec(line.text)
            if (m) builder.add(line.from + m[1].length, line.from + m[1].length + 3, box)
            pos = line.to + 1
          }
        }
        return builder.finish()
      }
    },
    { decorations: (plugin) => plugin.decorations }
  ),
  EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || event.shiftKey || event.altKey) return false
      if (!(event.target as HTMLElement).closest?.('.cm-task-box')) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      const spec = pos === null ? null : toggleTaskAt(view.state, pos)
      if (!spec) return false
      view.dispatch(spec)
      event.preventDefault()
      return true
    }
  })
]
