import { syntaxTree } from '@codemirror/language'
import type { EditorState, Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const hidden = Decoration.replace({})

/** Marker nodes that go away whole. List bullets, task boxes, fences and tables stay. */
const MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'HighlightMark', 'QuoteMark'])

/** True when `from`..`to` sits on a line a selection touches. */
function onSelectedLine(state: EditorState, from: number, to: number): boolean {
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  for (const range of state.selection.ranges) {
    const a = state.doc.lineAt(range.from).number
    const b = state.doc.lineAt(range.to).number
    if (a <= last && b >= first) return true
  }
  return false
}

/** Characters of the marker plus the spaces after it, so `# ` and `> ` leave no gap. */
function withSpaces(state: EditorState, from: number, to: number): number {
  const line = state.doc.lineAt(from)
  let end = to
  while (end < line.to && state.sliceDoc(end, end + 1) === ' ') end++
  return end
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const ranges: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Image' || node.name === 'FencedCode' || node.name === 'CodeBlock') return false
        if (node.name === 'Link') {
          // [[Wiki links]] and [^footnotes] are drawn by their own code; leave them whole.
          const before = state.sliceDoc(Math.max(0, node.from - 1), node.from)
          const after = state.sliceDoc(node.to, node.to + 1)
          if ((before === '[' && after === ']') || state.sliceDoc(node.from + 1, node.from + 2) === '^') {
            return false
          }
          if (onSelectedLine(state, node.from, node.to)) return false
          // Hide the opening bracket and everything from the closing one on (address and
          // title included, as one range so no stray space is left); the link text stays.
          const open = node.node.firstChild
          const close = open?.nextSibling
          if (open?.name === 'LinkMark' && close?.name === 'LinkMark') {
            ranges.push(hidden.range(open.from, open.to))
            ranges.push(hidden.range(close.from, node.to))
          }
          return false
        }
        if (node.name === 'CodeMark' && node.node.parent?.name === 'InlineCode') {
          if (!onSelectedLine(state, node.from, node.to)) ranges.push(hidden.range(node.from, node.to))
          return
        }
        if (node.name === 'HeaderMark' && /^ATXHeading/.test(node.node.parent?.name ?? '')) {
          const end = withSpaces(state, node.from, node.to)
          const line = state.doc.lineAt(node.from)
          // A heading with no text yet keeps its hashes, so there is something to type after.
          if (end < line.to && !onSelectedLine(state, node.from, node.to)) {
            ranges.push(hidden.range(node.from, end))
          }
          return
        }
        if (MARKS.has(node.name) && !onSelectedLine(state, node.from, node.to)) {
          const end = node.name === 'QuoteMark' ? withSpaces(state, node.from, node.to) : node.to
          ranges.push(hidden.range(node.from, end))
        }
        return undefined
      }
    })
  }
  return Decoration.set(ranges, true)
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = build(update.view)
      }
    }
  },
  {
    decorations: (p) => p.decorations,
    // The cursor steps over a hidden marker as if it were one character.
    provide: (p) =>
      EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none)
  }
)

/** Hides emphasis, heading, quote, code and link markers except on the lines the cursor is on. */
export const hideMarkers: Extension = plugin
