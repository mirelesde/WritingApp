<script lang="ts">
  import { textStats } from '@writingapp/core'
  import DiffView from './DiffView.svelte'

  interface Props {
    /** The sheet's file name, for the heading. */
    name: string
    /** What is in the editor. */
    mine: string
    /** What is on disk now. */
    disk: string
    onkeep: () => void
    onuse: () => void
    /** Saves the text built by choosing a side for each difference. */
    onmerge: (text: string) => void
  }

  let { name, mine, disk, onkeep, onuse, onmerge }: Props = $props()

  let merged = $state('')
  const mixed = $derived(merged !== mine && merged !== disk)

  const words = (text: string): string => `${textStats(text).words.toLocaleString()} words`

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="backdrop" role="presentation">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" tabindex="-1" use:focusFirst>
    <h2 id="conflict-title">“{name}” changed outside the app</h2>
    <p>
      Something else, such as a sync client or another editor, saved this sheet while you had
      unsaved changes. Pick a side for each difference, or keep one whole version.
    </p>
    <p class="counts">Your version: {words(mine)} · On disk: {words(disk)}</p>
    <DiffView a={mine} b={disk} labelA="Your version" labelB="On disk" bind:result={merged} />
    <div class="buttons">
      {#if mixed}<button onclick={() => onmerge(merged)}>Use my choices</button>{/if}
      <button onclick={onuse}>Use the disk version</button>
      <button class="primary" onclick={onkeep}>Keep my version</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
  }
  .dialog {
    width: min(860px, 92vw);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .counts {
    font-size: 12px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--text);
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
</style>
