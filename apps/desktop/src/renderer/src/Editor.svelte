<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView } from '@codemirror/view'
  import { createEditorState } from './editor'

  interface Props {
    /** The text to start from. Edits are reported through `onchange`. */
    text: string
    onchange: (text: string) => void
    onblur: () => void
    /** Escape was pressed: hand focus back to the sheet list. */
    onescape?: () => void
    /** Put the cursor in the editor when it opens. */
    autofocus?: boolean
  }

  let { text, onchange, onblur, onescape, autofocus = false }: Props = $props()
  let view: EditorView | undefined

  export function focus(): void {
    view?.focus()
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
      state: createEditorState(text, { onchange, onblur, onescape })
    })
    if (autofocus) view.focus()
    return () => view?.destroy()
  })
</script>

<div class="host" bind:this={host}></div>

<style>
  .host {
    flex: 1;
    min-height: 0;
  }
</style>
