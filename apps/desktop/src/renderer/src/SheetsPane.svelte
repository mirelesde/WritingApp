<script lang="ts">
  import { type SheetNode, type SheetSort } from '@writingapp/core'
  import { SORTS, toggleKeywordInFilter, type Section } from './listing'
  import type { SelectionState } from './selectionState.svelte'
  import ToolButton from './ToolButton.svelte'

  interface Props {
    /** The selected group's name. */
    title: string
    sortBy: SheetSort
    /** Every sheet the list can show, before filtering. */
    listed: SheetNode[]
    shown: SheetNode[]
    shownSections: Section[]
    knownKeywords: { keyword: string; count: number }[]
    parsedFilter: { keywords: string[]; text: string }
    keywordMode: boolean
    filter: string
    el: HTMLElement | undefined
    sel: SelectionState
    gluedFrom: Set<string>
    sheetHint: { path: string; after: boolean } | 'end' | null
    keyMod: string
    whereIs: (path: string) => string
    onkeydown: (e: KeyboardEvent) => void
    onmousedown: (e: MouseEvent) => void
    onpaneover: (e: DragEvent) => void
    onpanedrop: (e: DragEvent) => void
    onsheetdragstart: (path: string, e: DragEvent) => void
    onsheetdragend: () => void
    onsheetdragover: (path: string, e: DragEvent) => void
    onsheetclick: (path: string, e: MouseEvent) => void
    onsheetmenu: (path: string, at: { x: number; y: number }) => void
    onnew: () => void
    onsort: (value: SheetSort) => void
  }

  let {
    title,
    sortBy,
    listed,
    shown,
    shownSections,
    knownKeywords,
    parsedFilter,
    keywordMode,
    filter = $bindable(),
    el = $bindable(),
    sel,
    gluedFrom,
    sheetHint,
    keyMod,
    whereIs,
    onkeydown,
    onmousedown,
    onpaneover,
    onpanedrop,
    onsheetdragstart,
    onsheetdragend,
    onsheetdragover,
    onsheetclick,
    onsheetmenu,
    onnew,
    onsort
  }: Props = $props()

  let sortOpen = $state(false)
  let keywordPicker = $state(false)

  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  /** The small line under a card's title when the sort makes a value worth showing. */
  function sortNote(sheet: SheetNode): string {
    if (sortBy === 'words') return `${sheet.words.toLocaleString()} words`
    const time = sortBy === 'created' ? sheet.created : sortBy === 'modified' ? sheet.modified : undefined
    return time === undefined ? '' : dateFormat.format(time)
  }

  /** Adds or removes `#keyword` in the filter box. */
  function toggleFilterKeyword(keyword: string): void {
    filter = toggleKeywordInFilter(filter, keyword)
    keywordPicker = false
  }
</script>

<div
  class="pane sheets"
  role="listbox"
  aria-multiselectable="true"
  aria-label="Sheets"
  tabindex="0"
  bind:this={el}
  {onkeydown}
  {onmousedown}
  ondragover={onpaneover}
  ondrop={onpanedrop}
