import { RangeSetBuilder, type ChangeSpec } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { findMarkers } from '@writingapp/core'

class ContentsWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const chip = document.createElement('span')
    chip.className = 'cm-contents-chip'
    chip.textContent = 'Table of Contents'
    chip.title = 'Filled in with the headings when you export'
    return chip
  }
  ignoreEvent(): boolean {
    return false
  }
}

const widget = Decoration.replace({ widget: new ContentsWidget() })

/** Shows a `(cnt)` line as a "Table of Contents" chip until the cursor is on it. */
export const contentsChip = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      markers: number[]
      constructor(view: EditorView) {
        this.markers = findMarkers(view.state.doc.toString())
        this.decorations = this.build(view)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) this.markers = findMarkers(update.state.doc.toString())
        if (update.docChanged || update.selectionSet) this.decorations = this.build(update.view)
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        const doc = view.state.doc
        const head = view.state.selection.main
        for (const offset of this.markers) {
          const line = doc.lineAt(offset)
          if (head.from <= line.to && head.to >= line.from) continue
          builder.add(line.from, line.to, widget)
        }
        return builder.finish()
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
  EditorView.baseTheme({
    '.cm-contents-chip': {
      display: 'inline-block',
      border: '1px solid currentColor',
      borderRadius: '4px',
      padding: '0 10px',
      fontSize: '0.7em',
      lineHeight: '1.6',
      cursor: 'default',
      opacity: '0.8',
    },
  }),
]

/**
 * What inserting a table of contents at `pos` changes: `(cnt)` on a line of its
 * own, with a blank line around it, and the cursor placed after it. Does nothing
 * if the line at `pos` already is one.
 */
export function insertContentsChange(doc: string, pos: number): { changes: ChangeSpec; cursor: number } | null {
  const lineFrom = doc.lastIndexOf('\n', pos - 1) + 1
  const end = doc.indexOf('\n', pos)
  const line = doc.slice(lineFrom, end === -1 ? doc.length : end)
  if (line.trim() === '(cnt)') return null
  // At the start of an empty line: fill it. Otherwise start a new paragraph after the line.
  const blank = line.trim() === ''
  const at = blank ? lineFrom : end === -1 ? doc.length : end
  const before = blank ? '' : '\n\n'
  const insert = `${before}(cnt)\n\n`
  const rest = doc.slice(blank ? (end === -1 ? doc.length : end) : at)
  // Don't pile blank lines up if one follows already.
  const trimmedRest = blank ? rest.replace(/^\n/, '') : rest.replace(/^\n+/, '')
  const removed = rest.length - trimmedRest.length
  return { changes: { from: at, to: at + removed, insert }, cursor: at + insert.length }
}

/** Inserts a table of contents at the cursor. */
export function insertContents(view: EditorView): void {
  const head = view.state.selection.main.head
  const result = insertContentsChange(view.state.doc.toString(), head)
  if (!result) return
  view.dispatch({ changes: result.changes, selection: { anchor: result.cursor }, scrollIntoView: true, userEvent: 'input' })
}
