<script module lang="ts">
  // Kept between openings, so a writer who likes whole-word search keeps it.
  const remembered = { caseSensitive: false, wholeWord: false, regex: false }

  export type FindScope = 'sheet' | 'group' | 'project' | 'library'

  export interface ScopeChoice {
    value: FindScope
    label: string
    /** The group the search is limited to; for a sheet, the sheet. */
    name: string
  }

  /** What the bar needs from the app around it. */
  export interface FindHost {
    /** The sheet being edited, with the text as it is now and where the cursor is. */
    sheet(): { path: string; text: string; cursor: number } | null
    /** Opens a sheet if it is not open, and selects a stretch of its text. */
    reveal(path: string, from: number, to: number): Promise<void>
    /** Marks the matches in an open sheet; a blank query clears them. */
    mark(path: string, query: string, options: SearchOptions): void
    /** Clears the marks everywhere. */
    unmark(): void
    /** Changes text in the editor of an open sheet. */
    replaceHere(path: string, changes: { from: number; to: number; insert: string }[]): void
    /** Replaces in every sheet of a group (or the library); returns how many matches changed. */
    replaceAll(query: string, replacement: string, within: string | undefined, options: SearchOptions): Promise<number>
    /** Writes unsaved edits, so a search of the disk sees them. */
    flush(): Promise<void>
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { findMatches, type SearchOptions, type TextMatch } from '@writingapp/core'
  import { errorMessage } from './organise'
  import Select from './Select.svelte'

  interface Props {
    scopes: (ScopeChoice & { path: string | undefined })[]
    scope: FindScope
    initialQuery?: string
    showReplace?: boolean
    host: FindHost
    onclose: () => void
    onscope: (scope: FindScope) => void
  }

  const mac = navigator.platform.startsWith('Mac')
  const replaceAllHint = mac ? '⌘⌥↩' : 'Ctrl+Alt+Enter'

  let { scopes, scope, initialQuery = '', showReplace = false, host, onclose, onscope }: Props = $props()

  // svelte-ignore state_referenced_locally
  let query = $state(initialQuery)
  let replacement = $state('')
  // svelte-ignore state_referenced_locally
  let replacing = $state(showReplace)
  let caseSensitive = $state(remembered.caseSensitive)
  let wholeWord = $state(remembered.wholeWord)
  let regex = $state(remembered.regex)

  /** The sheets with matches, in order, and how many matches each has. */
  let sheets = $state<{ path: string; count: number }[]>([])
  /** The current match: which sheet, and which match in it. */
  let at = $state({ s: 0, m: 0 })
  let problem = $state('')
  let done = $state('')
  let input: HTMLInputElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  const total = $derived(sheets.reduce((sum, s) => sum + s.count, 0))
  const ordinal = $derived(sheets.slice(0, at.s).reduce((sum, s) => sum + s.count, 0) + at.m + 1)
  const current = $derived(scopes.find((s) => s.value === scope))
  const blank = $derived(query.trim() === '')

  function options(): SearchOptions {
    return { caseSensitive, wholeWord, regex }
  }

  /** The matches in a sheet's text; the open one is read from the editor, others from disk. */
  async function matchesIn(path: string): Promise<{ text: string; found: TextMatch[] }> {
    const open = host.sheet()
    const text = open?.path === path ? open.text : await window.api.readSheet(path)
    return { text, found: findMatches(text, query, options()) }
  }

  /** Looks for the query again. `go` also moves to the first match at or after the cursor. */
  async function refresh(go: boolean, keep?: { s: number; m: number }): Promise<void> {
    const id = ++latest
    done = go ? '' : done
    try {
      let list: { path: string; count: number }[] = []
      const open = host.sheet()
      if (!blank) {
        if (scope === 'sheet') {
          if (open) {
            const n = findMatches(open.text, query, options()).length
            if (n > 0) list = [{ path: open.path, count: n }]
          }
        } else {
          await host.flush()
          const within = current?.path
          const hits = await window.api.search(query, { ...options(), ...(within ? { within } : {}) })
          list = hits.map((h) => ({ path: h.path, count: h.count }))
        }
      }
      if (id !== latest) return
      problem = ''
      sheets = list
      let next = { s: 0, m: 0 }
      if (keep) {
        next = keep
        if (next.s >= list.length) next = { s: 0, m: 0 }
        else if (next.m >= list[next.s]!.count) next = next.s + 1 < list.length ? { s: next.s + 1, m: 0 } : { s: 0, m: 0 }
      } else if (open) {
        const s = list.findIndex((x) => x.path === open.path)
        if (s >= 0) {
          const found = findMatches(open.text, query, options())
          const m = found.findIndex((x) => x.from >= open.cursor)
          next = { s, m: m >= 0 ? m : 0 }
        }
      }
      at = next
      if (go) await show()
      else markOpen()
    } catch (e) {
      if (id !== latest) return
      sheets = []
      problem = errorMessage(e)
      host.unmark()
    }
  }

  function markOpen(): void {
    const open = host.sheet()
    if (open && !blank && sheets.some((s) => s.path === open.path)) host.mark(open.path, query, options())
    else host.unmark()
  }

  /** Brings the current match into view in the editor. */
  async function show(): Promise<void> {
    const sheet = sheets[at.s]
    if (!sheet) {
      host.unmark()
      return
    }
    const { found } = await matchesIn(sheet.path)
    const match = found[Math.min(at.m, found.length - 1)]
    if (!match) return
    await host.reveal(sheet.path, match.from, match.to)
    host.mark(sheet.path, query, options())
  }

  async function step(direction: 1 | -1): Promise<void> {
    if (sheets.length === 0) return
    if (scope === 'sheet') {
      // The text may have changed since the last look.
      const open = host.sheet()
      const n = open ? findMatches(open.text, query, options()).length : 0
      if (n === 0) return void (await refresh(false))
      sheets = [{ path: open!.path, count: n }]
      at = { s: 0, m: (Math.min(at.m, n - 1) + direction + n) % n }
    } else {
      const here = sheets[at.s]!
      let m = at.m + direction
      let s = at.s
      if (m >= here.count) {
        s = (s + 1) % sheets.length
        m = 0
      } else if (m < 0) {
        s = (s - 1 + sheets.length) % sheets.length
        m = sheets[s]!.count - 1
      }
      at = { s, m }
    }
    await show()
  }

  async function replaceOne(): Promise<void> {
    const sheet = sheets[at.s]
    if (!sheet || blank) return
    const open = host.sheet()
    if (open?.path !== sheet.path) await show()
    const now = host.sheet()
    if (!now) return
    const match = findMatches(now.text, query, options())[at.m]
    if (!match) return
    host.replaceHere(now.path, [{ from: match.from, to: match.to, insert: match.insert(replacement) }])
    done = ''
    await refresh(true, { ...at })
  }

  async function replaceEverywhere(): Promise<void> {
    if (blank || total === 0) return
    try {
      let n = 0
      if (scope === 'sheet') {
        const open = host.sheet()
        const found = open ? findMatches(open.text, query, options()) : []
        host.replaceHere(
          open?.path ?? '',
          found.map((m) => ({ from: m.from, to: m.to, insert: m.insert(replacement) }))
        )
        n = found.length
      } else {
        n = await host.replaceAll(query, replacement, current?.path, options())
      }
      done = n > 0 ? `Replaced ${n} ${n === 1 ? 'match' : 'matches'}` : ''
      await refresh(false)
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  function typed(): void {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(true), 180)
  }

  function toggle(which: 'caseSensitive' | 'wholeWord' | 'regex'): void {
    if (which === 'caseSensitive') caseSensitive = !caseSensitive
    else if (which === 'wholeWord') wholeWord = !wholeWord
    else regex = !regex
    remembered.caseSensitive = caseSensitive
    remembered.wholeWord = wholeWord
    remembered.regex = regex
    void refresh(true)
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault()
      clearTimeout(timer)
      void step(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      void (e.metaKey || e.ctrlKey ? replaceEverywhere() : replaceOne())
    }
  }

  /** Called by the app when Find Next or Previous is pressed in the editor. */
  export function next(direction: 1 | -1): void {
    void step(direction)
  }

  /** Called by the app when Find is pressed again: focus the box and take the selection as the query. */
  export function focusQuery(text?: string, replaceToo?: boolean): void {
    if (replaceToo) replacing = true
    if (text) {
      query = text
      void refresh(true)
    }
    input?.focus()
    input?.select()
  }

  // A new scope (chosen here or by the app) means a new search.
  let seen: FindScope | undefined
  $effect(() => {
    const now = scope
    if (seen !== undefined && seen !== now) void refresh(true)
    seen = now
  })

  onMount(() => {
    input?.focus()
    input?.select()
    if (!blank) void refresh(true)
  })
  onDestroy(() => clearTimeout(timer))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="findbar" role="search" aria-label="Find" onkeydown={keydown}>
  <div class="row">
    <button
      class="chev"
      class:on={replacing}
      aria-pressed={replacing}
      aria-label="Replace"
      title="Show replace"
      onclick={() => (replacing = !replacing)}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div class="scope">
      <Select
        label="Look in"
        value={scope}
        options={scopes.map((s) => ({ value: s.value, label: s.label }))}
        onchange={(v) => onscope(v as FindScope)}
      />
    </div>
    <div class="field">
      <input
        class="input"
        bind:this={input}
        bind:value={query}
        oninput={typed}
        placeholder={current && scope !== 'library' ? `Find in ${current.name}` : 'Find in library'}
        aria-label="Find"
        spellcheck="false"
      />
      <span class="count" role="status" class:bad={problem !== ''} title={problem}>
        {#if problem}
          Invalid
        {:else if blank}
          &nbsp;
        {:else if total === 0}
          No results
        {:else}
          {ordinal} of {total}
        {/if}
      </span>
      <button class="step" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled={total === 0} onclick={() => void step(-1)}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button class="step" aria-label="Next match" title="Next match (Enter)" disabled={total === 0} onclick={() => void step(1)}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
    <button class="opt" class:on={caseSensitive} aria-pressed={caseSensitive} title="Match case" onclick={() => toggle('caseSensitive')}>Aa</button>
    <button class="opt" class:on={wholeWord} aria-pressed={wholeWord} title="Whole words only" onclick={() => toggle('wholeWord')}><u>ab</u></button>
    <button class="opt" class:on={regex} aria-pressed={regex} title="Regular expression" onclick={() => toggle('regex')}>.*</button>
    <button class="close" aria-label="Close find" title="Close (Esc)" onclick={onclose}>×</button>
  </div>
  {#if replacing}
    <div class="row">
      <span class="chev-space"></span>
      <div class="field">
        <input class="input" bind:value={replacement} placeholder="Replace with" aria-label="Replace with" spellcheck="false" />
      </div>
      <button class="act" disabled={total === 0} onclick={() => void replaceOne()}>Replace <kbd>↩</kbd></button>
      <button class="act" disabled={total === 0} onclick={() => void replaceEverywhere()}>Replace All <kbd>{replaceAllHint}</kbd></button>
      {#if done}<span class="done" role="status">{done}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .findbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .scope {
    flex: none;
    width: 140px;
  }
  .field {
    position: relative;
    flex: 1;
    min-width: 120px;
    max-width: 420px;
    display: flex;
    align-items: center;
  }
  .field input {
    flex: 1;
    min-width: 0;
  }
  .row:first-child .field input {
    padding-right: 118px;
  }
  .count {
    position: absolute;
    right: 52px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .count.bad {
    color: var(--danger, #d44);
  }
  button {
    font: inherit;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: default;
  }
  .step {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
  }
  .step:nth-of-type(1) {
    right: 28px;
  }
  .step:nth-of-type(2) {
    right: 4px;
  }
  .step:hover:not(:disabled),
  .close:hover,
  .chev:hover {
    background: color-mix(in srgb, var(--text) 9%, transparent);
    color: var(--text);
  }
  button:disabled {
    opacity: 0.35;
  }
  .opt {
    padding: 4px 8px;
    font-size: 12px;
    background: color-mix(in srgb, var(--text) 7%, transparent);
  }
  .opt.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .chev {
    display: grid;
    place-items: center;
    width: 22px;
    height: 26px;
    padding: 0;
  }
  .chev svg {
    transition: transform 0.12s;
  }
  .chev.on svg {
    transform: rotate(90deg);
  }
  .chev-space {
    flex: none;
    width: 22px;
  }
  .close {
    margin-left: auto;
    font-size: 18px;
    line-height: 1;
    width: 26px;
    height: 26px;
    padding: 0;
  }
  .act {
    padding: 5px 12px;
    font-size: 13px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
  }
  .act:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 13%, transparent);
  }
  kbd {
    font: inherit;
    font-size: 11px;
    margin-left: 4px;
    color: var(--muted);
  }
  .done {
    font-size: 12px;
    color: var(--muted);
  }
</style>
