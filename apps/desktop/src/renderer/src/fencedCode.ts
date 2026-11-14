import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const line = Decoration.line({ class: 'cm-fenced' })

/** Marks every line of a fenced code block, so code reads in monospace whatever its language colours do. */
const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = this.build(update.view)
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const { doc } = view.state
      let last = 0
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter(node) {
            if (node.name !== 'FencedCode') return undefined
            for (let n = Math.max(doc.lineAt(node.from).number, last + 1); n <= doc.lineAt(node.to).number; n++) {
              builder.add(doc.line(n).from, doc.line(n).from, line)
              last = n
            }
            return false
          }
        })
      }
      return builder.finish()
    }
  },
  { decorations: (p) => p.decorations }
)

export const fencedCode: Extension = plugin
