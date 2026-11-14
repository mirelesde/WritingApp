import { EditorState, RangeSet, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { assetNameFromUrl, findImages } from '@writingapp/core'

/**
 * A picture from the library's assets folder is drawn inline as a small fixed
 * square, whatever its shape, like Ulysses does. The Markdown underneath stays
 * plain, and the raw `![alt](.assets/name)` shows while the cursor is on it.
 */

class ThumbWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly alt: string
  ) {
    super()
  }
  eq(other: ThumbWidget): boolean {
    return other.name === this.name && other.alt === this.alt
  }
  toDOM(): HTMLElement {
    const box = document.createElement('span')
    box.className = 'cm-image-thumb'
    const img = document.createElement('img')
    img.src = `wa-asset://library/${encodeURIComponent(this.name)}`
    img.alt = this.alt
    img.title = this.alt
    img.draggable = false
    img.addEventListener('error', () => box.classList.add('cm-image-missing'))
    box.append(img)
    return box
  }
  ignoreEvent(): boolean {
    return false
  }
}

function build(state: EditorState): DecorationSet {
  const sel = state.selection.main
  const ranges: Range<Decoration>[] = []
  for (const ref of findImages(state.doc.toString())) {
    const name = assetNameFromUrl(ref.url)
    if (!name) continue
    // The raw text shows while the cursor is on or inside it.
    if (sel.from <= ref.to && sel.to >= ref.from) continue
    ranges.push(Decoration.replace({ widget: new ThumbWidget(name, ref.alt) }).range(ref.from, ref.to))
  }
  return Decoration.set(ranges, true)
}

const field = StateField.define<DecorationSet>({
  create: build,
  update: (value, tr) => (tr.docChanged || tr.selection ? build(tr.state) : value),
  provide: (f) => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f) ?? RangeSet.empty)
  ]
})

export const imageThumbs = [
  field,
  EditorView.theme({
    '.cm-image-thumb': {
      display: 'inline-block',
      width: '88px',
      height: '88px',
      verticalAlign: 'middle',
      margin: '2px 4px',
      borderRadius: '6px',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--pane)'
    },
    '.cm-image-thumb img': { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    '.cm-image-thumb.cm-image-missing': { opacity: '0.4' }
  })
]

/** Puts Markdown (one image per line) at the cursor. */
export function insertImages(view: EditorView, markdown: string[]): void {
  if (markdown.length === 0) return
  const { from, to } = view.state.selection.main
  const text = markdown.join('\n\n')
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.paste',
    scrollIntoView: true
  })
  view.focus()
}
