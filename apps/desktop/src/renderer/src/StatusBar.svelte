<script lang="ts">
  import { textStats } from '@writingapp/core'

  interface Props {
    /** Everything in the open run, as it is being edited. */
    text: string
    /** The selected text, or an empty string. */
    selected: string
    /** Total words in the sheets' group, once known. */
    groupWords: number | null
  }

  let { text, selected, groupWords }: Props = $props()

  const all = $derived(textStats(text))
  const part = $derived(selected === '' ? null : textStats(selected))
  const n = (value: number): string => value.toLocaleString()
  const plural = (value: number, word: string): string =>
    `${n(value)} ${word}${value === 1 ? '' : 's'}`
</script>

<!-- A small pill in the corner of the editor; hovering it shows the rest of the numbers. -->
<div class="pill" role="status" aria-label="Word count">
  <span class="main">
    {#if part}
      {n(part.words)} of {plural(all.words, 'word')} selected
    {:else}
      {plural(all.words, 'word')}
    {/if}
  </span>
  <span class="more">
    <span>{plural(part ? part.characters : all.characters, 'character')} with spaces</span>
    {#if !part}
      <span>{all.minutes === 0 ? '0 min read' : `${all.minutes} min read`}</span>
    {/if}
    {#if groupWords !== null}<span>This group: {plural(groupWords, 'word')}</span>{/if}
  </span>
</div>

<style>
  .pill {
    grid-column: 1;
    grid-row: 3;
    justify-self: end;
    align-self: start;
    margin: 12px 20px 0 0;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 5px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--muted);
    font-size: calc(13px * var(--ui-scale, 1));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    user-select: none;
    backdrop-filter: blur(8px);
    outline: none;
  }
  .more {
    display: none;
    gap: 14px;
    margin-left: 14px;
    padding-left: 14px;
    border-left: 1px solid var(--border);
  }
  .pill:hover .more {
    display: flex;
  }
  .pill:hover {
    color: var(--text);
  }
</style>
