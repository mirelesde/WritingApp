<script lang="ts">
  import { tick } from 'svelte'
  import type { Align, Table } from '@writingapp/core'

  interface Props {
    table: Table
    /** True when inserting a new table rather than changing one in the text. */
    isNew: boolean
    onapply: (table: Table) => void
    oncancel: () => void
  }

  let { table, isNew, onapply, oncancel }: Props = $props()

  // A working copy: nothing reaches the sheet until Apply.
  // svelte-ignore state_referenced_locally
  let title = $state(table.title)
  // svelte-ignore state_referenced_locally
  let header = $state([...table.header])
  // svelte-ignore state_referenced_locally
  let align = $state<Align[]>([...table.align])
  // svelte-ignore state_referenced_locally
  let rows = $state(table.rows.map((r) => [...r]))
  let grid: HTMLDivElement

  const ALIGNS: Align[] = [null, 'left', 'center', 'right']
  const LABEL: Record<string, string> = { none: 'Default', left: 'Left', center: 'Centre', right: 'Right' }

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }

  /** Focuses the cell input at a row (-1 is the header) and column. */
  async function focusCell(row: number, column: number): Promise<void> {
    await tick()
    grid.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${column}"]`)?.focus()
  }

  function addRow(at = rows.length): void {
    rows.splice(at, 0, header.map(() => ''))
  }

  function addColumn(at = header.length): void {
    header.splice(at, 0, `Column ${header.length + 1}`)
    align.splice(at, 0, null)
    for (const row of rows) row.splice(at, 0, '')
  }

  function removeRow(index: number): void {
    rows.splice(index, 1)
  }

  function removeColumn(index: number): void {
    if (header.length === 1) return
    header.splice(index, 1)
    align.splice(index, 1)
    for (const row of rows) row.splice(index, 1)
  }

  function cycleAlign(index: number): void {
    const next = ALIGNS[(ALIGNS.indexOf(align[index] ?? null) + 1) % ALIGNS.length] ?? null
    align[index] = next
  }

  function apply(): void {
    onapply({
      title: title.trim(),
      header: [...header],
      align: [...align],
      rows: rows.map((r) => [...r])
    })
  }

  function cellKey(e: KeyboardEvent, row: number, column: number): void {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      // Enter goes down a row, adding one at the bottom.
      e.preventDefault()
      if (row === rows.length - 1) addRow()
      focusCell(row + 1, column)
    } else if (e.key === 'Tab' && !e.shiftKey && row === rows.length - 1 && column === header.length - 1) {
      // Tab out of the last cell starts a new row.
      e.preventDefault()
      addRow()
      focusCell(row + 1, 0)
    }
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      apply()
    }
  }
</script>

<div class="backdrop" role="presentation" onmousedown={oncancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label={isNew ? 'Insert table' : 'Edit table'}
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <h2>{isNew ? 'Insert Table' : 'Edit Table'}</h2>
    <label class="title">
      <span>Title</span>
      <input bind:value={title} placeholder="Optional caption" use:focusFirst />
    </label>

    <div class="scroller">
      <div class="grid" bind:this={grid} style:grid-template-columns="repeat({header.length}, minmax(110px, 1fr)) 28px">
        {#each header as _, c (c)}
          <div class="head">
            <input
              class="cell strong"
              data-row="-1"
              data-col={c}
              bind:value={header[c]}
              aria-label="Column {c + 1} heading"
              onkeydown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault()
                  if (rows.length === 0) addRow()
                  focusCell(0, c)
                }
              }}
            />
            <div class="tools">
              <button
                type="button"
                title="Alignment: {LABEL[align[c] ?? 'none']}"
                aria-label="Column {c + 1} alignment: {LABEL[align[c] ?? 'none']}"
                onclick={() => cycleAlign(c)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {#if align[c] === 'right'}
                    <path d="M3 4h10M6 8h7M4 12h9" />
                  {:else if align[c] === 'center'}
                    <path d="M3 4h10M5 8h6M4 12h8" />
                  {:else}
                    <path d="M3 4h10M3 8h7M3 12h9" />
                  {/if}
                </svg>
              </button>
              <button type="button" title="Add column before" aria-label="Add column before column {c + 1}" onclick={() => addColumn(c)}>⇤</button>
              <button type="button" title="Add column after" aria-label="Add column after column {c + 1}" onclick={() => addColumn(c + 1)}>⇥</button>
              <button
                type="button"
                title="Delete column"
                aria-label="Delete column {c + 1}"
                disabled={header.length === 1}
                onclick={() => removeColumn(c)}>×</button
              >
            </div>
          </div>
        {/each}
        <div></div>

        {#each rows as row, r (r)}
          {#each row as _, c (c)}
            <input
              class="cell"
              style:text-align={align[c] ?? 'left'}
              data-row={r}
              data-col={c}
              bind:value={rows[r]![c]}
              aria-label="Row {r + 1}, {header[c]}"
              onkeydown={(e) => cellKey(e, r, c)}
            />
          {/each}
          <div class="row-tools">
            <button type="button" title="Delete row" aria-label="Delete row {r + 1}" onclick={() => removeRow(r)}>×</button>
          </div>
        {/each}
      </div>
    </div>

    <div class="adders">
      <button type="button" onclick={() => { addRow(); focusCell(rows.length - 1, 0) }}>+ Row</button>
      <button type="button" onclick={() => { addColumn(); focusCell(-1, header.length - 1) }}>+ Column</button>
    </div>

    <div class="actions">
      <span class="hint">Tab moves between cells · Enter goes down · ⌘/Ctrl+Enter applies</span>
      <button type="button" onclick={oncancel}>Cancel</button>
      <button type="button" class="primary" onclick={apply}>{isNew ? 'Insert' : 'Apply'}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10vh;
    background: rgb(0 0 0 / 0.25);
    z-index: 20;
  }
  .dialog {
    width: min(760px, calc(100vw - 32px));
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
  }
  h2 {
    margin: 0;
    font-size: 14px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .title span {
    color: var(--muted);
    font-size: 12px;
  }
  .title input {
    flex: 1;
  }
  input {
    font: inherit;
    color: inherit;
    background: var(--pane);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    outline: none;
    min-width: 0;
  }
  input:focus {
    border-color: var(--accent);
  }
  .scroller {
    overflow: auto;
    min-height: 0;
  }
  .grid {
    display: grid;
    gap: 4px;
    align-items: start;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cell.strong {
    font-weight: 600;
  }
  .tools {
    display: flex;
    gap: 2px;
  }
  button {
    font: inherit;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 2px 6px;
    cursor: default;
  }
  .tools button,
  .row-tools button {
    padding: 0;
    width: 24px;
    height: 22px;
    line-height: 1;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  button:disabled {
    opacity: 0.35;
  }
  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .row-tools {
    display: flex;
    align-items: center;
    height: 100%;
  }
  .adders {
    display: flex;
    gap: 8px;
  }
  .adders button {
    border-color: var(--border);
    padding: 4px 10px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hint {
    flex: 1;
    color: var(--muted);
    font-size: 12px;
  }
  .actions button {
    border-color: var(--border);
    padding: 5px 14px;
    color: var(--text);
  }
  .actions .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
