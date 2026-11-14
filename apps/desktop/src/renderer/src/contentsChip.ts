import { RangeSetBuilder } from '@codemirror/state'
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
