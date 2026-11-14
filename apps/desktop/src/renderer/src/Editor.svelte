<script lang="ts">
  import { onMount } from 'svelte'
  import { Compartment } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import { createEditorState, fromDisk } from './editor'
  import { focusExtensions } from './focusMode'
  import { smartTypography } from './smartTypography'
  import { lineNumbers as lineNumbersExtension } from '@codemirror/view'
  import { linkCommand, toggleBold, toggleItalic } from './formatting'
  import { insertTable } from './tableWidget'
  import { goToFootnote, insertFootnote } from './footnotes'
  import { insertImages } from './imageThumbs'
  import { updateWikiHost } from './wikiLinks'
  import { formatCommand, styleOfLine, type FormatKind, type LineStyle } from './blockStyle'

  interface Props {
    /** The text to start from. Edits are reported through `onchange`. */
    text: string
    onchange: (text: string) => void
    onblur: () => void
    /** Escape was pressed: hand focus back to the sheet list. */
    onescape?: () => void
    /** The editor gained focus. */
    onfocus?: () => void
    /** The cursor hit the start or end; return true if focus moved elsewhere. */
    onedge?: (direction: 'back' | 'forward') => boolean
    /** The selected text changed; empty when the selection is. */
    onselection?: (selected: string) => void
    /** The cursor moved into another section: the index of its heading, -1 before the first. */
    onsection?: (heading: number) => void
    /** Dim everything but the current paragraph. */
    focusMode?: boolean
    /** Keep the cursor line in the middle of the window. */
    typewriter?: boolean
    /** What focus mode keeps bright. */
    focusScope?: 'line' | 'sentence' | 'paragraph'
    /** Where typewriter scrolling holds the line. */
    typewriterAt?: 'centre' | 'upper'
    /** Curly quotes, dashes and ellipses as you type. */
    smartTypography?: boolean
    /** Show line numbers in a gutter. */
    lineNumbers?: boolean
    /** Every sheet title, for [[wiki links]]. */
    titles?: string[]
    /** A wiki link was Cmd/Ctrl-clicked. */
    onwiki?: (target: string) => void
    /** Put the cursor in the editor when it opens. */
    autofocus?: boolean
  }

  let { text, onchange, onblur, onescape, onfocus, onedge,
    onselection,
    onsection,
    focusMode = false,
    typewriter = false,
    focusScope = 'paragraph',
    typewriterAt = 'centre',
    smartTypography: smart = false,
    lineNumbers = false,
    autofocus = false,
    titles = [],
    onwiki
  }: Props = $props()
  let view: EditorView | undefined

  export function focus(): void {
    view?.focus()
  }

  /** Focuses with the cursor at the start or end of the text. */
  export function focusAt(where: 'start' | 'end'): void {
    if (!view) return
    view.dispatch({
      selection: { anchor: where === 'start' ? 0 : view.state.doc.length },
      scrollIntoView: true
    })
    view.focus()
  }

  /** Puts the cursor at `offset` and scrolls it to the top of the view. */
  export function goTo(offset: number): void {
    if (!view) return
    const anchor = Math.min(offset, view.state.doc.length)
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 24 })
    })
    view.focus()
  }

  /** Applies a formatting command to the selection, as the keyboard shortcuts do. */
  export function format(kind: 'bold' | 'italic' | 'link' | FormatKind): void {
    if (!view) return
    const command =
      kind === 'bold'
        ? toggleBold
        : kind === 'italic'
          ? toggleItalic
          : kind === 'link'
            ? linkCommand
            : formatCommand(kind)
    command(view)
    view.focus()
  }

  /** The block style of the line the cursor is on. */
  export function lineStyle(): LineStyle {
    return view ? styleOfLine(view.state.doc.lineAt(view.state.selection.main.head).text) : 'body'
  }

  /** Inserts an empty table at the cursor and moves into it. */
  export function insertTableAtCursor(): void {
    if (view) insertTable(view)
  }

  /** Puts pictures (as Markdown) at the cursor. */
  export function insertImagesAtCursor(markdown: string[]): void {
    if (view) insertImages(view, markdown)
  }

  /** Adds a footnote at the cursor and opens it for typing. */
  export function insertFootnoteAtCursor(): void {
    if (view) insertFootnote(view)
  }

  /** Opens the note at the cursor, or moves between a note and its reference. */
  export function goToFootnoteAtCursor(): boolean {
    return view ? goToFootnote(view) : false
  }

  /** The text now in the editor. */
  export function getText(): string {
    return view?.state.doc.toString() ?? text
  }

  /** Swaps in text that changed on disk, keeping the cursor near where it was. No save follows. */
  export function replaceText(next: string): void {
    if (!view) return
    const head = Math.min(view.state.selection.main.head, next.length)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: head },
      annotations: fromDisk.of(true)
    })
  }

  /** The text and cursor position, if the cursor is in this editor. */
  export function cursorInfo(): { text: string; offset: number } | undefined {
    if (!view?.hasFocus) return undefined
    return { text: view.state.doc.toString(), offset: view.state.selection.main.head }
  }
  let host: HTMLDivElement
  const focusing = new Compartment()
  const gutter = new Compartment()
  const typography = new Compartment()

  // Focus mode and typewriter scrolling can change while the editor is open.
  $effect(() => {
    const options = { dim: focusMode, typewriter, scope: focusScope, position: typewriterAt }
    view?.dispatch({ effects: focusing.reconfigure(focusExtensions(options)) })
  })

  $effect(() => {
    const on = smart
    view?.dispatch({ effects: typography.reconfigure(on ? smartTypography : []) })
  })

  $effect(() => {
    const show = lineNumbers
    view?.dispatch({ effects: gutter.reconfigure(show ? lineNumbersExtension() : []) })
  })

  // The library's titles can change while the editor is open.
  $effect(() => {
    const list = [...titles]
    if (view) updateWikiHost(view, { titles: list, open: (target) => onwiki?.(target) })
  })

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: createEditorState(
        text,
        { onchange, onblur, onescape, onfocus, onedge, onselection, onsection },
        [
          focusing.of(
            focusExtensions({ dim: focusMode, typewriter, scope: focusScope, position: typewriterAt })
          ),
          gutter.of(lineNumbers ? lineNumbersExtension() : []),
          typography.of(smart ? smartTypography : [])
        ]
      )
    })
    updateWikiHost(view, { titles: [...titles], open: (target) => onwiki?.(target) })
    if (autofocus) view.focus()
    return () => view?.destroy()
  })
</script>

<div class="host" bind:this={host}></div>

<style>
  .host {
    min-width: 0;
  }
</style>
