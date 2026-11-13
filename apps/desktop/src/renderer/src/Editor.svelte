<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView } from '@codemirror/view'
  import { createEditorState } from './editor'

  interface Props {
    /** The text to start from. Edits are reported through `onchange`. */
    text: string
    onchange: (text: string) => void
    onblur: () => void
  }

  let { text, onchange, onblur }: Props = $props()
  let host: HTMLDivElement

  onMount(() => {
    const view = new EditorView({
      parent: host,
      state: createEditorState(text, { onchange, onblur })
    })
    return () => view.destroy()
  })
</script>

<div class="host" bind:this={host}></div>

<style>
  .host {
    flex: 1;
    min-height: 0;
  }
</style>
