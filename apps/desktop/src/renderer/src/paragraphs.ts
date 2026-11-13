import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const first = Decoration.line({ class: 'cm-para-first' })

/**
 * Marks the first line of each plain paragraph that follows another one.
 * Headings, lists, quotes and code are not paragraphs here. The stylesheet
 * indents these lines when "Indent paragraphs" is on; the text is untouched.
 */
export const paragraphStarts = ViewPlugin.fromClass(
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
      const { state } = view
      const tree = syntaxTree(state)
      for (const { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = state.doc.lineAt(pos)
          pos = line.to + 1
          if (line.number === 1 || line.text.trim() === '') continue
          const node = tree.resolveInner(line.from + (line.text.length - line.text.trimStart().length), 1)
          // A top-level paragraph that starts on this line.
          if (node.name !== 'Paragraph' || node.parent?.name !== 'Document') continue
          if (state.doc.lineAt(node.from).number !== line.number) continue
          // It only counts as "following another paragraph" if one comes before it.
          let before = line.number - 1
          while (before >= 1 && state.doc.line(before).text.trim() === '') before--
          if (before < 1) continue
          const prev = tree.resolveInner(state.doc.line(before).to, -1)
          if (prev.name === 'Paragraph' || prev.parent?.name === 'Paragraph') builder.add(line.from, line.from, first)
        }
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
