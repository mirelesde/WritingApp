<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { sheetPreview, sheetTitle, type GroupNode, type SheetNode } from '@writingapp/core'
  import type { LibraryInfo, OpResult } from '../../preload/api'
  import { createAutosaver, type SaveStatus } from './autosave'
  import Editor from './Editor.svelte'
  import GroupTree from './GroupTree.svelte'
  import MovePicker from './MovePicker.svelte'
  import {
    errorMessage,
    moveSlot,
    moveTargets,
    pathRange,
    remapPath,
    visibleGroups,
    type MoveTarget
  } from './organise'

  let library = $state<LibraryInfo | null>(null)
  let loading = $state(true)
  let selectedGroup = $state('')
  let expanded = $state<Record<string, boolean>>({})
  // Sheet selection: any number of sheets; `cursor` is the one that arrow
  // keys move from, `anchor` the fixed end of a Shift-extended range.
  let selection = $state<string[]>([])
  let cursor = $state<string | null>(null)
  let anchor = $state<string | null>(null)
  // The sheet being edited. Set only once its text has loaded.
  let open = $state<{ path: string; text: string } | null>(null)
  let error = $state('')
  let readId = 0
  let saveStatus = $state<SaveStatus>('saved')
  let renaming = $state<string | null>(null)
  let notice = $state('')
  let focusEditor = $state(false)
  let treeEl = $state<HTMLElement>()
  let sheetsEl = $state<HTMLElement>()
  let editor = $state<Editor>()
  let picker = $state<{ heading: string; paths: string[]; targets: MoveTarget[] } | null>(null)
  let pickerReturnFocus: HTMLElement | null = null

  const autosaver = createAutosaver({
    save: (path, content) => window.api.writeSheet(path, content),
    onStatus: (status) => (saveStatus = status)
  })

  const group = $derived(library ? findGroup(library.tree, selectedGroup) : undefined)
  const sheets = $derived((group?.children.filter((c) => c.kind === 'sheet') ?? []) as SheetNode[])
  const sheetPaths = $derived(sheets.map((s) => s.path))

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
    clearSheets()
  }

  function clearSheets(): void {
    selection = []
    cursor = null
    anchor = null
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

  /** Selects sheets. The editor shows the sheet when exactly one is selected. */
  async function setSelection(paths: string[], to: string | null, focus = false): Promise<void> {
    await autosaver.flush()
    selection = paths
    cursor = to
    if (paths.length === 1) {
      if (open?.path !== paths[0]) {
        focusEditor = focus
        await loadSheet(paths[0]!)
      }
    } else {
      open = null
      error = ''
      readId++
    }
  }

  function clickSheet(path: string, e: MouseEvent): Promise<void> {
    if (e.shiftKey && anchor) return setSelection(pathRange(sheetPaths, anchor, path), path)
    anchor = path
    if (e.metaKey || e.ctrlKey) {
      const next = selection.includes(path)
        ? selection.filter((p) => p !== path)
        : [...selection, path]
      return setSelection(next, path)
    }
    return setSelection([path], path)
  }

  /** Runs a structural change, then brings the UI in line with the result. */
  async function runOp(op: () => Promise<OpResult>): Promise<OpResult | undefined> {
    await autosaver.flush()
    try {
      const result = await op()
      const wasOpen = open?.path
      const remap = (path: string): string => remapPath(path, result.moved)
      library = result.library
      selectedGroup = remap(selectedGroup)
      if (!findGroup(result.library.tree, selectedGroup)) selectedGroup = result.library.tree.path
      selection = selection.map(remap)
      cursor = cursor && remap(cursor)
      anchor = anchor && remap(anchor)
      expanded = Object.fromEntries(Object.entries(expanded).map(([p, o]) => [remap(p), o]))
      if (wasOpen && remap(wasOpen) !== wasOpen) await loadSheet(remap(wasOpen))
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
    const at = parent.children.findIndex((c) => c.path === cursor)
    const result = await runOp(() =>
      window.api.createSheet(parent.path, at >= 0 ? at + 1 : undefined)
    )
    if (result?.created) {
      anchor = result.created
      await setSelection([result.created], result.created, true)
    }
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
    clearSheets()
    renaming = result.created
  }

  async function startRename(path: string): Promise<void> {
    if (library && path !== library.tree.path) renaming = path
  }

  async function finishRename(): Promise<void> {
    renaming = null
    await tick()
    treeEl?.focus()
  }

  async function commitRename(path: string, name: string): Promise<void> {
    if (renaming !== path) return
    const trimmed = name.trim()
    await finishRename()
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
    clearSheets()
  }

  function toggle(path: string): void {
    expanded[path] = !expanded[path]
  }

  // --- Move to… ------------------------------------------------------------

  /** Opens the group picker for the selected group (tree focused) or sheets. */
  function openMoveTo(): void {
    if (!library) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    const root = library.tree
    let paths: string[]
    let from: string
    let moving: string[]
    let heading: string
    if (inTree) {
      if (selectedGroup === root.path) return
      paths = moving = [selectedGroup]
      from = selectedGroup.slice(0, selectedGroup.lastIndexOf('/'))
      heading = `Move “${group?.name ?? 'group'}” to…`
    } else {
      paths = [...selection]
      if (paths.length === 0) return
      moving = []
      from = selectedGroup
      heading = paths.length === 1 ? 'Move 1 sheet to…' : `Move ${paths.length} sheets to…`
    }
    const targets = moveTargets(root, moving, from)
    if (targets.length === 0) {
      notice = 'There is nowhere else to move this.'
      return
    }
    pickerReturnFocus = document.activeElement as HTMLElement | null
    picker = { heading, paths, targets }
  }

  function closePicker(): void {
    picker = null
    pickerReturnFocus?.focus()
  }

  async function pickTarget(target: string): Promise<void> {
    if (!picker) return
    const paths = [...picker.paths] // a plain array: state proxies cannot cross the bridge
    closePicker()
    const movedSheets = !treeEl?.contains(pickerReturnFocus)
    const result = await runOp(() => window.api.move(paths, target))
    if (!result) return
    expanded[target] = true
    if (movedSheets) clearSheets()
  }

  // --- Keyboard -----------------------------------------------------------

  function treeKeydown(e: KeyboardEvent): void {
    if (!library || renaming) return
    const mod = e.metaKey || e.ctrlKey
    const flat = visibleGroups(library.tree, expanded)
    const i = flat.findIndex((v) => v.group.path === selectedGroup)
    const current = flat[i]
    if (!current) return
    const go = (v: { group: GroupNode } | undefined): void => {
      if (v) void selectGroup(v.group.path)
    }

    if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const parent = current.parent
      if (!parent) return
      const delta = e.key === 'ArrowUp' ? -1 : 1
      const slot = moveSlot(
        parent.children.map((c) => c.path),
        parent.children.filter((c) => c.kind === 'group').map((c) => c.path),
        [current.group.path],
        delta
      )
      if (slot !== undefined)
        void runOp(() => window.api.move([current.group.path], parent.path, slot))
      return
    }
    if (mod || e.altKey) return

    const subgroups = current.group.children.some((c) => c.kind === 'group')
    switch (e.key) {
      case 'ArrowDown':
        go(flat[i + 1])
        break
      case 'ArrowUp':
        go(flat[i - 1])
        break
      case 'ArrowRight':
        if (subgroups && !expanded[current.group.path]) expanded[current.group.path] = true
        else go(flat[i + 1]?.parent === current.group ? flat[i + 1] : undefined)
        break
      case 'ArrowLeft':
        if (subgroups && expanded[current.group.path]) expanded[current.group.path] = false
        else go(current.parent ? { group: current.parent } : undefined)
        break
      case 'Enter':
      case 'F2':
        void startRename(current.group.path)
        break
      default:
        return
    }
    e.preventDefault()
  }

  function sheetsKeydown(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const parent = group
      if (!parent || selection.length === 0) return
      const chosen = [...selection] // a plain array: state proxies cannot cross the bridge
      const slot = moveSlot(
        parent.children.map((c) => c.path),
        sheetPaths,
        chosen,
        e.key === 'ArrowUp' ? -1 : 1
      )
      if (slot !== undefined) void runOp(() => window.api.move(chosen, parent.path, slot))
      return
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      void setSelection([...sheetPaths], cursor ?? sheetPaths[0] ?? null)
      return
    }
    if (mod || e.altKey) return

    const at = cursor ? sheetPaths.indexOf(cursor) : -1
    let target: number
    switch (e.key) {
      case 'ArrowDown':
        target = Math.min(at + 1, sheetPaths.length - 1)
        break
      case 'ArrowUp':
        target = at < 0 ? 0 : Math.max(at - 1, 0)
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = sheetPaths.length - 1
        break
      case 'Enter':
        e.preventDefault()
        if (open) editor?.focus()
        return
      default:
        return
    }
    e.preventDefault()
    const path = sheetPaths[target]
    if (path === undefined) return
    if (e.shiftKey && anchor) {
      void setSelection(pathRange(sheetPaths, anchor, path), path)
    } else {
      anchor = path
      void setSelection([path], path)
    }
  }

  function windowKeydown(e: KeyboardEvent): void {
    // Cmd/Ctrl+1, 2, 3 jump between the panes.
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !library) return
    if (e.key === '1') treeEl?.focus()
    else if (e.key === '2') sheetsEl?.focus()
    else if (e.key === '3' && open) editor?.focus()
    else return
    e.preventDefault()
  }

  /** Clicking a row selects it but keeps focus on the pane, so keys keep working. */
  function keepFocus(pane: HTMLElement | undefined) {
    return (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('input')) {
        e.preventDefault()
        pane?.focus()
      }
    }
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
      else if (command === 'move-to') openMoveTo()
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

