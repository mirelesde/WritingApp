<script lang="ts">
  import { cleanKeywords, normalizeKeyword } from '@writingapp/core'

  interface Props {
    /** The sheets being edited, with the keywords each has now. */
    sheets: { path: string; title: string; keywords: string[] }[]
    /** Every keyword in the library, for suggestions. */
    known: { keyword: string; count: number }[]
    /** Called with the keywords to add to every sheet and the ones to take off. */
    onapply: (add: string[], remove: string[]) => void
    oncancel: () => void
  }

  let { sheets, known, onapply, oncancel }: Props = $props()

  let draft = $state('')
  let added = $state<string[]>([])
  let removed = $state<string[]>([])

  const lower = (s: string): string => s.toLowerCase()

  /** Keywords on the selection (with how many sheets have each), then those about to be added. */
  const current = $derived.by(() => {
    const counts = new Map<string, { keyword: string; count: number }>()
    for (const sheet of sheets) {
      for (const keyword of sheet.keywords) {
        const entry = counts.get(lower(keyword))
        if (entry) entry.count++
        else counts.set(lower(keyword), { keyword, count: 1 })
      }
    }
    for (const keyword of added) counts.set(lower(keyword), { keyword, count: sheets.length })
    for (const key of removed) counts.delete(key)
    return [...counts.values()].sort((a, b) => a.keyword.localeCompare(b.keyword, 'en', { sensitivity: 'base' }))
  })
  const suggestions = $derived(
    known.filter((k) => !current.some((c) => lower(c.keyword) === lower(k.keyword)))
  )
  const changed = $derived(added.length > 0 || removed.length > 0)

  function add(raw: string): void {
    for (const keyword of cleanKeywords(raw.split(','))) {
      removed = removed.filter((k) => k !== lower(keyword))
      const have = current.find((c) => lower(c.keyword) === lower(keyword))
      if (have?.count === sheets.length) continue
      added = [...added.filter((k) => lower(k) !== lower(keyword)), keyword]
    }
    draft = ''
  }

  function remove(keyword: string): void {
    added = added.filter((k) => lower(k) !== lower(keyword))
    // Only needs taking off the sheets that had it to begin with.
    if (sheets.some((s) => s.keywords.some((k) => lower(k) === lower(keyword)))) {
      removed = [...removed, lower(keyword)]
    }
  }

  function apply(): void {
    if (normalizeKeyword(draft) !== '') add(draft)
    if (!changed) return oncancel()
    onapply([...added], [...removed])
  }

  function focusInput(node: HTMLInputElement): void {
    node.focus()
  }
</script>

<div class="backdrop" role="presentation">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="kw-title"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && oncancel()}
  >
    <h2 id="kw-title">
      Keywords{sheets.length === 1 ? `: ${sheets[0]!.title}` : ` for ${sheets.length} sheets`}
    </h2>

    <div class="chips" aria-label="Keywords">
      {#each current as item (item.keyword)}
        <span class="chip" class:partial={item.count < sheets.length}>
          {item.keyword}
          {#if sheets.length > 1 && item.count < sheets.length}<small>{item.count}/{sheets.length}</small>{/if}
          <button class="x" aria-label="Remove {item.keyword}" onclick={() => remove(item.keyword)}>×</button>
        </span>
      {:else}
        <span class="none">No keywords yet</span>
      {/each}
    </div>

    <input
      use:focusInput
      type="text"
      placeholder="Add a keyword, then press Return"
      aria-label="New keyword"
      bind:value={draft}
      onkeydown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') oncancel()
        else if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault()
          if (normalizeKeyword(draft) === '' && e.key === 'Enter') apply()
          else add(draft)
        }
      }}
    />

    {#if suggestions.length > 0}
      <p class="label">Used in this library</p>
      <div class="chips suggestions">
        {#each suggestions as item (item.keyword)}
          <button class="chip suggestion" onclick={() => add(item.keyword)}>
            {item.keyword} <small>{item.count}</small>
          </button>
        {/each}
      </div>
    {/if}

    <div class="buttons">
      <button onclick={oncancel}>Cancel</button>
      <button class="primary" disabled={!changed && normalizeKeyword(draft) === ''} onclick={apply}>Done</button>
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
    width: min(480px, 92vw);
    max-height: 80vh;
    overflow: auto;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 26px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px 2px 10px;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: var(--hover);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .chip.partial {
    border-style: dashed;
    opacity: 0.8;
  }
  .chip small {
    color: var(--muted);
    font-size: 11px;
  }
  .chip.suggestion {
    padding: 2px 10px;
    border-color: var(--border);
    cursor: pointer;
  }
  .x {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0 6px;
    font-size: 14px;
    line-height: 1;
  }
  .x:hover {
    color: var(--text);
  }
  .none {
    color: var(--muted);
    font-size: 13px;
  }
  input {
    font: inherit;
    font-size: 13px;
    padding: 7px 10px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--list);
    color: var(--text);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .buttons button {
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--text);
  }
  .buttons button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .buttons button:disabled {
    opacity: 0.5;
  }
</style>
