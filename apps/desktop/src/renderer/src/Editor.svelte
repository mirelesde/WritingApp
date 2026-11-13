<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView } from '@codemirror/view'
  import { createEditorState, fromDisk } from './editor'
  import { linkCommand, toggleBold, toggleItalic } from './formatting'

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
    /** Put the cursor in the editor when it opens. */
    autofocus?: boolean
  }

  let { text, onchange, onblur, onescape, onfocus, onedge, onselection, autofocus = false }: Props = $props()
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
  export function format(kind: 'bold' | 'italic' | 'link'): void {
    if (!view) return
    const command = { bold: toggleBold, italic: toggleItalic, link: linkCommand }[kind]
    command(view)
    view.focus()
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

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: createEditorState(text, { onchange, onblur, onescape, onfocus, onedge, onselection })
    })
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
