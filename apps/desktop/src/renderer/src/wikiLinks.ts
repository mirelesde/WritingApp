import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { findWikiLinks, titleKey } from '@writingapp/core'

/** What the editor needs to know about the library to draw and follow [[wiki links]]. */
export interface WikiHost {
  /** Every sheet title, in library order. */
  titles: string[]
  /** Open the sheet with this title. */
  open: (target: string) => void
}

const setHost = StateEffect.define<WikiHost>()

const hostField = StateField.define<WikiHost>({
  create: () => ({ titles: [], open: () => {} }),
  update: (host, tr) => {
    for (const e of tr.effects) if (e.is(setHost)) return e.value
    return host
  }
})

/** Gives the editor the library's titles; call again when they change. */
export function updateWikiHost(view: EditorView, host: WikiHost): void {
  view.dispatch({ effects: setHost.of(host) })
}

const found = Decoration.mark({ class: 'cm-wiki-link' })
const missing = Decoration.mark({ class: 'cm-wiki-link cm-wiki-missing' })

function build(view: EditorView): DecorationSet {
  const known = new Set(view.state.field(hostField).titles.map(titleKey))
  const builder = new RangeSetBuilder<Decoration>()
  for (const link of findWikiLinks(view.state.doc.toString())) {
    builder.add(link.from, link.to, known.has(titleKey(link.target)) ? found : missing)
  }
  return builder.finish()
}

const marks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate): void {
      const hostChanged = update.transactions.some((t) => t.effects.some((e) => e.is(setHost)))
      if (update.docChanged || hostChanged) this.decorations = build(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/** The link whose brackets contain `pos`, if any. */
function linkAt(view: EditorView, pos: number): string | null {
  const link = findWikiLinks(view.state.doc.toString()).find((l) => pos >= l.from && pos <= l.to)
  return link?.target ?? null
}

/** Cmd/Ctrl-click opens the linked sheet. */
const follow = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return false
    const target = linkAt(view, pos)
    if (target === null) return false
    event.preventDefault()
    view.state.field(hostField).open(target)
    return true
  }
})

/** Titles to offer inside an open `[[`. */
function complete(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[[^\[\]\n|]*/)
  if (!match) return null
  const from = match.from + 2
  const query = titleKey(match.text.slice(2))
  const titles = context.state.field(hostField).titles
  const seen = new Set<string>()
  const starts: string[] = []
  const contains: string[] = []
  for (const title of titles) {
    const key = titleKey(title)
    if (seen.has(key)) continue
    seen.add(key)
    if (key.startsWith(query)) starts.push(title)
    else if (key.includes(query)) contains.push(title)
  }
  const options = [...starts, ...contains].slice(0, 12).map((title) => ({
    label: title,
    apply: (view: EditorView, _c: unknown, start: number, end: number) => {
      // Finish the brackets, or step over ones already there.
      const closed = view.state.sliceDoc(end, end + 2) === ']]'
      view.dispatch({
        changes: { from: start, to: end, insert: closed ? title : `${title}]]` },
        selection: { anchor: start + title.length + 2 },
        userEvent: 'input.complete'
      })
    }
  }))
  return options.length === 0 ? null : { from, options, filter: false }
}

/** [[Wiki links]]: drawn as chips (dashed when the sheet does not exist), completed from titles, Cmd/Ctrl-click to open. */
export const wikiLinks: Extension = [
  hostField,
  marks,
  follow,
  autocompletion({ override: [complete], icons: false })
]
