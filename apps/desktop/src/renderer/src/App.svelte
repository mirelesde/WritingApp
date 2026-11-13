<script lang="ts">
  import { onMount } from 'svelte'
  import { sheetPreview, sheetTitle, type GroupNode, type SheetNode } from '@writingapp/core'
  import type { LibraryInfo, OpResult } from '../../preload/api'
  import { createAutosaver, type SaveStatus } from './autosave'
  import Editor from './Editor.svelte'
  import GroupTree from './GroupTree.svelte'
  import { errorMessage, remapPath } from './organise'

  let library = $state<LibraryInfo | null>(null)
  let loading = $state(true)
  let selectedGroup = $state('')
  let selectedSheet = $state<string | null>(null)
  let expanded = $state<Record<string, boolean>>({})
  // The sheet being edited. Set only once its text has loaded.
  let open = $state<{ path: string; text: string } | null>(null)
  let error = $state('')
  let readId = 0
  let saveStatus = $state<SaveStatus>('saved')
  let renaming = $state<string | null>(null)
  let notice = $state('')
  let focusEditor = $state(false)

  const autosaver = createAutosaver({
    save: (path, content) => window.api.writeSheet(path, content),
    onStatus: (status) => (saveStatus = status)
  })

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
    open = null
    error = ''
    readId++
  }

  async function chooseLibrary(): Promise<void> {
    await autosaver.flush()
    const info = await window.api.chooseLibrary()
    if (info) showLibrary(info)
  }

  async function loadSheet(path: string): Promise<void> {
    const id = ++readId
    try {
      const content = await window.api.readSheet(path)
      if (id !== readId) return
      open = { path, text: content }
      error = ''
    } catch {
      if (id !== readId) return
      open = null
      error = 'This sheet could not be read.'
    }
  }

  async function selectSheet(path: string, focus = false): Promise<void> {
    if (path === selectedSheet) return
    await autosaver.flush()
    selectedSheet = path
    focusEditor = focus
    await loadSheet(path)
  }

  /** Runs a structural change, then brings the UI in line with the result. */
  async function runOp(op: () => Promise<OpResult>): Promise<OpResult | undefined> {
    await autosaver.flush()
    try {
      const result = await op()
      const wasOpen = open?.path
      library = result.library
      selectedGroup = remapPath(selectedGroup, result.moved)
      if (!findGroup(result.library.tree, selectedGroup)) selectedGroup = result.library.tree.path
      if (selectedSheet) selectedSheet = remapPath(selectedSheet, result.moved)
      expanded = Object.fromEntries(
        Object.entries(expanded).map(([path, isOpen]) => [remapPath(path, result.moved), isOpen])
      )
      if (wasOpen && remapPath(wasOpen, result.moved) !== wasOpen) {
        await loadSheet(remapPath(wasOpen, result.moved))
      }
      notice = ''
      return result
    } catch (e) {
      notice = errorMessage(e)
      return undefined
    }
  }

  async function newSheet(): Promise<void> {
    const parent = group
    if (!parent) return
    const at = parent.children.findIndex((c) => c.path === selectedSheet)
    const result = await runOp(() =>
      window.api.createSheet(parent.path, at >= 0 ? at + 1 : undefined)
    )
    if (result?.created) await selectSheet(result.created, true)
  }

  async function newGroup(inRoot: boolean): Promise<void> {
    if (!library) return
    const parent = inRoot ? library.tree.path : selectedGroup
    const result = await runOp(() =>
      window.api.createGroup(parent, inRoot ? 'Untitled Project' : undefined)
    )
    if (!result?.created) return
    expanded[parent] = true
    selectedGroup = result.created
    selectedSheet = null
    open = null
    renaming = result.created
  }

  async function commitRename(path: string, name: string): Promise<void> {
    if (renaming !== path) return
    renaming = null
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === path.slice(path.lastIndexOf('/') + 1)) return
    await runOp(() => window.api.renameGroup(path, trimmed))
  }

  function edited(path: string, content: string): void {
    autosaver.change(path, content)
    // Keep the sheet list's title and preview in step with what is typed.
    const sheet = sheets.find((s) => s.path === path)
    if (sheet) {
      sheet.title = sheetTitle(content)
      sheet.preview = sheetPreview(content)
    }
  }

  async function selectGroup(path: string): Promise<void> {
    await autosaver.flush()
    selectedGroup = path
    selectedSheet = null
    open = null
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
    const unsubscribeOpened = window.api.onLibraryOpened(showLibrary)
    const unsubscribeMenu = window.api.onMenuCommand((command) => {
      if (!library) return
      if (command === 'new-sheet') void newSheet()
      else void newGroup(command === 'new-project')
    })
    // Last chance to save when the window closes.
    const saveOnClose = (): void => void autosaver.flush()
    window.addEventListener('beforeunload', saveOnClose)
    return () => {
      unsubscribeOpened()
      unsubscribeMenu()
      window.removeEventListener('beforeunload', saveOnClose)
    }
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
          {renaming}
          onselect={selectGroup}
          ontoggle={toggle}
          onstartrename={(path) => (renaming = path)}
          oncommitrename={commitRename}
          oncancelrename={() => (renaming = null)}
        />
      </ul>
      {#if notice}
        <p class="notice" role="alert">{notice}</p>
      {/if}
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
      {:else if open}
        {#key open.path}
          {@const path = open.path}
          <Editor
            text={open.text}
            onchange={(content) => edited(path, content)}
            onblur={() => void autosaver.flush()}
            autofocus={focusEditor}
          />
        {/key}
        <span class="status" class:problem={saveStatus === 'error'} aria-live="polite">
          {saveStatus === 'error' ? 'Could not save — retrying' : ''}
        </span>
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
  .notice {
    margin: 0;
    padding: 8px 14px;
    color: #c0392b;
    font-size: 12px;
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
  .editor {
    position: relative;
  }
  .status {
    position: absolute;
    right: 16px;
    bottom: 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .status.problem {
    color: #c0392b;
  }
</style>
