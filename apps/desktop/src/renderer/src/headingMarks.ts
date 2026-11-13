import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const hang = Decoration.mark({ class: 'cm-hang' })
const gap = Decoration.mark({ class: 'cm-hang-gap' })
const rule = Decoration.line({ class: 'cm-rule' })
const activeRule = Decoration.line({ class: 'cm-rule cm-rule-active' })

/**
 * Tags the `#` characters of a heading, and the spaces after them (and the dashes of a
 * `---` separator), so the
 * stylesheet can hang the hashes in the left margin and keep the heading
 * text flush with the body text. Without the `hang-marks` class on the page
 * they are plain text and nothing changes.
 */
export const headingMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = this.build(update.view)
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const { state } = view
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(state).iterate({
          from,
          to,
          enter(node) {
            if (node.name === 'HorizontalRule') {
              // A --- separator: the line is drawn across the page, its dashes hang in the margin.
              const line = state.doc.lineAt(node.from)
              const here = state.doc.lineAt(state.selection.main.head).number === line.number
              builder.add(line.from, line.from, here ? activeRule : rule)
              builder.add(node.from, node.to, hang)
              return
            }
            if (node.name !== 'HeaderMark') return
            if (!/^ATXHeading/.test(node.node.parent?.name ?? '')) return
            const line = state.doc.lineAt(node.from)
            let end = node.to
            while (end < line.to && state.sliceDoc(end, end + 1) === ' ') end++
            builder.add(node.from, node.to, hang)
            if (end > node.to) builder.add(node.to, end, gap)
          }
        })
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
