<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { sheetPreview, sheetTitle, type GroupNode, type SheetNode } from '@writingapp/core'
  import type { LibraryInfo, OpResult, PdfOptions } from '../../preload/api'
  import { createAutosaver, type SaveStatus } from './autosave'
  import Editor from './Editor.svelte'
  import GroupTree from './GroupTree.svelte'
  import MovePicker from './MovePicker.svelte'
  import SearchDialog from './SearchDialog.svelte'
  import ExportPreview from './ExportPreview.svelte'
  import {
    errorMessage,
    moveSlot,
    moveTargets,
    pathRange,
    remapPath,
    runOf,
    visibleGroups,
    type DropZone,
    type MoveTarget,
    type TreeDnd
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
  // The sheets being edited: one, or a whole glued run. Set only once their text has loaded.
  let open = $state<{ parts: { path: string; text: string }[] } | null>(null)
  let error = $state('')
  let readId = 0
  let saveStatus = $state<SaveStatus>('saved')
  let renaming = $state<string | null>(null)
  let notice = $state('')
  let info = $state('')
  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let focusEditor = $state(false)
  let treeEl = $state<HTMLElement>()
  let sheetsEl = $state<HTMLElement>()
  let editors = $state<Record<string, Editor | undefined>>({})
  let picker = $state<{ heading: string; paths: string[]; targets: MoveTarget[] } | null>(null)
  let pickerReturnFocus: HTMLElement | null = null

  const autosaver = createAutosaver({
    save: (path, content) => window.api.writeSheet(path, content),
    onStatus: (status) => (saveStatus = status)
  })

  const group = $derived(library ? findGroup(library.tree, selectedGroup) : undefined)
  const sheets = $derived((group?.children.filter((c) => c.kind === 'sheet') ?? []) as SheetNode[])
  const sheetPaths = $derived(sheets.map((s) => s.path))
  // Sheets that follow a glued sheet, so a run can be drawn as one bar.
  const gluedFrom = $derived(
    new Set(
      (group?.children ?? []).flatMap((c, i) =>
        c.kind === 'sheet' && c.glued ? [group?.children[i + 1]?.path ?? ''] : []
      )
    )
  )

  function findGroup(node: GroupNode, path: string): GroupNode | undefined {
    if (node.path === path) return node
    for (const child of node.children) {
      if (child.kind !== 'group') continue
      const found = findGroup(child, path)
      if (found) return found
    }
    return undefined
  }

  function sheetExists(node: GroupNode, path: string): boolean {
    return node.children.some((c) => (c.kind === 'sheet' ? c.path === path : sheetExists(c, path)))
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

  /** The sheets that read as one with `path`: its glued run, or just itself. */
  function runPaths(path: string): string[] {
    return runOf(group?.children ?? [], path)
  }

  /** True if the editor already shows `path` as part of its current run. */
  function runIsOpen(path: string): boolean {
    const shown = open?.parts.map((p) => p.path).join('\n')
    return (
      shown !== undefined && runPaths(path).join('\n') === shown && shown.split('\n').includes(path)
    )
  }

  /** Loads the glued run that `path` belongs to into the editor. */
  async function loadRun(path: string): Promise<void> {
    const id = ++readId
    const paths = runPaths(path)
    try {
      const texts = await Promise.all(paths.map((p) => window.api.readSheet(p)))
      if (id !== readId) return
      open = { parts: paths.map((p, i) => ({ path: p, text: texts[i]! })) }
      error = ''
    } catch {
      if (id !== readId) return
      open = null
      error = 'This sheet could not be read.'
    }
  }

  /** Brings a sheet's part of the open run into view. */
  async function scrollToPart(path: string): Promise<void> {
    await tick()
    document.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'start' })
  }

  /** Selects sheets. The editor shows the sheet, with its whole run, when exactly one is selected. */
  async function setSelection(paths: string[], to: string | null, focus = false): Promise<void> {
    await autosaver.flush()
    selection = paths
    cursor = to
    if (paths.length === 1) {
      const path = paths[0]!
      if (!runIsOpen(path)) {
        focusEditor = focus
        await loadRun(path)
      } else if (focus) editors[path]?.focus()
      void scrollToPart(path)
    } else {
      open = null
      error = ''
      readId++
    }
  }

  /** The cursor moved into another sheet of the open run: the list follows. */
  function focusedPart(path: string): void {
    if (selection.length === 1 && selection[0] === path) return
    selection = [path]
    cursor = anchor = path
  }

  /** Arrow keys at the edge of a sheet carry on into its neighbour in the run. */
  function crossEdge(path: string, direction: 'back' | 'forward'): boolean {
    const parts = open?.parts ?? []
    const next = parts[parts.findIndex((p) => p.path === path) + (direction === 'forward' ? 1 : -1)]
    if (!next) return false
    editors[next.path]?.focusAt(direction === 'forward' ? 'start' : 'end')
    return true
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
  async function runOp(op: () => Promise<OpResult>, reload = false): Promise<OpResult | undefined> {
    await autosaver.flush()
    try {
      const result = await op()
      const remap = (path: string): string => remapPath(path, result.moved)
      library = result.library
      selectedGroup = remap(selectedGroup)
      if (!findGroup(result.library.tree, selectedGroup)) selectedGroup = result.library.tree.path
      selection = selection.map(remap)
      cursor = cursor && remap(cursor)
      anchor = anchor && remap(anchor)
      expanded = Object.fromEntries(Object.entries(expanded).map(([p, o]) => [remap(p), o]))
      await refreshOpen(reload)
      notice = ''
      return result
    } catch (e) {
      notice = errorMessage(e)
      return undefined
    }
  }

  /** Makes the editor match the selection: drops sheets that are gone, reloads when told to. */
  async function refreshOpen(force: boolean): Promise<void> {
    if (!library) return
    const tree = library.tree
    selection = selection.filter((p) => sheetExists(tree, p))
    if (selection.length === 0) cursor = anchor = null
    if (selection.length !== 1) {
      if (open) {
        open = null
        readId++
      }
      return
    }
    if (force || !runIsOpen(selection[0]!)) await loadRun(selection[0]!)
  }

  function showInfo(text: string): void {
    info = text
    clearTimeout(infoTimer)
    infoTimer = setTimeout(() => (info = ''), 3000)
  }

  async function splitAtCursor(): Promise<void> {
    const part = open?.parts.find((p) => editors[p.path]?.cursorInfo())
    const where = part && editors[part.path]?.cursorInfo()
    if (!part || !where) {
      notice = 'Put the cursor in a sheet to split it there.'
      return
    }
    const path = part.path
    const result = await runOp(() => window.api.split(path, where.text, where.offset), true)
    if (result?.created) {
      anchor = result.created
      await setSelection([result.created], result.created, true)
    }
  }

  async function mergeSelected(): Promise<void> {
    if (selection.length < 2) {
      notice = 'Select two or more sheets to merge.'
      return
    }
    const chosen = [...selection]
    const result = await runOp(() => window.api.merge(chosen), true)
    if (result?.created) {
      anchor = result.created
      await setSelection([result.created], result.created)
    }
  }

  async function glueSelected(glue: boolean): Promise<void> {
    if (selection.length === 0) {
      notice = 'Select a sheet first.'
      return
    }
    const chosen = [...selection]
    await runOp(() => (glue ? window.api.glue(chosen) : window.api.unglue(chosen)))
  }

  async function undoSheetChange(): Promise<void> {
    const result = await runOp(() => window.api.undo(), true)
    if (result?.label) showInfo(`Undid ${result.label.toLowerCase()}`)
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

  // --- Search ----------------------------------------------------------------

  let searching = $state(false)
  let searchReturnFocus: HTMLElement | null = null

  function openSearch(): void {
    searchReturnFocus = document.activeElement as HTMLElement | null
    searching = true
  }

  function closeSearch(): void {
    searching = false
    searchReturnFocus?.focus()
  }

  /** Opens a sheet found by search: selects its group, expands the way to it, and shows it. */
  async function revealSheet(path: string): Promise<void> {
    if (!library) return
    searching = false
    await autosaver.flush()
    const parent = path.slice(0, path.lastIndexOf('/'))
    for (let p = parent; p.length >= library.tree.path.length; p = p.slice(0, p.lastIndexOf('/'))) {
      expanded[p] = true
    }
    selectedGroup = parent
    await setSelection([path], path, true)
  }

  // --- Export ----------------------------------------------------------------

  let exportPreview = $state<{ title: string; html: string; sheets: number } | null>(null)
  let exportPaths: string[] = [] // plain, so it can cross the bridge
  let exportSaving = $state(false)

  /** Previews the HTML export of the selected sheets, or of the group when the tree has focus. */
  async function openExport(): Promise<void> {
    if (!library) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    exportPaths = !inTree && selection.length > 0 ? [...selection] : [selectedGroup]
    try {
      exportPreview = await window.api.previewExport(exportPaths)
      notice = ''
    } catch (e) {
      notice = errorMessage(e)
    }
  }

  async function saveExport(): Promise<void> {
    exportSaving = true
    try {
      const saved = await window.api.saveExport(exportPaths)
      if (saved) {
        exportPreview = null
        showInfo('Exported to ' + saved.split(/[\\/]/).pop())
      }
    } catch (e) {
      notice = errorMessage(e)
      exportPreview = null
    } finally {
      exportSaving = false
    }
  }

  async function saveExportPdf(options: PdfOptions): Promise<void> {
    exportSaving = true
    try {
      const saved = await window.api.saveExportPdf(exportPaths, { ...options })
      if (saved) {
        exportPreview = null
        showInfo('Exported to ' + saved.split(/[\\/]/).pop())
      }
    } catch (e) {
      notice = errorMessage(e)
      exportPreview = null
    } finally {
      exportSaving = false
    }
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

  // --- Drag and drop -------------------------------------------------------

  // What is being dragged: sheets from the list, or one group from the tree.
  // Plain, not state: nothing draws from it, and its arrays must cross the IPC bridge.
  let drag: { kind: 'sheets' | 'group'; paths: string[]; parent: string } | null = null
  let treeHint = $state<{ path: string; zone: DropZone } | null>(null)
  // Where dragged sheets would land in the list: before or after a row, or at the end.
  let sheetHint = $state<{ path: string; after: boolean } | 'end' | null>(null)

  function parentOf(path: string): GroupNode | undefined {
    return library ? findGroup(library.tree, path.slice(0, path.lastIndexOf('/'))) : undefined
  }

  function endDrag(): void {
    drag = null
    treeHint = null
    sheetHint = null
  }

  function canDropOnGroup(target: string, zone: DropZone): boolean {
    if (!drag || !library) return false
    if (drag.kind === 'sheets') return zone === 'inside'
    const dragged = drag.paths[0]!
    if (target === dragged || target.startsWith(dragged + '/')) return false
    return zone === 'inside' || target !== library.tree.path // the root has no "before" or "after"
  }

  function sheetDragStart(path: string, e: DragEvent): void {
    const chosen = selection.includes(path) ? [...selection] : [path]
    if (!selection.includes(path)) void setSelection([path], path)
    drag = {
      kind: 'sheets',
      paths: sheetPaths.filter((p) => chosen.includes(p)),
      parent: selectedGroup
    }
    e.dataTransfer?.setData('text/plain', drag.paths.join('\n'))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function sheetsPaneDragOver(e: DragEvent): void {
    if (drag?.kind !== 'sheets' || drag.parent !== selectedGroup) return
    e.preventDefault()
    sheetHint = 'end'
  }

  function sheetDragOver(path: string, e: DragEvent): void {
    if (drag?.kind !== 'sheets' || drag.parent !== selectedGroup || drag.paths.includes(path))
      return
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    sheetHint = { path, after: e.clientY - rect.top > rect.height / 2 }
  }

  /** Reorders the dragged sheets to the slot the indicator shows. */
  function dropSheets(e: DragEvent): void {
    e.preventDefault()
    const dragged = drag
    const hint = sheetHint
    endDrag()
    const parent = group
    if (!dragged || !parent || !hint) return
    let slot: number | undefined
    if (hint !== 'end') {
      const rest = parent.children.map((c) => c.path).filter((p) => !dragged.paths.includes(p))
      slot = rest.indexOf(hint.path) + (hint.after ? 1 : 0)
    }
    void runOp(() => window.api.move(dragged.paths, parent.path, slot))
  }

  const treeDnd: TreeDnd = {
    get hint() {
      return treeHint
    },
    start(path, e) {
      drag = { kind: 'group', paths: [path], parent: path.slice(0, path.lastIndexOf('/')) }
      e.dataTransfer?.setData('text/plain', path)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    },
    over(path, zone, e) {
      if (!canDropOnGroup(path, zone)) {
        treeHint = null
        return
      }
      e.preventDefault()
      treeHint = { path, zone }
    },
    drop(path, zone, e) {
      e.preventDefault()
      const dragged = drag
      const ok = canDropOnGroup(path, zone)
      endDrag()
      if (!dragged || !ok) return
      if (zone === 'inside') {
        void runOp(() => window.api.move(dragged.paths, path)).then((result) => {
          if (!result) return
          expanded[path] = true
          if (dragged.kind === 'sheets') clearSheets()
        })
        return
      }
      const parent = parentOf(path)
      if (!parent) return
      const rest = parent.children.map((c) => c.path).filter((p) => p !== dragged.paths[0])
      const slot = rest.indexOf(path) + (zone === 'after' ? 1 : 0)
      void runOp(() => window.api.move(dragged.paths, parent.path, slot))
    },
    end: endDrag
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
        if (selection[0]) editors[selection[0]]?.focus()
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
    else if (e.key === '3' && selection[0]) editors[selection[0]]?.focus()
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
      else if (command === 'export-html') void openExport()
      else if (command === 'search') openSearch()
      else if (command === 'split') void splitAtCursor()
      else if (command === 'merge') void mergeSelected()
      else if (command === 'glue') void glueSelected(true)
      else if (command === 'unglue') void glueSelected(false)
      else if (command === 'undo-sheet-change') void undoSheetChange()
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
          dnd={treeDnd}
        />
      </ul>
      {#if notice}
        <p class="notice" role="alert">{notice}</p>
      {:else if info}
        <p class="info" role="status">{info}</p>
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
      ondragover={sheetsPaneDragOver}
      ondrop={dropSheets}
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
                draggable="true"
                ondragstart={(e) => sheetDragStart(sheet.path, e)}
                ondragend={endDrag}
                ondragover={(e) => sheetDragOver(sheet.path, e)}
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
        {#key open.parts.map((p) => p.path).join('\n')}
          <div class="run">
            {#each open.parts as part, i (part.path)}
              {#if i > 0}<hr class="seam" />{/if}
              <div class="part" data-path={part.path}>
                <Editor
                  bind:this={editors[part.path]}
                  text={part.text}
                  onchange={(content) => edited(part.path, content)}
                  onblur={() => void autosaver.flush()}
                  onescape={() => sheetsEl?.focus()}
                  onfocus={() => focusedPart(part.path)}
                  onedge={open.parts.length > 1 ? (d) => crossEdge(part.path, d) : undefined}
                  autofocus={focusEditor && part.path === selection[0]}
                />
              </div>
            {/each}
          </div>
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

{#if searching}
  <SearchDialog onpick={revealSheet} oncancel={closeSearch} />
{/if}

{#if exportPreview}
  <ExportPreview
    title={exportPreview.title}
    html={exportPreview.html}
    sheets={exportPreview.sheets}
    saving={exportSaving}
    onsave={saveExport}
    onsavepdf={saveExportPdf}
    onclose={() => (exportPreview = null)}
  />
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
  .sheet.run-start,
  .sheet.run-middle,
  .sheet.run-end {
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
  }
  .sheet.run-start {
    border-bottom-right-radius: 0;
  }
  .sheet.run-middle {
    border-radius: 0;
  }
  .sheet.run-end {
    border-top-right-radius: 0;
  }
  .sheet.drop-before {
    box-shadow: 0 -2px 0 var(--accent);
  }
  .sheet.drop-after {
    box-shadow: 0 2px 0 var(--accent);
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
  .info {
    margin: 0;
    padding: 8px 14px;
    color: var(--muted);
    font-size: 12px;
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
    position: relative;
    overflow-y: auto;
  }
  .run {
    padding: 48px 0 40vh;
  }
  .seam {
    max-width: 40rem;
    margin: 28px auto;
    border: none;
    border-top: 1px dashed var(--border);
  }
  .status {
    position: fixed;
    right: 16px;
    bottom: 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .status.problem {
    color: #c0392b;
  }
</style>
