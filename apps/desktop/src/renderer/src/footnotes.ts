import { EditorState, RangeSet, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import {
  addFootnoteChanges,
  findFootnoteDefs,
  findFootnoteRefs,
  footnoteJump,
  removeFootnoteChanges,
  setFootnoteChange
} from '@writingapp/core'

/*
 * Footnotes in the editor: each `[^id]` reference is drawn as a small chip,
 * the definition lines are hidden, and clicking a chip opens the note in a
 * small popover next to the text, where it is edited. The Markdown underneath
 * stays plain, and the raw text shows when the cursor is on it.
 */

class ChipWidget extends WidgetType {
  constructor(readonly id: string) {
    super()
  }
  eq(other: ChipWidget): boolean {
    return other.id === this.id
  }
  toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement('span')
    chip.className = 'cm-footnote-chip'
    chip.textContent = '✱'
    chip.dataset.id = this.id
    chip.title = 'Footnote'
    chip.addEventListener('mousedown', (event) => {
      event.preventDefault()
      openFootnote(view, this.id, chip)
    })
    return chip
  }
  ignoreEvent(): boolean {
    return true
  }
}

class HiddenNote extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-footnote-hidden'
    return el
  }
}

function build(state: EditorState): { all: DecorationSet; chips: DecorationSet } {
  const text = state.doc.toString()
  const sel = state.selection.main
  const chips: Range<Decoration>[] = []
  const all: Range<Decoration>[] = []
  for (const ref of findFootnoteRefs(text)) {
    // The raw `[^1]` shows while the cursor is inside it.
    if (sel.from < ref.to && sel.to > ref.from) continue
    if (sel.empty && sel.head > ref.from && sel.head < ref.to) continue
    const range = Decoration.replace({ widget: new ChipWidget(ref.id) }).range(ref.from, ref.to)
    chips.push(range)
    all.push(range)
  }
  for (const def of findFootnoteDefs(text)) {
    if (sel.from <= def.to && sel.to >= def.from) continue
    all.push(Decoration.replace({ widget: new HiddenNote(), block: true }).range(def.from, def.to))
  }
  return { all: Decoration.set(all, true), chips: Decoration.set(chips, true) }
}

const field = StateField.define<{ all: DecorationSet; chips: DecorationSet }>({
  create: build,
  update(value, tr) {
    return tr.docChanged || tr.selection ? build(tr.state) : value
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.all),
    EditorView.atomicRanges.of((view) => view.state.field(f).chips ?? RangeSet.empty)
  ]
})

let popover: { el: HTMLElement; close: () => void } | null = null

/** Closes the note popover, if one is open. */
export function closeFootnote(): void {
  popover?.close()
}

/** Opens the note with this id in a popover under `anchor` (or its reference), for editing. */
export function openFootnote(view: EditorView, id: string, anchor?: HTMLElement): void {
  closeFootnote()
  const doc = view.state.doc.toString()
  const note = findFootnoteDefs(doc).find((d) => d.id === id)

  const el = document.createElement('div')
  el.className = 'cm-footnote-popover'
  const area = document.createElement('textarea')
  area.className = 'cm-footnote-text'
  area.value = note?.text ?? ''
  area.rows = 1
  area.setAttribute('aria-label', 'Footnote')
  area.placeholder = 'Footnote'
  const remove = document.createElement('button')
  remove.className = 'cm-footnote-remove'
  remove.textContent = 'Remove'
  remove.title = 'Remove this footnote'
  el.append(area, remove)
  document.body.append(el)

  const fit = (): void => {
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }
  const place = (): void => {
    const target = anchor ?? view.dom.querySelector<HTMLElement>(`.cm-footnote-chip[data-id="${CSS.escape(id)}"]`)
    const ref = findFootnoteRefs(view.state.doc.toString()).find((r) => r.id === id)
    const rect = target?.isConnected
      ? target.getBoundingClientRect()
      : ref
        ? view.coordsAtPos(ref.from)
        : null
    const left = rect ? rect.left : 40
    const top = rect ? rect.bottom + 6 : 40
    el.style.left = `${Math.max(8, Math.min(left - 12, window.innerWidth - el.offsetWidth - 8))}px`
    el.style.top = `${Math.min(top, window.innerHeight - el.offsetHeight - 8)}px`
  }
  fit()
  place()

  const close = (): void => {
    document.removeEventListener('mousedown', outside, true)
    el.remove()
    popover = null
    // An empty note is not worth keeping.
    const now = view.state.doc.toString()
    const def = findFootnoteDefs(now).find((d) => d.id === id)
    if (def && def.text.trim() === '') {
      view.dispatch({ changes: removeFootnoteChanges(now, id), userEvent: 'delete.footnote' })
    }
    view.focus()
  }
  const outside = (event: MouseEvent): void => {
    if (!el.contains(event.target as Node)) close()
  }
  popover = { el, close }
  document.addEventListener('mousedown', outside, true)

  area.addEventListener('input', () => {
    fit()
    place()
    const change = setFootnoteChange(view.state.doc.toString(), id, area.value)
    view.dispatch({ changes: change, userEvent: 'input.footnote' })
  })
  area.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault()
      close()
    } else if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyJ') {
      // Go to footnote from inside a note: close it and move on to the next reference.
      event.preventDefault()
      close()
      const refs = findFootnoteRefs(view.state.doc.toString())
      const at = refs.findIndex((r) => r.id === id)
      const next = refs[(at + 1) % refs.length]
      if (next && refs.length > 1) {
        view.dispatch({ selection: { anchor: next.to }, scrollIntoView: true, userEvent: 'select' })
      }
    }
  })
  remove.addEventListener('click', () => {
    el.remove()
    document.removeEventListener('mousedown', outside, true)
    popover = null
    view.dispatch({
      changes: removeFootnoteChanges(view.state.doc.toString(), id),
      userEvent: 'delete.footnote'
    })
    view.focus()
  })
  area.focus()
}

/** Adds a footnote at the cursor and opens its note for typing. */
export function insertFootnote(view: EditorView): void {
  const doc = view.state.doc.toString()
  const head = view.state.selection.main.head
  const { id, changes, refEnd } = addFootnoteChanges(doc, head)
  view.dispatch({ changes, selection: { anchor: refEnd }, userEvent: 'input.footnote' })
  openFootnote(view, id)
}

/**
 * Go to footnote: at a reference, open its note; inside a definition, go to its
 * reference; elsewhere, go to the next reference. Returns whether there was one.
 */
export function goToFootnote(view: EditorView): boolean {
  const jump = footnoteJump(view.state.doc.toString(), view.state.selection.main.head)
  if (!jump) return false
  if (jump.action === 'open') openFootnote(view, jump.id)
  else view.dispatch({ selection: { anchor: jump.pos }, scrollIntoView: true, userEvent: 'select' })
  return true
}

/** Cmd/Ctrl+Alt+J. */
export const footnoteKeymap = [{ key: 'Mod-Alt-j', run: goToFootnote, preventDefault: true }]

/** The footnote chips and hidden notes, plus the popover editor. */
export const footnotes = [field]
