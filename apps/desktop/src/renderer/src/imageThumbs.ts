import { EditorState, RangeSet, StateField, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { assetNameFromUrl, droppedImageLink, findImages } from '@writingapp/core'

/**
 * A picture from the library's assets folder is drawn inline as a small fixed
 * square, whatever its shape, like Ulysses does. The Markdown underneath stays
 * plain, and the raw `![alt](.assets/name)` shows while the cursor is on it.
 */

/** Shows a picture at full size over the window; a click or Escape closes it. */
export function previewImage(src: string, alt: string): void {
  const shade = document.createElement('div')
  shade.className = 'image-preview'
  Object.assign(shade.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '1000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.72)',
    cursor: 'zoom-out'
  })
  const img = document.createElement('img')
  img.src = src
  img.alt = alt
  Object.assign(img.style, {
    maxWidth: '92vw',
    maxHeight: '92vh',
    objectFit: 'contain',
    borderRadius: '6px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)'
  })
  shade.append(img)
  const close = (): void => {
    shade.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  shade.addEventListener('click', close)
  document.addEventListener('keydown', onKey, true)
  document.body.append(shade)
}

/** Opens a small field over the thumbnail to change its alt text; Enter saves, Escape cancels. */
function editAlt(view: EditorView, box: HTMLElement, current: string): void {
  if (box.querySelector('.cm-image-alt-input')) return
  const input = document.createElement('input')
  input.className = 'cm-image-alt-input'
  input.value = current
  input.placeholder = 'Alt text'
  input.setAttribute('aria-label', 'Alt text')
  let done = false
  const finish = (save: boolean): void => {
    if (done) return
    done = true
    if (save) {
      const from = view.posAtDOM(box)
      const text = input.value.replace(/[[\]\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
      // The alt text sits right after the opening `![`.
      if (text !== current && view.state.sliceDoc(from, from + 2) === '![') {
        view.dispatch({ changes: { from: from + 2, to: from + 2 + current.length, insert: text }, userEvent: 'input' })
      }
    }
    input.remove()
    view.focus()
  }
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  })
  input.addEventListener('mousedown', (event) => event.stopPropagation())
  input.addEventListener('blur', () => finish(true))
  box.append(input)
  input.focus()
  input.select()
}

/** Web pictures the user has chosen to load in this session. */
const loadedWeb = new Set<string>()

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

class ThumbWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly alt: string,
    /** A web address, for a picture that is not in the library. */
    readonly remote = ''
  ) {
    super()
  }
  get src(): string {
    return this.remote || `wa-asset://library/${encodeURIComponent(this.name)}`
  }
  eq(other: ThumbWidget): boolean {
    return other.name === this.name && other.alt === this.alt && other.remote === this.remote
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('span')
    box.className = 'cm-image-thumb'
    const label = this.remote ? hostOf(this.remote) : this.name
    const show = (): void => {
      box.classList.remove('cm-image-web')
      box.querySelector('.cm-image-missing-label')?.remove()
      const img = document.createElement('img')
      img.src = this.src
      img.alt = this.alt
      img.title = this.alt
      img.draggable = false
      img.addEventListener('error', () => {
        box.classList.add('cm-image-missing')
        box.title = `Missing picture: ${label}`
        const note = document.createElement('span')
        note.className = 'cm-image-missing-label'
        note.textContent = label
        box.append(note)
      })
      box.prepend(img)
    }
    // A picture on the web is fetched only when asked for, so opening a sheet contacts no one.
    if (this.remote && !loadedWeb.has(this.remote)) {
      box.classList.add('cm-image-web')
      box.title = `Click to load the picture from ${label}`
      const note = document.createElement('span')
      note.className = 'cm-image-missing-label'
      note.textContent = `Load from ${label}`
      box.append(note)
    } else show()
    const badge = document.createElement('span')
    badge.className = 'cm-image-alt-badge'
    badge.textContent = this.alt ? 'Alt' : '+ Alt'
    badge.title = this.alt ? `Alt text: ${this.alt} (click to edit)` : 'Add alt text'
    badge.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      editAlt(view, box, this.alt)
    })
    box.append(badge)
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      if ((event.target as HTMLElement).closest('.cm-image-alt-input')) return
      if (box.classList.contains('cm-image-web')) {
        loadedWeb.add(this.remote)
        box.title = ''
        show()
        return
      }
      if (!box.classList.contains('cm-image-missing')) previewImage(this.src, this.alt)
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