>
  <header>
    <span class="title">{title}</span>
    <span class="tools">
      <span class="sort-wrap">
        <ToolButton icon="sort" label="Sort sheets" pressed={sortOpen || sortBy !== 'manual'} onclick={() => (sortOpen = !sortOpen)} />
        {#if sortOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="scrim" onmousedown={() => (sortOpen = false)}></div>
          <div class="style-menu sort-menu" role="menu" tabindex="-1" aria-label="Sort sheets">
            {#each SORTS as [value, label] (value)}
              <button
                role="menuitemradio"
                aria-checked={sortBy === value}
                class:current={sortBy === value}
                onclick={() => {
                  sortOpen = false
                  onsort(value)
                }}>{label}</button
              >
            {/each}
          </div>
        {/if}
      </span>
      <ToolButton icon="new-sheet" label="New sheet" hint="{keyMod}N" onclick={onnew} />
    </span>
  </header>
  {#if listed.length > 0}
    <div class="filter">
      <input
        type="search"
        placeholder={knownKeywords.length > 0 ? 'Filter, or #keyword' : 'Filter'}
        aria-label="Filter sheets"
        bind:value={filter}
        onkeydown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            filter = ''
            el?.focus()
          }
        }}
      />
      {#if knownKeywords.length > 0}
        <button
          class="kw-button"
          class:active={keywordMode}
          aria-label="Filter by keyword"
          aria-haspopup="menu"
          aria-expanded={keywordPicker}
          title="Filter by keyword"
          onclick={() => (keywordPicker = !keywordPicker)}>#</button
        >
      {/if}
      {#if keywordPicker}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="scrim" onmousedown={() => (keywordPicker = false)}></div>
        <div class="style-menu kw-menu" role="menu" tabindex="-1" aria-label="Keywords">
          {#each knownKeywords as item (item.keyword)}
            <button
              role="menuitemcheckbox"
              aria-checked={parsedFilter.keywords.some((k) => k.toLowerCase() === item.keyword.toLowerCase())}
              class:current={parsedFilter.keywords.some((k) => k.toLowerCase() === item.keyword.toLowerCase())}
              onclick={() => toggleFilterKeyword(item.keyword)}>{item.keyword} <small>{item.count}</small></button
            >
          {/each}
        </div>
      {/if}
    </div>
  {:else if keywordMode}
    <p class="placeholder small">No Sheets</p>
  {/if}
  {#if listed.length === 0}
    <p class="placeholder small">No Sheets</p>
  {:else if shown.length === 0}
    <p class="placeholder small">No Matches</p>
  {:else}
    <ul>
      {#each shownSections as section (section.node.path)}
        {#if section.label}
          <li class="sheet-section" role="presentation">{section.label}</li>
        {/if}
      {#each section.sheets as sheet (sheet.path)}
        <li>
          <button
            class="sheet"
            class:selected={sel.has(sheet.path)}
            class:run-start={sheet.glued && !gluedFrom.has(sheet.path)}
            class:run-middle={sheet.glued && gluedFrom.has(sheet.path)}
            class:run-end={!sheet.glued && gluedFrom.has(sheet.path)}
            class:drop-before={sheetHint !== 'end' &&
              sheetHint?.path === sheet.path &&
              !sheetHint.after}
            class:drop-after={sheetHint !== 'end' &&
              sheetHint?.path === sheet.path &&
              sheetHint.after}
            tabindex="-1"
            draggable={!keywordMode}
            ondragstart={(e) => !keywordMode && onsheetdragstart(sheet.path, e)}
            ondragend={onsheetdragend}
            ondragover={(e) => onsheetdragover(sheet.path, e)}
            onclick={(e) => onsheetclick(sheet.path, e)}
            oncontextmenu={(e) => {
              e.preventDefault()
              onsheetmenu(sheet.path, { x: e.clientX, y: e.clientY })
            }}
          >
            <span class="sheet-head">
              <span class="sheet-title">{sheet.title}</span>
              {#if sortNote(sheet)}<span class="sheet-note">{sortNote(sheet)}</span>{/if}
            </span>
            <span class="sheet-preview" class:blank={sheet.preview === ''}>{sheet.preview || '(No Content)'}</span>
            {#if keywordMode}<span class="sheet-where">{whereIs(sheet.path) || 'Library'}</span>{/if}
            {#if sheet.keywords.length > 0}
              <span class="sheet-keywords">
                {#each sheet.keywords as keyword (keyword)}<span class="kw">{keyword}</span>{/each}
              </span>
            {/if}
          </button>
        </li>
      {/each}
      {/each}
    </ul>
  {/if}
</div>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px 0 21px;
    min-height: var(--topbar-height);
    position: sticky;
    top: 0;
    background: inherit;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tools {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pane:focus {
    outline: none;
  }
  .pane:focus .sheet.selected {
    background: var(--accent);
    color: var(--on-accent);
  }
  .pane:focus .sheet.selected .sheet-preview {
    color: inherit;
    opacity: 0.8;
  }
  .pane {
    overflow-y: auto;
    min-width: 0;
  }
  .sheets {
    background: var(--list);
    position: relative;
  }
  /* Nothing to show: a quiet message in the middle of the pane, under the tool row. */
  .placeholder {
    position: absolute;
    inset: var(--topbar-height) 0 0 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 24px 10vh;
    color: var(--faint);
    font-size: 30px;
    font-weight: 300;
    text-align: center;
    user-select: none;
    pointer-events: none;
  }
  .placeholder.small {
    font-size: 17px;
  }
  /* The group's name lines up with the sheet titles below it. */
  .sheets ul {
    padding: 0 6px 12px;
  }
  .sheet {
    position: relative;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 4px;
    cursor: default;
  }
  .sheet.run-start,
  .sheet.run-middle,
  .sheet.run-end {
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
  }
  /* The members of a glued run touch, so they read as one card. */
  .sheet.run-start {
    border-bottom-right-radius: 0;
    margin-bottom: 0;
  }
  .sheet.run-middle {
    border-radius: 0;
    margin-bottom: 0;
  }
  .sheet.run-end {
    border-top-right-radius: 0;
  }
  /* The drop line is straight and stops where the card's rounded corners begin. */
  .sheet.drop-before::before,
  .sheet.drop-after::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    height: 3px;
    border-radius: 1.5px;
    background: var(--accent);
    pointer-events: none;
  }
  .sheet.drop-before::before {
    top: -4px;
  }
  .sheet.drop-after::after {
    bottom: -4px;
  }
  .sheet:hover {
    background: var(--hover);
  }
  .sheet.selected {
    background: var(--selected);
  }
  .sort-wrap {
    position: relative;
  }
  .sort-menu {
    left: auto;
    right: 0;
    transform: none;
    min-width: 160px;
  }
  .sheet-section {
    margin: 14px 4px 2px;
    padding: 0 6px 5px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .sheet-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .sheet-note {
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
  }
  .sheet-preview {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-title {
    display: block;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-preview.blank {
    display: block;
    text-align: left;
    font-style: italic;
    opacity: 0.7;
  }
  .sheet-title {
    font-weight: 600;
  }
  .sheet-preview {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
    margin-top: 3px;
    /* Always three lines tall, so every card is the same height. */
    height: calc(3 * 1.4 * 13px);
    /* Up to three lines, like a card in Ulysses. */
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .filter {
    position: relative;
    display: flex;
    gap: 6px;
    padding: 0 10px 8px;
  }
  .kw-button {
    font: inherit;
    font-size: 13px;
    padding: 0 9px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--muted);
    cursor: default;
  }
  .kw-menu {
    left: auto;
    right: 10px;
    top: 100%;
    transform: none;
    min-width: 170px;
    max-height: 260px;
    overflow: auto;
  }
  .kw-menu small {
    margin-left: 6px;
    color: var(--muted);
  }
  .sheet-where {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.65;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .kw {
    padding: 2px 9px;
    font-size: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--muted);
  }
  .filter input {
    flex: 1;
    min-width: 0;
    width: 100%;
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: color-mix(in srgb, var(--text) 7%, transparent);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 5px 9px;
    outline: none;
  }
  .filter input:focus {
    border-color: var(--accent);
  }
  .filter input::placeholder {
    color: var(--muted);
  }
</style>
