<script lang="ts">
  import { textStats } from '@writingapp/core'
  import DiffView from './DiffView.svelte'

  interface Props {
    /** The sheet and the sync service's copy of it. */
    original: { name: string; text: string }
    copy: { name: string; text: string }
    position: number
    total: number
    /** Saves `text` as the sheet and moves the copy to the trash. */
    onresolve: (text: string) => void
    /** Leaves both sheets as they are. */
    onskip: () => void
    oncancel: () => void
  }

  let { original, copy, position, total, onresolve, onskip, oncancel }: Props = $props()

  let merged = $state('')
  let chosenB = $state(0)
  const words = (text: string): string => `${textStats(text).words.toLocaleString()} words`

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="dlg-backdrop centered modal" role="presentation">
  <div
    class="dlg dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="copy-title"
    tabindex="-1"
    use:focusFirst
    onkeydown={(e) => e.key === 'Escape' && oncancel()}
  >
    <h2 id="copy-title">
      Sync conflict: “{original.name}”
      {#if total > 1}<small>{position} of {total}</small>{/if}
    </h2>
    <p>
      A sync service kept two versions of this sheet. Pick a side for each difference; the result is
      saved as “{original.name}” and “{copy.name}” goes to the trash (Undo Library Change brings it
      back).
    </p>
    <p class="counts">{original.name}: {words(original.text)} · {copy.name}: {words(copy.text)}</p>
    <DiffView
      a={original.text}
      b={copy.text}
      labelA="The sheet"
      labelB="The conflicted copy"
      bind:result={merged}
      bind:chosenB
    />
    <div class="buttons">
      <button onclick={oncancel}>Close</button>
      <button onclick={onskip}>{total > 1 ? 'Skip this one' : 'Leave both'}</button>
      <button class="primary" onclick={() => onresolve(merged)}>
        {chosenB === 0 ? 'Keep the sheet, trash the copy' : 'Save combined text, trash the copy'}
      </button>
    </div>
  </div>
</div>

<style>
  .dialog {
    width: min(900px, 94vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
  }
  h2 small {
    font-weight: 400;
    color: var(--muted);
    margin-left: 6px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: calc(13px * var(--ui-scale, 1));
  }
  .counts {
    font-size: calc(12px * var(--ui-scale, 1));
  }
</style>