function build(state: EditorState): DecorationSet {
  const sel = state.selection.main
  const ranges: Range<Decoration>[] = []
  for (const ref of findImages(state.doc.toString())) {
    const name = assetNameFromUrl(ref.url)
    const remote = /^https:\/\//i.test(ref.url) ? ref.url : ''
    if (!name && !remote) continue
    // The raw text shows while the cursor is inside it or it is selected.
    if (sel.from < ref.to && sel.to > ref.from) continue
    if (sel.empty && sel.head > ref.from && sel.head < ref.to) continue
    ranges.push(Decoration.replace({ widget: new ThumbWidget(name ?? '', ref.alt, remote) }).range(ref.from, ref.to))
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
      position: 'relative',
      cursor: 'zoom-in',
      width: '88px',
      height: '88px',
      verticalAlign: 'middle',
      margin: '2px 4px',
      borderRadius: '6px',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--pane)'
    },
    '.cm-image-alt-badge': {
      position: 'absolute',
      right: '4px',
      bottom: '4px',
      padding: '1px 6px',
      borderRadius: '8px',
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      background: 'rgba(0, 0, 0, 0.62)',
      color: '#fff',
      cursor: 'pointer',
      opacity: '0',
      transition: 'opacity 0.12s'
    },
    '.cm-image-thumb:hover .cm-image-alt-badge': { opacity: '1' },
    '.cm-image-alt-input': {
      position: 'absolute',
      left: '4px',
      right: '4px',
      bottom: '4px',
      font: '12px system-ui, sans-serif',
      padding: '3px 5px',
      border: '1px solid var(--accent)',
      borderRadius: '4px',
      background: 'var(--bg)',
      color: 'var(--text)',
      outline: 'none',
      boxSizing: 'border-box'
    },
    '.cm-image-thumb img': { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    '.cm-image-thumb.cm-image-missing': {
      cursor: 'default',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      border: '1px dashed var(--muted)',
      color: 'var(--muted)',
      fontSize: '11px',
      textAlign: 'center',
      padding: '4px',
      boxSizing: 'border-box'
    },
    '.cm-image-thumb.cm-image-missing img': { display: 'none' },
    '.cm-image-thumb.cm-image-web': {
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px dashed var(--muted)',
      color: 'var(--muted)',
      fontSize: '11px',
      textAlign: 'center',
      padding: '4px',
      boxSizing: 'border-box'
    },
    '.cm-image-thumb.cm-image-missing::before': { content: '"⚠︎"', fontSize: '20px' },
    '.cm-image-missing-label': { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  })
]

/**
 * The text to put in for `markdown` (one image per paragraph) over `from`..`to`: set off by blank
 * lines from any text sharing its line, so a picture added at the start of a heading's line does
 * not become part of the heading.
 */
export function imageInsertion(doc: Text, markdown: string[], from: number, to: number): string {
  const before = doc.lineAt(from).text.slice(0, from - doc.lineAt(from).from)
  const after = doc.lineAt(to).text.slice(to - doc.lineAt(to).from)
  return (before.trim() === '' ? '' : '\n\n') + markdown.join('\n\n') + (after.trim() === '' ? '' : '\n\n')
}

/** Puts Markdown (one image per paragraph) at `at`, or at the cursor. */
export function insertImages(view: EditorView, markdown: string[], at?: number): void {
  if (markdown.length === 0) return
  const { from, to } = at === undefined ? view.state.selection.main : { from: Math.min(at, view.state.doc.length), to: Math.min(at, view.state.doc.length) }
  const text = imageInsertion(view.state.doc, markdown, from, to)
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.paste',
    scrollIntoView: true
  })
  view.focus()
}

const PASTED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif'
}

/** Saves each picture file in the list and returns its Markdown. */
export async function saveImageFiles(files: File[]): Promise<string[]> {
  const markdown: string[] = []
  for (const file of files) {
    const ext = PASTED_TYPES[file.type]
    if (!ext) continue
    // A screenshot comes without a useful name.
    const name = /\.[a-z0-9]+$/i.test(file.name) ? file.name : `image.${ext}`
    markdown.push(await window.api.saveImage(name, new Uint8Array(await file.arrayBuffer())))
  }
  return markdown
}

const hasPictures = (dt: DataTransfer | null): boolean =>
  !!dt && [...dt.items].some((i) => i.kind === 'file' && i.type in PASTED_TYPES)

/** Pasting or dropping a picture (a screenshot, a copied image, a file) saves it beside the sheet and shows its thumbnail. */
export const imagePaste = EditorView.domEventHandlers({
  paste(event, view) {
    const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type in PASTED_TYPES)
    if (files.length === 0) return false
    event.preventDefault()
    void saveImageFiles(files).then((markdown) => insertImages(view, markdown))
    return true
  },
  dragover(event) {
    if (!hasPictures(event.dataTransfer)) return false
    event.preventDefault()
    return true
  },
  drop(event, view) {
    const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type in PASTED_TYPES)
    // At the spot it was dropped on, not wherever the cursor was.
    const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
    if (files.length === 0) {
      // A picture dragged out of a web page may come as an address only: link to it.
      const link = droppedImageLink(
        event.dataTransfer?.getData('text/html') ?? '',
        event.dataTransfer?.getData('text/uri-list') ?? ''
      )
      if (!link) return false
      event.preventDefault()
      insertImages(view, [link], at)
      return true
    }
    event.preventDefault()
    void saveImageFiles(files).then((markdown) => insertImages(view, markdown, at))
    return true
  }
})
