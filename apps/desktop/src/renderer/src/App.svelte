<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    extractHeadings,
    listSheets,
    sheetPreview,
    sheetTitle,
    sortSheets,
    type GroupNode,
    type ColorTheme,
    type SheetNode,
    type SheetSort,
    type ViewSettings
  } from '@writingapp/core'
  import type { LibraryInfo, MenuCommand, OpResult, PdfOptions } from '../../preload/api'
  import { applyView } from './view'
  import { createSaveGuard, SaveConflict } from './conflict'
  import ConflictDialog from './ConflictDialog.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import type { PaletteCommand } from './palette'
  import { createAutosaver, type SaveStatus } from './autosave'
  import Editor from './Editor.svelte'
  import GroupTree from './GroupTree.svelte'
  import MovePicker from './MovePicker.svelte'
  import SearchDialog from './SearchDialog.svelte'
  import QuickOpen from './QuickOpen.svelte'
  import StatusBar from './StatusBar.svelte'
  import ToolButton from './ToolButton.svelte'
  import type { FormatKind, LineStyle } from './blockStyle'
  import Preferences from './Preferences.svelte'
  import SaveIndicator from './SaveIndicator.svelte'
  import Outline, { type Entry } from './Outline.svelte'
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
  // Text typed since a run was loaded, by path; the status bar counts from it.
  let edits = $state<Record<string, string>>({})
  let selectedText = $state('')
  let groupWords = $state<number | null>(null)
  let readId = 0
  let saveStatus = $state<SaveStatus>('saved')
  let renaming = $state<string | null>(null)
  let notice = $state('')
  let info = $state('')
  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let focusEditor = $state(false)
  let sidebarCollapsed = $state(false)
  /** Distraction-free: only the text, with the panes and tools out of sight until the pointer asks. */
  let zen = $state(false)
  const sidebarHidden = $derived(sidebarCollapsed || zen)
  let sidebarPeek = $state(false)
  let outlineOpen = $state(false)
  let focusMode = $state(false)
  let typewriter = $state(false)
  let lineNumbers = $state(false)
  let peekTimer: ReturnType<typeof setTimeout> | undefined
  let treeEl = $state<HTMLElement>()
  let sheetsEl = $state<HTMLElement>()
  let editors = $state<Record<string, Editor | undefined>>({})
  let picker = $state<{ heading: string; paths: string[]; targets: MoveTarget[] } | null>(null)
  let pickerReturnFocus: HTMLElement | null = null

  /** A sheet that changed on disk while it had unsaved edits, waiting for the user's choice. */
  let conflict = $state<{ path: string; mine: string; disk: string } | null>(null)

  const guard = createSaveGuard({
    read: (path) => window.api.readSheet(path),
    write: (path, content) => window.api.writeSheet(path, content)
  })
  const autosaver = createAutosaver({
    save: async (path, content) => {
      try {
        await guard.save(path, content)
      } catch (e) {
        if (e instanceof SaveConflict) raiseConflict(path, edits[path] ?? content, e.disk)
        throw e
      }
    },
    onStatus: (status) => (saveStatus = status)
  })

  function raiseConflict(path: string, mine: string, disk: string): void {
    if (conflict?.path !== path) conflict = { path, mine, disk }
  }

  function keepMine(): void {
    if (!conflict) return
    const { path, mine, disk } = conflict
    conflict = null
    guard.trust(path, disk)
    autosaver.change(path, mine)
  }

  function useDisk(): void {
    if (!conflict) return
    const { path, disk } = conflict
    conflict = null
    autosaver.discard(path)
    guard.trust(path, disk)
    edits[path] = disk
    editors[path]?.replaceText(disk)
    showInfo('Reloaded the version from disk')
  }

  const runText = $derived(open ? open.parts.map((p) => edits[p.path] ?? p.text).join('\n\n') : '')

  // Remember the open sheet, so the next launch can come back to it.
  $effect(() => {
    const only = selection.length === 1 ? selection[0] : undefined
    if (only) void window.api.setLastSheet(only)
  })

  // Total for the selected group, recounted shortly after the tree or a save changes.
  let wordsRequest = 0
  $effect(() => {
    const path = selectedGroup
    void library
    if (!library || saveStatus !== 'saved') return
    const id = ++wordsRequest
    const timer = setTimeout(() => {
      window.api
        .groupWords(path)
        .then((total) => {
          if (id === wordsRequest) groupWords = total
        })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  })

  const group = $derived(library ? findGroup(library.tree, selectedGroup) : undefined)
  const sheets = $derived((group?.children.filter((c) => c.kind === 'sheet') ?? []) as SheetNode[])
  let filter = $state('')
  let prefs = $state<Parameters<typeof applyView>[0] | null>(null)
  const sortBy = $derived(prefs?.sheetSort ?? 'manual')
  let sortOpen = $state(false)
  const SORTS: [SheetSort, string][] = [
    ['manual', 'Manual order'],
    ['title', 'Title'],
    ['modified', 'Date modified'],
    ['created', 'Date created'],
    ['words', 'Word count']
  ]
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  /** The small line under a card's title when the sort makes a value worth showing. */
  function sortNote(sheet: SheetNode): string {
    if (sortBy === 'words') return `${sheet.words.toLocaleString()} words`
    const time = sortBy === 'created' ? sheet.created : sortBy === 'modified' ? sheet.modified : undefined
    return time === undefined ? '' : dateFormat.format(time)
  }
  /** What the list shows: every sheet, or those whose title or preview contain the filter. */
  const shown = $derived.by(() => {
    const needle = filter.trim().toLowerCase()
    const ordered = sortSheets(sheets, sortBy)
    if (!needle) return ordered
    return ordered.filter((s) => `${s.title}\n${s.preview}`.toLowerCase().includes(needle))
  })
  const sheetPaths = $derived(sheets.map((s) => s.path))
  /** The sheets in the order the list shows them, for keyboard and range selection. */
  const listPaths = $derived(shown.map((s) => s.path))
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

  /** Collapsed, the sidebar slides in while the pointer is at the left edge or over it. */
  function peekSidebar(): void {
    clearTimeout(peekTimer)
    if (sidebarHidden) sidebarPeek = true
  }

  function unpeekSidebar(): void {
    clearTimeout(peekTimer)
    peekTimer = setTimeout(() => (sidebarPeek = false), 250)
  }

  /** Applies bold, italic or link to the sheet being typed in (the last one focused in a run). */
  function formatActive(kind: 'bold' | 'italic' | 'link' | FormatKind): void {
    const path = selection.length === 1 ? selection[0] : open?.parts[0]?.path
    if (path) editors[path]?.format(kind)
  }

  function insertTable(): void {
    const path = selection.length === 1 ? selection[0] : open?.parts[0]?.path
    if (path) editors[path]?.insertTableAtCursor()
  }

  let styleOpen = $state(false)
  let styleNow = $state<LineStyle>('body')
  function toggleStyleMenu(): void {
    if (!styleOpen) {
      const path = selection.length === 1 ? selection[0] : open?.parts[0]?.path
      styleNow = (path && editors[path]?.lineStyle()) || 'body'
    }
    styleOpen = !styleOpen
  }
  function applyStyle(kind: FormatKind): void {
    styleOpen = false
    formatActive(kind)
  }
  const STYLES: { kind: FormatKind; label: string; hint?: string }[][] = [
    [
      { kind: 'h1', label: 'Heading 1', hint: '1' },
      { kind: 'h2', label: 'Heading 2', hint: '2' },
      { kind: 'h3', label: 'Heading 3', hint: '3' },
      { kind: 'body', label: 'Body text', hint: '4' }
    ],
    [
      { kind: 'quote', label: 'Quote' },
      { kind: 'bullet', label: 'Bulleted list' },
      { kind: 'numbered', label: 'Numbered list' },
      { kind: 'task', label: 'Task list' }
    ],
    [
      { kind: 'strike', label: 'Strikethrough' },
      { kind: 'code', label: 'Inline code' },
      { kind: 'codeblock', label: 'Code block' },
      { kind: 'comment', label: 'Comment' },
      { kind: 'rule', label: 'Horizontal rule' }
    ]
  ]

  function toggleOutline(): void {
    void window.api.setView({ outline: !outlineOpen })
  }

  const outlineEntries = $derived<Entry[]>(
    open
      ? open.parts.flatMap((part) =>
          extractHeadings(edits[part.path] ?? part.text).map((h) => ({ ...h, path: part.path }))
        )
      : []
  )

  /** Which section the cursor is in: its part of the run and the heading index within it. */
  let currentSection = $state<{ path: string; heading: number } | null>(null)
  const currentEntry = $derived.by(() => {
    if (!currentSection) return null
    const own = outlineEntries.filter((e) => e.path === currentSection!.path)
    return own[currentSection.heading] ?? null
  })

  function goToHeading(entry: Entry): void {
    editors[entry.path]?.goTo(entry.offset)
  }

  function toggleSidebar(): void {
    sidebarPeek = false
    void window.api.setView({ sidebarCollapsed: !sidebarCollapsed })
  }

  let preferencesOpen = $state(false)

  let themes = $state<ColorTheme[]>([])
  const activeTheme = $derived(themes.find((t) => t.id === prefs?.colorTheme))
  $effect(() => {
    if (prefs) applyView(prefs, activeTheme)
  })

  function applyViewSettings(view: Parameters<typeof applyView>[0]): void {
    prefs = view
    sidebarCollapsed = view.sidebarCollapsed
    outlineOpen = view.outline
    focusMode = view.focusMode
    typewriter = view.typewriter
    lineNumbers = view.lineNumbers
    if (!sidebarHidden) sidebarPeek = false
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
      paths.forEach((p, i) => guard.trust(p, texts[i]!))
      open = { parts: paths.map((p, i) => ({ path: p, text: texts[i]! })) }
      edits = {}
      selectedText = ''
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

  // --- Back and forward ---------------------------------------------------

  const TRAIL_LIMIT = 100
  let trail = $state<string[]>([])
  let trailAt = $state(-1)
  let navigating = false

  /** Remembers a sheet the user opened, dropping whatever lay ahead of the current one. */
  function visit(path: string): void {
    if (navigating || trail[trailAt] === path) return
    trail = [...trail.slice(0, trailAt + 1), path].slice(-TRAIL_LIMIT)
    trailAt = trail.length - 1
  }

  /** Steps through the visited sheets, skipping any that no longer exist. */
  async function step(delta: -1 | 1): Promise<void> {
    if (!library) return
    let at = trailAt + delta
    while (trail[at] !== undefined && !sheetExists(library.tree, trail[at]!)) at += delta
    const path = trail[at]
    if (path === undefined) return
    trailAt = at
    navigating = true
    try {
      await revealSheet(path, false)
    } finally {
      navigating = false
    }
  }
  const canBack = $derived(trailAt > 0)
  const canForward = $derived(trailAt >= 0 && trailAt < trail.length - 1)

  /** Selects sheets. The editor shows the sheet, with its whole run, when exactly one is selected. */
  async function setSelection(paths: string[], to: string | null, focus = false): Promise<void> {
    await autosaver.flush()
    const left = selection.filter((p) => !paths.includes(p))
    selection = paths
    cursor = to
    if (paths.length === 1) {
      const path = paths[0]!
      visit(path)
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
    if (left.length > 0) void renameToMatchTitles(left)
  }

  /** Sheets just left are renamed to follow their titles; the UI follows the new paths. */
  async function renameToMatchTitles(paths: string[]): Promise<void> {
    try {
      const result = await window.api.syncSheetNames(paths)
      if (result.moved.length === 0) return
      await runOp(() => Promise.resolve(result))
    } catch {
      // A name that cannot change is not worth interrupting anyone for.
    }
  }

  /** The cursor moved into another sheet of the open run: the list follows. */
  function focusedPart(path: string): void {
    if (selection.length === 1 && selection[0] === path) return
    selection = [path]
    cursor = anchor = path
    visit(path)
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
    if (e.shiftKey && anchor) return setSelection(pathRange(listPaths, anchor, path), path)
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

  /** Moves the selected sheets, or the selected group when the tree has focus, to the trash. */
  async function deleteSelected(): Promise<void> {
    if (!library) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    let paths: string[]
    let fallback = selectedGroup
    if (inTree || selection.length === 0) {
      if (selectedGroup === library.tree.path) {
        notice = 'Select a sheet or group to delete first.'
        return
      }
      paths = [selectedGroup]
      fallback = selectedGroup.slice(0, selectedGroup.lastIndexOf('/'))
    } else paths = [...selection] // a plain array: state proxies cannot cross the bridge
    const result = await runOp(() => window.api.deleteNodes(paths))
    if (!result) return
    if (!findGroup(result.library.tree, selectedGroup)) selectedGroup = fallback
    showInfo('Moved to the trash. Undo with Cmd/Ctrl+Alt+Z.')
  }

  async function undoSheetChange(): Promise<void> {
    const result = await runOp(() => window.api.undo(), true)
    if (result?.label) showInfo(`Undid ${result.label.toLowerCase()}`)
  }

  /** Right-click menu: act on what was clicked, selecting it first if it is not already. */
  async function nodeMenu(kind: 'sheet' | 'group' | 'root', path: string): Promise<void> {
    if (!library) return
    if (kind === 'sheet') {
      if (!selection.includes(path)) await setSelection([path], path)
    } else if (selectedGroup !== path) {
      selectGroup(path)
      await tick()
    }
    const action = await window.api.showNodeMenu(kind, path)
    if (!action) return
    if (action === 'new-sheet') await newSheet()
    else if (action === 'new-group') await newGroup(kind === 'root')
    else if (action === 'rename') void startRename(path)
    else if (action === 'move') {
      if (kind === 'group') treeEl?.focus()
      else await tick()
      openMoveTo()
    } else if (action === 'delete') {
      if (kind === 'group') treeEl?.focus()
      await tick()
      await deleteSelected()
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
    edits[path] = content
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
    filter = ''
    clearSheets()
  }

  function toggle(path: string): void {
    expanded[path] = !expanded[path]
  }

  // --- Changes made outside the app -----------------------------------------

  /** Takes in a change to the library folder made by something else: a sync client, a file manager. */
  async function externalChange(info: LibraryInfo): Promise<void> {
    if (!library || info.path !== library.path) return
    if (JSON.stringify(info.tree) === JSON.stringify(library.tree) && !open) return
    if (JSON.stringify(info.tree) !== JSON.stringify(library.tree)) {
      library = info
      if (!findGroup(info.tree, selectedGroup)) {
        selectedGroup = info.tree.path
        clearSheets()
        return
      }
      await refreshOpen(false)
    }
    if (!open) return
    for (const part of open.parts) {
      const editor = editors[part.path]
      if (!editor) continue
      try {
        const mine = editor.getText()
        const disk = await window.api.readSheet(part.path)
        if (disk === mine || editor.getText() !== mine) {
          if (disk === mine) guard.trust(part.path, disk)
          continue
        }
        if (mine === guard.baseline(part.path)) {
          // No edits of mine in this sheet: take the disk's version.
          editor.replaceText(disk)
          guard.trust(part.path, disk)
          edits[part.path] = disk
          showInfo('A sheet changed outside the app and was reloaded')
        } else if (disk !== guard.baseline(part.path)) {
          // Unsaved edits here and a change on disk: never overwrite without asking.
          raiseConflict(part.path, mine, disk)
        }
      } catch {
        // The sheet vanished; the next tree update drops it.
      }
    }
  }

  // --- Quick open --------------------------------------------------------------

  let quickOpening = $state(false)

  function openQuick(): void {
    searchReturnFocus = document.activeElement as HTMLElement | null
    quickOpening = true
  }

  function closeQuick(): void {
    quickOpening = false
    searchReturnFocus?.focus()
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
  async function revealSheet(path: string, focus = true): Promise<void> {
    if (!library) return
    searching = false
    quickOpening = false
    await autosaver.flush()
    const parent = path.slice(0, path.lastIndexOf('/'))
    for (let p = parent; p.length >= library.tree.path.length; p = p.slice(0, p.lastIndexOf('/'))) {
      expanded[p] = true
    }
    selectedGroup = parent
    await setSelection([path], path, focus)
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
    // A sorted list has no saved order to rearrange; sheets can still be dragged to a group.
    if (sortBy !== 'manual') return
    if (drag?.kind !== 'sheets' || drag.parent !== selectedGroup) return
    e.preventDefault()
    sheetHint = 'end'
  }

  function sheetDragOver(path: string, e: DragEvent): void {
    if (sortBy !== 'manual') return
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
        listPaths,
        chosen,
        e.key === 'ArrowUp' ? -1 : 1
      )
      if (slot !== undefined) void runOp(() => window.api.move(chosen, parent.path, slot))
      return
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      void setSelection([...listPaths], cursor ?? listPaths[0] ?? null)
      return
    }
    if (mod || e.altKey) return

    const at = cursor ? listPaths.indexOf(cursor) : -1
    let target: number
    switch (e.key) {
      case 'ArrowDown':
        target = Math.min(at + 1, listPaths.length - 1)
        break
      case 'ArrowUp':
        target = at < 0 ? 0 : Math.max(at - 1, 0)
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = listPaths.length - 1
        break
      case 'Enter':
        e.preventDefault()
        if (selection[0]) editors[selection[0]]?.focus()
        return
      default:
        return
    }
    e.preventDefault()
    const path = listPaths[target]
    if (path === undefined) return
    if (e.shiftKey && anchor) {
      void setSelection(pathRange(listPaths, anchor, path), path)
    } else {
      anchor = path
      void setSelection([path], path)
    }
  }

  function windowKeydown(e: KeyboardEvent): void {
    // Cmd/Ctrl+1, 2, 3 jump between the panes; Cmd/Ctrl+[ and ] go back and forward.
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !library) return
    if (e.key === '[') void step(-1)
    else if (e.key === ']') void step(1)
    else if (e.key === '1') treeEl?.focus()
    else if (e.key === '2') sheetsEl?.focus()
    else if (e.key === '3' && selection[0]) editors[selection[0]]?.focus()
    else return
    e.preventDefault()
  }

  /** Clicking a row selects it but keeps focus on the pane, so keys keep working. */
  function keepFocus(pane: HTMLElement | undefined) {
    return (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('input')) {
        // Not preventDefault: cancelling mousedown stops a drag from starting.
        // Take focus back once the click has had its say instead.
        setTimeout(() => pane?.focus(), 0)
      }
    }
  }

  /** Runs a menu command; the menus and the command palette both come through here. */
  function handleCommand(command: MenuCommand): void {
    if (!library) return
    if (command === 'toggle-sidebar') toggleSidebar()
    else if (command === 'new-sheet') void newSheet()
    else if (command === 'move-to') openMoveTo()
    else if (command === 'export-html') void openExport()
    else if (command === 'search') openSearch()
    else if (command === 'quick-open') openQuick()
    else if (command === 'command-palette') openPalette()
    else if (command === 'distraction-free') toggleZen()
    else if (command === 'preferences') preferencesOpen = true
    else if (command === 'insert-table') insertTable()
    else if (command.startsWith('format-')) formatActive(command.slice(7) as FormatKind)
    else if (command === 'delete') void deleteSelected()
    else if (command === 'split') void splitAtCursor()
    else if (command === 'merge') void mergeSelected()
    else if (command === 'glue') void glueSelected(true)
    else if (command === 'unglue') void glueSelected(false)
    else if (command === 'undo-sheet-change') void undoSheetChange()
    else void newGroup(command === 'new-project')
  }

  function toggleZen(): void {
    zen = !zen
    sidebarPeek = false
    if (zen) {
      const only = selection.length === 1 ? selection[0] : open?.parts[0]?.path
      if (only) editors[only]?.focus()
    }
  }

  // --- Command palette ---------------------------------------------------------

  let palette = $state(false)

  function openPalette(): void {
    searchReturnFocus = document.activeElement as HTMLElement | null
    palette = true
  }

  function closePalette(): void {
    palette = false
    searchReturnFocus?.focus()
  }

  function runPaletteCommand(command: PaletteCommand): void {
    palette = false
    searchReturnFocus?.focus()
    command.run()
  }

  const paletteCommands = $derived.by((): PaletteCommand[] => {
    const menu = (section: string, label: string, command: MenuCommand, shortcut?: string): PaletteCommand => ({
      id: `${section}:${label}`,
      section,
      label,
      shortcut,
      run: () => handleCommand(command)
    })
    const setting = (section: string, label: string, patch: Partial<ViewSettings>): PaletteCommand => ({
      id: `${section}:${label}`,
      section,
      label,
      run: () => void window.api.setView(patch)
    })
    const view = prefs
    const list: PaletteCommand[] = [
      menu('File', 'New Sheet', 'new-sheet', `${keyMod}N`),
      menu('File', 'New Group', 'new-group', `${keyMod}${keyShift}N`),
      menu('File', 'New Project', 'new-project'),
      menu('File', 'Move to…', 'move-to', `${keyMod}${keyShift}M`),
      menu('File', 'Move to Trash', 'delete'),
      menu('File', 'Quick Open…', 'quick-open', `${keyMod}P`),
      menu('File', 'Find in Library…', 'search', `${keyMod}${keyShift}F`),
      menu('File', 'Export…', 'export-html', `${keyMod}E`),
      menu('File', 'Preferences…', 'preferences', `${keyMod},`),
      menu('Sheet', 'Split at Cursor', 'split', `${keyMod}${keyShift}↩`),
      menu('Sheet', 'Merge Sheets', 'merge', `${keyMod}${keyShift}J`),
      menu('Sheet', 'Glue Sheets', 'glue', `${keyMod}${keyShift}G`),
      menu('Sheet', 'Unglue Sheets', 'unglue'),
      menu('Sheet', 'Undo Library Change', 'undo-sheet-change'),
      ...STYLES.flat().map((s) =>
        menu('Format', s.label, `format-${s.kind}`, s.hint ? `${keyMod}⌥${s.hint}` : undefined)
      ),
      menu('Format', 'Bold', 'format-bold', `${keyMod}B`),
      menu('Format', 'Italic', 'format-italic', `${keyMod}I`),
      menu('Format', 'Link', 'format-link', `${keyMod}K`),
      menu('Insert', 'Table', 'insert-table'),
      menu('View', 'Toggle Sidebar', 'toggle-sidebar', `${keyMod}\\`),
      menu('View', zen ? 'Leave Distraction-Free Mode' : 'Distraction-Free Mode', 'distraction-free', `${keyMod}${keyShift}D`),
      { id: 'View:outline', section: 'View', label: 'Toggle Outline', shortcut: `${keyMod}⌥O`, run: toggleOutline },
      setting('View', `${view?.focusMode ? 'Turn off' : 'Turn on'} Focus Mode`, { focusMode: !view?.focusMode }),
      setting('View', `${view?.typewriter ? 'Turn off' : 'Turn on'} Typewriter Scrolling`, { typewriter: !view?.typewriter }),
      setting('View', `${view?.lineNumbers ? 'Hide' : 'Show'} Line Numbers`, { lineNumbers: !view?.lineNumbers }),
      setting('View', 'Light Theme', { theme: 'light' }),
      setting('View', 'Dark Theme', { theme: 'dark' }),
      setting('View', 'Match System Theme', { theme: 'system' }),
      setting('View', 'Serif Font', { font: 'serif' }),
      setting('View', 'Sans-serif Font', { font: 'sans' }),
      setting('View', 'Monospace Font', { font: 'mono' }),
      setting('View', 'Larger Text', { fontSize: (view?.fontSize ?? 18) + 1 }),
      setting('View', 'Smaller Text', { fontSize: (view?.fontSize ?? 18) - 1 }),
      ...SORTS.map(([value, label]) => setting('Sort', `Sheets by ${label}`, { sheetSort: value }))
    ]
    return list
  })

  onMount(() => {
    void window.api.listThemes().then((found) => (themes = found))
    void window.api.getView().then(applyViewSettings)
    const unsubscribeView = window.api.onViewChanged(applyViewSettings)
    window.api
      .getLibrary()
      .then(async (info) => {
        if (!info) return
        showLibrary(info)
        // Pick up where the last session ended.
        const last = await window.api.getLastSheet()
        if (last && sheetExists(info.tree, last)) await revealSheet(last, false)
      })
      .finally(() => (loading = false))
    const unsubscribeOpened = window.api.onLibraryOpened(showLibrary)
    const unsubscribeChanged = window.api.onLibraryChanged((info) => void externalChange(info))
    const unsubscribeMenu = window.api.onMenuCommand(handleCommand)
    // Last chance to save when the window closes.
    const saveOnClose = (): void => void autosaver.flush()
    window.addEventListener('beforeunload', saveOnClose)
    return () => {
      unsubscribeOpened()
      unsubscribeChanged()
      unsubscribeMenu()
      unsubscribeView()
      window.removeEventListener('beforeunload', saveOnClose)
    }
  })
  const isMac = navigator.platform.startsWith('Mac')
  const keyMod = isMac ? '⌘' : 'Ctrl+'
  const keyShift = isMac ? '⇧' : 'Shift+'
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
  <div class="layout" class:collapsed={sidebarHidden} class:zen>
    {#if sidebarHidden}
      <div class="edge" role="presentation" onmouseenter={peekSidebar}></div>
    {/if}
    <div
      class="sidebar"
      class:peek={sidebarPeek}
      role="presentation"
      onmouseenter={peekSidebar}
      onmouseleave={unpeekSidebar}
    >
    <div
      class="pane library"
      role="tree"
      aria-label="Library"
      tabindex="0"
      bind:this={treeEl}
      onkeydown={treeKeydown}
      onmousedown={keepFocus(treeEl)}
    >
      <header class="library-bar">
        <span class="tools">
          <ToolButton icon="new-group" label="New group" hint="{keyMod}{keyShift}N" onclick={() => void newGroup(false)} />
          <ToolButton icon="sidebar" label="Hide sidebar" hint={keyMod + "\\"} onclick={toggleSidebar} />
        </span>
      </header>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="project"
        class:selected={selectedGroup === library.tree.path}
        oncontextmenu={(e) => {
          e.preventDefault()
          if (library) void nodeMenu('root', library.tree.path)
        }}
      >
        <button
          class="project-title"
          tabindex="-1"
          title={library.path}
          onclick={() => library && void selectGroup(library.tree.path)}>{library.tree.name}</button
        >
      </div>
      <ul role="none">
        <GroupTree
          hideRoot
          group={library.tree}
          selected={selectedGroup}
          {expanded}
          {renaming}
          onselect={selectGroup}
          ontoggle={toggle}
          onstartrename={startRename}
          oncommitrename={commitRename}
          oncancelrename={finishRename}
          oncolor={(path, color) => void runOp(() => window.api.setColor(path, color))}
          oncontext={(path) => void nodeMenu(path === library?.tree.path ? 'root' : 'group', path)}
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
      <header>
        <span class="title">{group?.name ?? ''}</span>
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
                      void window.api.setView({ sheetSort: value })
                    }}>{label}</button
                  >
                {/each}
              </div>
            {/if}
          </span>
          <ToolButton icon="new-sheet" label="New sheet" hint="{keyMod}N" onclick={() => void newSheet()} />
        </span>
      </header>
      {#if sheets.length > 0}
        <div class="filter">
          <input
            type="search"
            placeholder="Filter"
            aria-label="Filter sheets"
            bind:value={filter}
            onkeydown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                filter = ''
                sheetsEl?.focus()
              }
            }}
          />
        </div>
      {/if}
      {#if sheets.length === 0}
        <p class="placeholder small">No Sheets</p>
      {:else if shown.length === 0}
        <p class="placeholder small">No Matches</p>
      {:else}
        <ul>
          {#each shown as sheet (sheet.path)}
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
                oncontextmenu={(e) => {
                  e.preventDefault()
                  void nodeMenu('sheet', sheet.path)
                }}
              >
                <span class="sheet-head">
                  <span class="sheet-title">{sheet.title}</span>
                  {#if sortNote(sheet)}<span class="sheet-note">{sortNote(sheet)}</span>{/if}
                </span>
                <span class="sheet-preview" class:blank={sheet.preview === ''}>{sheet.preview || '(No Content)'}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    </div>

    <section class="editor" aria-label="Editor">
      <div class="editor-bar" role="toolbar" aria-label="Editor tools">
        <span class="tools">
          {#if sidebarCollapsed}
            <ToolButton icon="sidebar" label="Show sidebar" hint={keyMod + "\\"} onclick={toggleSidebar} />
          {/if}
          <ToolButton icon="back" label="Back" hint="{keyMod}[" disabled={!canBack} onclick={() => void step(-1)} />
          <ToolButton icon="forward" label="Forward" hint="{keyMod}]" disabled={!canForward} onclick={() => void step(1)} />
          <ToolButton icon="search" label="Find in library" hint="{keyMod}{keyShift}F" onclick={openSearch} />
        </span>
        <span class="tools">
          <ToolButton icon="bold" label="Bold" hint="{keyMod}B" disabled={open === null} onclick={() => formatActive('bold')} />
          <ToolButton icon="italic" label="Italic" hint="{keyMod}I" disabled={open === null} onclick={() => formatActive('italic')} />
          <ToolButton icon="link" label="Link" hint="{keyMod}K" disabled={open === null} onclick={() => formatActive('link')} />
          <span class="style-wrap">
            <ToolButton icon="style" label="Styles" pressed={styleOpen} disabled={open === null} onclick={toggleStyleMenu} />
            {#if styleOpen}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="scrim" onmousedown={() => (styleOpen = false)}></div>
              <div class="style-menu" role="menu" tabindex="-1" aria-label="Styles" onmousedown={(e) => e.preventDefault()}>
                {#each STYLES as group, i (i)}
                  {#if i > 0}<hr />{/if}
                  {#each group as item (item.kind)}
                    <button role="menuitem" class:current={item.kind === styleNow} onclick={() => applyStyle(item.kind)}>
                      <span>{item.label}</span>
                      {#if item.hint}<kbd>{keyMod}⌥{item.hint}</kbd>{/if}
                    </button>
                  {/each}
                {/each}
              </div>
            {/if}
          </span>
        </span>
        <span class="tools right">
          {#if open}<SaveIndicator status={saveStatus} />{/if}
          <ToolButton icon="outline" label="{outlineOpen ? 'Hide' : 'Show'} outline" hint="{keyMod}⌥O" pressed={outlineOpen} onclick={toggleOutline} />
          <ToolButton icon="export" label="Export" hint="{keyMod}E" onclick={() => void openExport()} />
        </span>
      </div>
      <div class="scroller">
      {#if error}
        <p class="hint">{error}</p>
      {:else if open}
        {#key open.parts.map((p) => p.path).join('\n')}
          <div class="run" class:focus-mode={focusMode} class:typewriter>
            {#each open.parts as part, i (part.path)}
              {#if i > 0}<hr class="seam" />{/if}
              <div class="part" data-path={part.path}>
                <Editor
                  bind:this={editors[part.path]}
                  text={part.text}
                  onchange={(content) => edited(part.path, content)}
                  onblur={() => void autosaver.flush()}
                  onescape={() => (zen ? toggleZen() : sheetsEl?.focus())}
                  onfocus={() => focusedPart(part.path)}
                  onedge={open.parts.length > 1 ? (d) => crossEdge(part.path, d) : undefined}
                  onselection={(text) => (selectedText = text)}
                  onsection={(heading) => (currentSection = { path: part.path, heading })}
                  {focusMode}
                  {typewriter}
                  {lineNumbers}
                  smartTypography={prefs?.smartTypography}
                  focusScope={prefs?.focusScope}
                  typewriterAt={prefs?.typewriterPosition}
                  autofocus={focusEditor && part.path === selection[0]}
                />
              </div>
            {/each}
          </div>
        {/key}
      {:else if selection.length > 1}
        <p class="placeholder">{selection.length} Sheets Selected</p>
      {:else}
        <p class="placeholder">No Sheet Selected</p>
      {/if}
      </div>
      {#if open}
        <StatusBar text={runText} selected={selectedText} {groupWords} />
      {/if}
      {#if outlineOpen && !zen}
        <div class="outline-slot"><Outline entries={outlineEntries} current={currentEntry} onpick={goToHeading} /></div>
      {/if}
    </section>
  </div>
{/if}

{#if preferencesOpen && prefs}
  <Preferences
    view={prefs}
    {themes}
    onrefreshthemes={() => void window.api.listThemes().then((found) => (themes = found))}
    onchange={(patch) => void window.api.setView(patch)}
    onclose={() => (preferencesOpen = false)}
  />
{/if}

{#if searching}
  <SearchDialog onpick={revealSheet} oncancel={closeSearch} />
{/if}

{#if palette}
  <CommandPalette commands={paletteCommands} onrun={runPaletteCommand} oncancel={closePalette} />
{/if}

{#if conflict}
  <ConflictDialog
    name={conflict.path.slice(conflict.path.lastIndexOf('/') + 1)}
    mine={conflict.mine}
    disk={conflict.disk}
    onkeep={keepMine}
    onuse={useDisk}
  />
{/if}

{#if quickOpening && library}
  <QuickOpen items={listSheets(library.tree)} onpick={revealSheet} oncancel={closeQuick} />
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
    grid-template-columns: 540px minmax(0, 1fr);
  }
  .sidebar {
    display: grid;
    grid-template-columns: 240px 300px;
    min-width: 0;
    min-height: 0;
  }
  .layout.collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  /* Collapsed, the sidebar floats over the editor, off screen until it is peeked at. */
  .layout.collapsed .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 540px;
    z-index: 30;
    transform: translateX(-101%);
    transition: transform 140ms ease-out;
    box-shadow: none;
  }
  .layout.collapsed .sidebar.peek,
  .layout.collapsed .sidebar:has(:focus-visible) {
    transform: none;
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
  }
  .edge {
    position: fixed;
    inset: 0 auto 0 0;
    width: 6px;
    z-index: 29;
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
    overflow-y: auto;
    min-width: 0;
  }
  .library {
    background: var(--sidebar);
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
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px 0 14px;
    min-height: var(--topbar-height);
    position: sticky;
    top: 0;
    background: inherit;
  }
  header.library-bar {
    justify-content: flex-end;
  }
  /* The library's name, big and bold above its projects. */
  .project {
    padding: 4px 14px 10px;
  }
  .project-title {
    display: block;
    max-width: 100%;
    background: none;
    border: none;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 8px;
    cursor: default;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project.selected .project-title {
    background: var(--selected);
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .sort-wrap {
    position: relative;
  }
  .sort-menu {
    left: auto;
    right: 0;
    transform: none;
    min-width: 160px;
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
    font-size: 12.5px;
    line-height: 1.4;
    margin-top: 3px;
    /* Always three lines tall, so every card is the same height. */
    height: calc(3 * 1.4 * 12.5px);
    /* Up to three lines, like a card in Ulysses. */
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .filter {
    padding: 0 10px 8px;
  }
  .filter input {
    width: 100%;
    font: inherit;
    font-size: 12.5px;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: var(--topbar-height) minmax(0, 1fr);
    overflow: hidden;
  }
  /* Distraction-free: the tool row floats over the top edge and appears on hover. */
  .layout.zen .editor {
    grid-template-rows: 0 minmax(0, 1fr);
  }
  .layout.zen .scroller {
    padding-top: 2.5rem;
  }
  .layout.zen .editor-bar {
    position: absolute;
    inset: 0 0 auto 0;
    height: var(--topbar-height);
    z-index: 5;
    background: var(--bg);
    opacity: 0;
    transition: opacity 160ms;
  }
  .layout.zen .editor-bar:hover,
  .layout.zen .editor-bar:focus-within {
    opacity: 1;
  }
  .layout.zen :global(.pill) {
    opacity: 0;
    transition: opacity 160ms;
  }
  .layout.zen :global(.pill:hover) {
    opacity: 1;
  }
  .editor-bar {
    grid-column: 1;
    grid-row: 1;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 10px;
    user-select: none;
  }
  .tools {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .style-wrap {
    position: relative;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  .style-menu {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 6px;
    z-index: 21;
    min-width: 200px;
    padding: 5px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }
  .style-menu hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 2px;
  }
  .style-menu button {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    width: 100%;
    padding: 5px 9px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: default;
  }
  .style-menu button:hover {
    background: var(--hover);
  }
  .style-menu button.current {
    color: var(--accent);
    font-weight: 600;
  }
  .style-menu kbd {
    font: inherit;
    font-size: 12px;
    color: var(--muted);
  }
  .tools.right {
    justify-content: flex-end;
  }
  .scroller {
    grid-column: 1;
    grid-row: 2;
    position: relative;
    overflow-y: auto;
  }
  .outline-slot {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    min-height: 0;
  }
  .run {
    padding: 48px 0 var(--run-end-space, 40vh);
  }
  /* Typewriter scrolling needs room above the first line to centre it. */
  .run.typewriter {
    padding-top: 45vh;
  }
  /* Focus mode: the parts of a run that do not have the cursor fade out too. */
  .run.focus-mode:focus-within .part:not(:focus-within) {
    opacity: var(--dim-opacity, 0.3);
  }
  .part {
    transition: opacity 0.2s;
  }
  .seam {
    /* Lines up with the text column of the editors above and below. */
    width: calc(100% - 128px);
    max-width: calc(var(--editor-width, 46rem) - 128px);
    margin: 28px auto;
    border: none;
    border-top: 1px dashed var(--border);
  }
</style>
