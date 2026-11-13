<script lang="ts">
  import type { Heading } from '@writingapp/core'

  export interface Entry extends Heading {
    /** The sheet the heading is in. */
    path: string
  }

  let { entries, onpick }: { entries: Entry[]; onpick: (entry: Entry) => void } = $props()
  const shallowest = $derived(entries.reduce((min, e) => Math.min(min, e.level), 6))
</script>

<aside class="outline" aria-label="Outline">
  <h2>Outline</h2>
  {#if entries.length === 0}
    <p class="none">No headings. Start a line with # to make one.</p>
  {:else}
    <ul>
      {#each entries as entry (entry.path + ':' + entry.offset)}
        <li style:padding-left="{(entry.level - shallowest) * 14 + 8}px">
          <button class:top={entry.level === shallowest} onclick={() => onpick(entry)}>
            {entry.text}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .outline {
    width: 240px;
    overflow-y: auto;
    background: var(--list);
    padding: 12px 6px;
  }
  h2 {
    margin: 0 8px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    border-radius: 5px;
    padding: 4px 6px;
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    cursor: default;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button.top {
    color: var(--text);
    font-weight: 600;
  }
  button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .none {
    margin: 0 8px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.4;
  }
</style>
