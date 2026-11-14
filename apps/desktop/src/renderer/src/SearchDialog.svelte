<script lang="ts">
  import type { SearchHit } from '@writingapp/core'
  import { errorMessage } from './organise'

  let {
    onpick,
    oncancel,
    onreplace
  }: {
    onpick: (path: string) => void
    oncancel: () => void
    onreplace: (query: string, replacement: string, path?: string) => Promise<number>
  } = $props()

  let replacement = $state('')
  let showReplace = $state(false)
  let done = $state('')

  async function replace(path?: string): Promise<void> {
    const n = await onreplace(query, replacement, path)
    done = n > 0 ? `Replaced ${n} ${n === 1 ? 'match' : 'matches'}` : ''
    await run()
  }

  let query = $state('')
  let hits = $state<SearchHit[]>([])
  let index = $state(0)
  let searched = $state(false)
  let problem = $state('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  function focusInput(input: HTMLInputElement): void {
    input.focus()
  }

  function typed(): void {
    clearTimeout(timer)
    timer = setTimeout(run, 150)
  }

  async function run(): Promise<void> {
    const id = ++latest
    try {
      const found = await window.api.search(query)
      if (id !== latest) return // a newer search has started
      hits = found
      index = 0
      searched = query.trim() !== ''
      problem = ''
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel()
    else if (e.key === 'ArrowDown') index = Math.min(index + 1, hits.length - 1)
    else if (e.key === 'ArrowUp') index = Math.max(index - 1, 0)
    else if (e.key === 'Enter') {
      const hit = hits[index]
      if (hit) onpick(hit.path)
    } else return
    e.preventDefault()
  }
</script>

<div class="backdrop" role="presentation" onmousedown={oncancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Find in library"
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <input
      use:focusInput
      bind:value={query}
      oninput={typed}
      placeholder="Search every sheet"
      aria-label="Search every sheet"
    />
    <div class="replace">
      {#if showReplace}
        <input
          bind:value={replacement}
          placeholder="Replace with"
          aria-label="Replace with"
          onkeydown={(e) => {
            if (e.key === 'Enter' && e.metaKey) void replace()
          }}
        />
        <button class="all" disabled={hits.length === 0} onclick={() => void replace()}>Replace All</button>
      {:else}
        <button class="link" onclick={() => (showReplace = true)}>Replace…</button>
      {/if}
      {#if done}<span class="done" role="status">{done}</span>{/if}
    </div>
    <ul role="listbox">
      {#each hits as hit, i (hit.path)}
        <li role="presentation">
          <button
            role="option"
            aria-selected={i === index}
            class:active={i === index}
            tabindex="-1"
            onclick={() => onpick(hit.path)}
          >
            <span class="title">{hit.title}</span>
            <span class="where">{hit.where}{hit.count > 1 ? ` · ${hit.count} matches` : ''}</span>
            <span class="snippet"
              >{hit.before}<mark class:struck={showReplace}>{hit.match}</mark
              >{#if showReplace}<ins>{replacement}</ins>{/if}{hit.after}</span
            >
          </button>
          {#if showReplace}
            <button class="one" tabindex="-1" onclick={() => void replace(hit.path)}>Replace in this sheet</button>
          {/if}
        </li>
      {:else}
        {#if problem}
          <li class="none">{problem}</li>
        {:else if searched}
          <li class="none">No sheet contains that</li>
        {/if}
      {/each}
    </ul>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: rgb(0 0 0 / 0.25);
    z-index: 10;
  }
  .dialog {
    width: min(620px, calc(100vw - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
    overflow: hidden;
  }
  input {
    margin: 10px;
    padding: 8px 10px;
    font: inherit;
    color: inherit;
    background: var(--pane);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
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
    gap: 2px 12px;
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
    color: #fff;
  }
  .title {
    font-weight: 600;
  }
  .where {
    font-size: 12px;
    opacity: 0.7;
  }
  .snippet {
    grid-column: 1 / -1;
    font-size: 13px;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  mark {
    background: rgb(255 200 0 / 0.35);
    color: inherit;
    border-radius: 2px;
  }
  .replace {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 6px;
  }
  .replace input {
    flex: 1;
    margin: 0;
  }
  .replace button {
    width: auto;
    display: block;
    border: 1px solid var(--border);
    padding: 5px 10px;
  }
  .replace button.link {
    border: none;
    padding: 0 2px;
    color: var(--muted);
  }
  .replace button:disabled {
    opacity: 0.4;
  }
  .done {
    font-size: 12px;
    color: var(--muted);
  }
  mark.struck {
    text-decoration: line-through;
    opacity: 0.7;
  }
  ins {
    text-decoration: none;
    background: rgb(60 180 90 / 0.3);
    border-radius: 2px;
  }
  button.one {
    display: block;
    width: auto;
    margin: 0 0 4px 10px;
    padding: 2px 8px;
    font-size: 12px;
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .none {
    padding: 8px 10px;
    color: var(--muted);
  }
</style>
