<script lang="ts">
  import { onMount } from 'svelte'
  import type { GroupNode, SheetNode } from '@writingapp/core'
  import type { LibraryInfo } from '../../preload/api'
  import GroupTree from './GroupTree.svelte'

  let library = $state<LibraryInfo | null>(null)
  let loading = $state(true)
  let selectedGroup = $state('')
  let selectedSheet = $state<string | null>(null)
  let expanded = $state<Record<string, boolean>>({})
  let text = $state('')
  let error = $state('')
  let readId = 0

  const group = $derived(library ? findGroup(library.tree, selectedGroup) : undefined)
  const sheets = $derived((group?.children.filter((c) => c.kind === 'sheet') ?? []) as SheetNode[])

  function findGroup(node: GroupNode, path: string): GroupNode | undefined {
    if (node.path === path) return node
    for (const child of node.children) {
      if (child.kind !== 'group') continue
      const found = findGroup(child, path)
      if (found) return found
    }
    return undefined
  }

  function showLibrary(info: LibraryInfo): void {
    library = info
    expanded = { [info.tree.path]: true }
    selectedGroup = info.tree.path
    selectedSheet = null
    text = ''
    error = ''
    readId++
  }

  async function chooseLibrary(): Promise<void> {
    const info = await window.api.chooseLibrary()
    if (info) showLibrary(info)
  }

  async function selectSheet(path: string): Promise<void> {
    selectedSheet = path
    const id = ++readId
    try {
      const content = await window.api.readSheet(path)
      if (id !== readId) return
      text = content
      error = ''
    } catch {
      if (id !== readId) return
      text = ''
      error = 'This sheet could not be read.'
    }
  }

  function selectGroup(path: string): void {
    selectedGroup = path
    selectedSheet = null
    text = ''
    error = ''
    readId++
  }

  function toggle(path: string): void {
    expanded[path] = !expanded[path]
  }

  onMount(() => {
    window.api
      .getLibrary()
      .then((info) => {
        if (info) showLibrary(info)
      })
      .finally(() => (loading = false))
    return window.api.onLibraryOpened(showLibrary)
  })
</script>

{#if loading}
  <main class="empty"></main>
{:else if !library}
  <main class="empty">
    <h1>WritingApp</h1>
    <p>
      Choose a folder to use as your library. Its folders become projects and groups, and its
      Markdown files become sheets.
    </p>
    <button class="primary" onclick={chooseLibrary}>Choose library folder…</button>
  </main>
{:else}
  <div class="layout">
    <nav class="pane library" aria-label="Library">
      <header>
        <span class="title" title={library.path}>{library.tree.name}</span>
        <button class="link" onclick={chooseLibrary}>Open…</button>
      </header>
      <ul role="tree">
        <GroupTree
          group={library.tree}
          selected={selectedGroup}
          {expanded}
          onselect={selectGroup}
          ontoggle={toggle}
        />
      </ul>
    </nav>

    <section class="pane sheets" aria-label="Sheets">
      <header><span class="title">{group?.name ?? ''}</span></header>
      {#if sheets.length === 0}
        <p class="hint">No sheets in this group.</p>
      {:else}
        <ul>
          {#each sheets as sheet (sheet.path)}
            <li>
              <button
                class="sheet"
                class:selected={selectedSheet === sheet.path}
                onclick={() => selectSheet(sheet.path)}
              >
                <span class="sheet-title">{sheet.title}</span>
                <span class="sheet-preview">{sheet.preview}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="editor" aria-label="Editor">
      {#if error}
        <p class="hint">{error}</p>
      {:else if selectedSheet}
        <textarea readonly spellcheck="false" value={text}></textarea>
      {:else}
        <p class="hint">Select a sheet to read it.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
  }
  .empty h1 {
    margin: 0;
    font-size: 1.25rem;
  }
  .empty p {
    margin: 0;
    max-width: 380px;
    color: var(--muted);
    line-height: 1.5;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    cursor: default;
  }
  .layout {
    height: 100%;
    display: grid;
    grid-template-columns: 240px 300px 1fr;
  }
  .pane {
    background: var(--pane);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 14px 8px;
    position: sticky;
    top: 0;
    background: var(--pane);
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    cursor: default;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .library ul {
    padding-bottom: 12px;
  }
  .sheets ul {
    padding: 0 6px 12px;
  }
  .sheet {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    cursor: default;
  }
  .sheet:hover {
    background: var(--hover);
  }
  .sheet.selected {
    background: var(--selected);
  }
  .sheet-title,
  .sheet-preview {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sheet-title {
    font-weight: 600;
  }
  .sheet-preview {
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
  }
  .hint {
    color: var(--muted);
    padding: 12px 14px;
    margin: 0;
  }
  .editor {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 16px;
    line-height: 1.6;
    padding: 32px 48px;
  }
</style>
