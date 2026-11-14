<script lang="ts">
  import { rankSheets, type QuickOpenItem } from '@writingapp/core'

  let {
    items,
    onpick,
    oncancel
  }: { items: QuickOpenItem[]; onpick: (path: string) => void; oncancel: () => void } = $props()

  let query = $state('')
  let index = $state(0)
  const results = $derived(rankSheets(items, query))

  function focusInput(input: HTMLInputElement): void {
    input.focus()
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel()
    else if (e.key === 'ArrowDown') index = Math.min(index + 1, results.length - 1)
    else if (e.key === 'ArrowUp') index = Math.max(index - 1, 0)
    else if (e.key === 'Enter') {
      const item = results[index]
      if (item) onpick(item.path)
    } else return
    e.preventDefault()
  }

  function scrollActive(node: HTMLElement, active: boolean): void {
    if (active) node.scrollIntoView({ block: 'nearest' })
  }
</script>

<div class="dlg-backdrop" role="presentation" onmousedown={oncancel}>
  <div
    class="dlg dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Quick open"
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <input
      class="input"
      use:focusInput
      bind:value={query}
      oninput={() => (index = 0)}
      placeholder="Go to sheet…"
      aria-label="Go to sheet"
    />
    <ul role="listbox">
      {#each results as item, i (item.path)}
        <li role="presentation">
          <button
            role="option"
            aria-selected={i === index}
            class:active={i === index}
            tabindex="-1"
            onclick={() => onpick(item.path)}
            {@attach (node) => scrollActive(node, i === index)}
          >
            <span class="title">{item.title}</span>
            <span class="where">{item.where}</span>
          </button>
        </li>
      {:else}
        <li class="none">No sheet matches</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  input {
    margin: 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 8px;
    overflow-y: auto;
  }
  button {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    width: 100%;
    text-align: left;
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    cursor: default;
  }
  button.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    font-size: 12px;
    opacity: 0.7;
    white-space: nowrap;
  }
  .none {
    padding: 8px 10px;
    color: var(--muted);
  }
</style>
