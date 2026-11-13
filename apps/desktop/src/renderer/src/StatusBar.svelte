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

<footer class="bar" aria-label="Word count">
  {#if part}
    <span>{n(part.words)} of {plural(all.words, 'word')} selected</span>
    <span>{plural(part.characters, 'character')}</span>
  {:else}
    <span>{plural(all.words, 'word')}</span>
    <span>{plural(all.characters, 'character')}</span>
    <span>{all.minutes === 0 ? '0 min read' : `${all.minutes} min read`}</span>
  {/if}
  {#if groupWords !== null}
    <span class="group">Group: {plural(groupWords, 'word')}</span>
  {/if}
</footer>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    padding: 6px 16px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--border);
    background: var(--bg);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .bar span {
    white-space: nowrap;
  }
  .group {
    margin-left: auto;
  }
</style>