<svelte:window onkeydown={windowKeydown} />

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
    <div
      class="pane library"
      role="tree"
      aria-label="Library"
      tabindex="0"
      bind:this={treeEl}
      onkeydown={treeKeydown}
      onmousedown={keepFocus(treeEl)}
    >
      <header>
        <span class="title" title={library.path}>{library.tree.name}</span>
        <button class="link" tabindex="-1" onclick={chooseLibrary}>Open…</button>
      </header>
      <ul role="none">
        <GroupTree
          group={library.tree}
          selected={selectedGroup}
          {expanded}
          {renaming}
          onselect={selectGroup}
          ontoggle={toggle}
          onstartrename={startRename}
          oncommitrename={commitRename}
          oncancelrename={finishRename}
        />
      </ul>
      {#if notice}
        <p class="notice" role="alert">{notice}</p>
      {/if}
    </div>

    <div
      class="pane sheets"
      role="listbox"
      aria-multiselectable="true"
      aria-label="Sheets"
      tabindex="0"
      bind:this={sheetsEl}
      onkeydown={sheetsKeydown}
      onmousedown={keepFocus(sheetsEl)}
    >
      <header><span class="title">{group?.name ?? ''}</span></header>
      {#if sheets.length === 0}
        <p class="hint">No sheets in this group.</p>
      {:else}
        <ul>
          {#each sheets as sheet (sheet.path)}
            <li>
              <button
                class="sheet"
                class:selected={selection.includes(sheet.path)}
                tabindex="-1"
                onclick={(e) => clickSheet(sheet.path, e)}
              >
                <span class="sheet-title">{sheet.title}</span>
                <span class="sheet-preview">{sheet.preview}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <section class="editor" aria-label="Editor">
      {#if error}
        <p class="hint">{error}</p>
      {:else if open}
        {#key open.path}
          {@const path = open.path}
          <Editor
            bind:this={editor}
            text={open.text}
            onchange={(content) => edited(path, content)}
            onblur={() => void autosaver.flush()}
            onescape={() => sheetsEl?.focus()}
            autofocus={focusEditor}
          />
        {/key}
        <span class="status" class:problem={saveStatus === 'error'} aria-live="polite">
          {saveStatus === 'error' ? 'Could not save — retrying' : ''}
        </span>
      {:else if selection.length > 1}
        <p class="hint">{selection.length} sheets selected.</p>
      {:else}
        <p class="hint">Select a sheet to read it.</p>
      {/if}
    </section>
  </div>
{/if}

{#if picker}
  <MovePicker
    heading={picker.heading}
    targets={picker.targets}
    onpick={pickTarget}
    oncancel={closePicker}
  />
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
  .pane:focus {
    outline: none;
  }
  .pane:focus .sheet.selected {
    background: var(--accent);
    color: #fff;
  }
  .pane:focus .sheet.selected .sheet-preview {
    color: inherit;
    opacity: 0.8;
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
