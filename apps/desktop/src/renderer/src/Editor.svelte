<script lang="ts">
  import { onMount } from 'svelte'
  import { Compartment } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import { closeSearchPanel, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search'
  import { createEditorState, fromDisk } from './editor'
  import { focusExtensions } from './focusMode'
  import { smartTypography } from './smartTypography'
  import { lineNumbers as lineNumbersExtension } from '@codemirror/view'
  import { insertParagraphBreak, linkCommand, toggleBold, toggleItalic } from './formatting'
  import { insertTable } from './tableWidget'
  import { insertContents } from './contentsChip'
  import { toggleTaskCommand } from './taskBoxes'
  import { nextHeading, previousHeading } from './headingJump'
  import { goToFootnote, insertFootnote } from './footnotes'
  import { insertImages } from './imageThumbs'
  import { updateWikiHost } from './wikiLinks'
  import { hideMarkers as hideMarkersExtension } from './hideMarkers'
  import { toggleCurrent, foldAllSections, foldedHeadings, restoreFolds, reveal, unfoldAllSections } from './foldSections'
  import { recallFolds, rememberFolds } from './foldMemory'
  import { foldedRanges } from '@codemirror/language'
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
    /** Cmd/Ctrl+F, +Alt+F or +G was pressed: the Find bar takes it from here. */
    onfind?: (action: 'find' | 'replace' | 'next' | 'previous') => void
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
    /** Hide Markdown markers away from the cursor. */
    hideMarkers?: boolean
    /** Show line numbers in a gutter. */
    lineNumbers?: boolean
    /** Every sheet title, for [[wiki links]]. */
    titles?: string[]
    /** A wiki link was Cmd/Ctrl-clicked. */
    onwiki?: (target: string) => void
    /** Identifies the sheet, so its folded sections are remembered. */
    foldKey?: string
    /** Put the cursor in the editor when it opens. */
    autofocus?: boolean
  }

  let { text, onchange, onblur, onescape, onfocus, onedge,
    onselection,
    onsection,
    onfind,
    focusMode = false,
    typewriter = false,
    focusScope = 'paragraph',
    typewriterAt = 'centre',
    smartTypography: smart = false,
    hideMarkers: hide = false,
    lineNumbers = false,
    autofocus = false,
    titles = [],
    foldKey,
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
    reveal(view, anchor)
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 24 })
    })
    view.focus()
  }

  /** Applies a formatting command to the selection, as the keyboard shortcuts do. */
  export function format(kind: 'bold' | 'italic' | 'link' | 'paragraph' | FormatKind): void {
    if (!view) return
    if (kind === 'paragraph') {
      view.dispatch(insertParagraphBreak(view.state))
      view.focus()
      return
    }
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

  /** Ticks or unticks the task item the cursor is on; false when it is not on one. */
  export function toggleTaskAtCursor(): boolean {
    return view ? toggleTaskCommand(view) : false
  }

  /** Moves the cursor to the previous or next heading. */
  export function jumpHeading(direction: 'previous' | 'next'): void {
    if (view) (direction === 'next' ? nextHeading : previousHeading)(view)
  }

  /** Folds or opens the section under the heading nearest above the cursor. */
  export function foldSectionAtCursor(fold: boolean): void {
    if (view) toggleCurrent(fold)(view)
  }

  /** Folds every section, or opens them all. */
  export function foldSections(fold: boolean): void {
    if (!view) return
    if (fold) foldAllSections(view)
    else unfoldAllSections(view)
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

  /** Adds a table of contents (`(cnt)`) at the cursor. */
  export function insertContentsAtCursor(): void {
    if (view) insertContents(view)
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

  /** Marks every match of a query in the text; a blank query clears the marks. */
  export function markMatches(query: string, options: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }): void {
    if (!view) return
    if (query.trim() === '') {
      closeSearchPanel(view)
      return
    }
    openSearchPanel(view)
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: query,
          caseSensitive: options.caseSensitive === true,
          wholeWord: options.wholeWord === true,
          regexp: options.regex === true
        })
      )
    })
  }

  /** Clears the marks left by `markMatches`. */
  export function clearMarks(): void {
    if (view) closeSearchPanel(view)
  }

  /** Selects a stretch of text and scrolls it into view, without taking focus. */
  export function selectRange(from: number, to: number): void {
    if (!view) return
    const end = view.state.doc.length
    const a = Math.min(from, end)
    reveal(view, a)
    view.dispatch({
      selection: { anchor: a, head: Math.min(to, end) },
      effects: EditorView.scrollIntoView(a, { y: 'center' })
    })
  }

  /** Replaces text in the editor, as one undo step. */
  export function replaceRanges(changes: { from: number; to: number; insert: string }[]): void {
    view?.dispatch({ changes, userEvent: 'input.replace' })
  }

  /** The cursor, or the start of the selection. */
  export function cursorOffset(): number {
    return view?.state.selection.main.from ?? 0
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
  const markers = new Compartment()

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
    const on = hide
    view?.dispatch({ effects: markers.reconfigure(on ? hideMarkersExtension : []) })
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
        { onchange, onblur, onescape, onfocus, onedge, onselection, onsection, onfind },
        [
          focusing.of(
            focusExtensions({ dim: focusMode, typewriter, scope: focusScope, position: typewriterAt })
          ),
          gutter.of(lineNumbers ? lineNumbersExtension() : []),
          typography.of(smart ? smartTypography : []),
          markers.of(hide ? hideMarkersExtension : []),
          EditorView.updateListener.of((update) => {
            if (foldKey && foldedRanges(update.state) !== foldedRanges(update.startState)) {
              rememberFolds(foldKey, foldedHeadings(update.state))
            }
          })
        ]
      )
    })
    updateWikiHost(view, { titles: [...titles], open: (target) => onwiki?.(target) })
    if (foldKey) restoreFolds(view, recallFolds(foldKey))
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
