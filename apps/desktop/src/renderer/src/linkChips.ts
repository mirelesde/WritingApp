import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const chip = Decoration.mark({ class: 'cm-link-chip' })

/** Marks each whole `[text](address)` link, so it can be drawn as one outlined chip. */
export const linkChips = ViewPlugin.fromClass(
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
        syntaxTree(view.state).iterate({
          from,
          to,
          enter(node) {
            if (node.name === 'Link') builder.add(node.from, node.to, chip)
          }
        })
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
