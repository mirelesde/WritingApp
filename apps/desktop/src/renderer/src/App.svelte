<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import {
    extractHeadings,
    backlinksTo,
    linkTargets,
    listSheets,
    findConflictCopies,
    groupLabel,
    resolveWikiLink,
    sheetPreview,
    sheetTitle,
    type GroupNode,
    type ColorTheme,
    allSheets as librarySheets,
    libraryKeywords,
    parseFilter
  } from '@writingapp/core'
  import type { EditMenuInfo, LibraryInfo, MenuCommand } from '../../preload/api'
  import { applyView } from './view'
  import { ViewState } from './viewState.svelte'
  import { RecoveryFlow } from './recoveryFlow.svelte'
  import { sheetsKey, treeKey, windowKey } from './keyActions'
  import { DragDrop } from './dragDrop.svelte'
  import { NodeOps } from './nodeOps.svelte'
  import { SheetRun } from './sheetRun.svelte'
  import { DiskConflicts } from './diskConflicts.svelte'
  import { TabDrag } from './tabDrag'
  import { SheetCreation } from './sheetCreation.svelte'
  import { Trail } from './trail.svelte'
  import { UnsavedPrompt, type UnsavedAnswer, type UnsavedWhat } from './unsavedPrompt.svelte'
  import { TabsState } from './tabsState.svelte'
  import { SelectionState } from './selectionState.svelte'
  import { GroupNav } from './groupNav.svelte'
  import { ExportFlow } from './exportFlow.svelte'
  import { UnusedImages } from './unusedImages.svelte'
  import { buildPaletteCommands } from './paletteCommands'
  import { findScopeOptions } from './findScopes'
  import { ConflictFlow } from './conflictFlow.svelte'
  import { createSaveGuard, SaveConflict } from './conflict'
  import ConflictDialog from './ConflictDialog.svelte'
  import ConflictCopyDialog from './ConflictCopyDialog.svelte'
  import RecoveryDialog from './RecoveryDialog.svelte'
  import CleanUpImages from './CleanUpImages.svelte'
  import KeywordsDialog from './KeywordsDialog.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import { editMenuItems, nodeMenuItems, type MenuItem } from './contextMenu'
  import CommandPalette from './CommandPalette.svelte'
  import type { PaletteCommand } from './palette'
  import { createAutosaver, type SaveStatus } from './autosave'
  import UnsavedDialog from './UnsavedDialog.svelte'
  import Editor from './Editor.svelte'
  import { TabFlow } from './tabFlow'
  import { SelectionFlow } from './selectionFlow'
  import { OpRunner } from './opRunner'
  import { takeExternalChange, type ExternalHost } from './externalChanges'
  import { KeywordEdit } from './keywordEdit.svelte'
  import { FindFlow } from './findFlow.svelte'
  import { MoveFlow } from './moveFlow.svelte'
  import { runMenuCommand, type CommandActions } from './menuCommands'
  import { EditorActions } from './editorActions'
  import LibraryPane from './LibraryPane.svelte'
  import Welcome from './Welcome.svelte'
  import MovePicker from './MovePicker.svelte'
  import FindBar from './FindBar.svelte'
  import QuickOpen from './QuickOpen.svelte'
  import StatusBar from './StatusBar.svelte'
  import SheetsPane from './SheetsPane.svelte'
  import TabBar from './TabBar.svelte'
  import type { FormatKind, LineStyle } from './blockStyle'
  import Preferences from './Preferences.svelte'
  import EditorBar from './EditorBar.svelte'
  import Outline, { type Entry } from './Outline.svelte'
  import ExportPreview from './ExportPreview.svelte'
  import {
    errorMessage,
    runOf,
    visibleGroups,
  } from './organise'
  import {
    buildSections,
    filterSections,
    findGroup,
    gluedFollowers,
    sheetExists,
    SORTS,
    whereIs as whereIsIn
  } from './listing'

  let library = $state<LibraryInfo | null>(null)
  let loading = $state(true)
  const nav = new GroupNav()
  // Sheet selection: any number of sheets; `cursor` is the one that arrow
  // keys move from, `anchor` the fixed end of a Shift-extended range.
  const sel = new SelectionState()
  // The sheets being edited: one, or a whole glued run. Set only once their text has loaded.
  const run = new SheetRun({
    readSheet: (path) => window.api.readSheet(path),
    pathsOf: runPaths,
    trust: (path, text) => guard.trust(path, text),
    pending: (path) => autosaver.pending(path)
  })
  let groupWords = $state<number | null>(null)
  let saveStatus = $state<SaveStatus>('saved')
  let notice = $state('')
  let info = $state('')
  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let focusEditor = $state(false)
  const ui = new ViewState((change) => window.api.setView(change))
  let treeEl = $state<HTMLElement>()
  let sheetsEl = $state<HTMLElement>()
  let editors = $state<Record<string, Editor | undefined>>({})

  const guard = createSaveGuard({
    read: (path) => window.api.readSheet(path),
    write: (path, content) => window.api.writeSheet(path, content)
  })
  /** Sheets with changes that are not on disk. Only ever non-empty for long when saving is manual. */
  let dirty = $state<string[]>([])
  const manual = (): boolean => prefs?.saveMode === 'manual'
  /** Saves what is outstanding, except in manual mode, where nothing is saved until asked. */
  async function settle(): Promise<void> {
    if (!manual()) await autosaver.flush()
  }
  const autosaver = createAutosaver({
    save: async (path, content) => {
      try {
        await guard.save(path, content)
        // The edit may have added or removed a picture's link.
        unused.check()
      } catch (e) {
        if (e instanceof SaveConflict) diskConflicts.raise(path, run.edits[path] ?? content, e.disk)
        throw e
      }
    },
    onStatus: (status) => (saveStatus = status),
    onUnsaved: (paths) => (dirty = paths),
    enabled: () => prefs?.saveMode === 'auto',
    journal: {
      put: (path, text) => window.api.journalPut(path, text),
      clear: (path) => window.api.journalClear(path)
    }
  })

  const recovery = new RecoveryFlow(window.api, {
    flush: () => autosaver.flush(),
    save: (path, text) => guard.save(path, text),
    showText: (path, text) => {
      run.edits[path] = text
      editors[path]?.replaceText(text)
    },
    trust: (path, text) => guard.trust(path, text),
    info: showInfo,
    fail: (e) => (notice = errorMessage(e))
  })

  /** A sheet that changed on disk while it had unsaved edits, waiting for the user's choice. */
  const diskConflicts = new DiskConflicts({
    trust: (path, text) => guard.trust(path, text),
    baseline: (path) => guard.baseline(path),
    change: (path, text) => autosaver.change(path, text),
    discard: (path) => autosaver.discard(path),
    showText: (path, text) => {
      run.edits[path] = text
      editors[path]?.replaceText(text)
    },
    editor: (path) => editors[path],
    readSheet: (path) => window.api.readSheet(path),
    info: showInfo
  })

  // Remember the open sheet, so the next launch can come back to it.
  $effect(() => {
    const only = sel.only
    if (only) void window.api.setLastSheet(only)
  })

  // Total for the selected group, recounted shortly after the tree or a save changes.
  let wordsRequest = 0
  $effect(() => {
    const path = nav.selectedGroup
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

  const group = $derived(library ? findGroup(library.tree, nav.selectedGroup) : undefined)
  let filter = $state('')
  let prefs = $state<Parameters<typeof applyView>[0] | null>(null)
  const sortBy = $derived(prefs?.sheetSort ?? 'manual')
  /** What the list shows: every sheet, or those whose title or preview contain the filter. */
  const parsedFilter = $derived(parseFilter(filter))
  /** True while the filter names keywords: the list then spans the whole library, not just the group. */
  const keywordMode = $derived(parsedFilter.keywords.length > 0)
  const knownKeywords = $derived(library ? libraryKeywords(library.tree) : [])
  /**
   * The sheets of the selected group, then those of each group inside it, in
   * tree order, each under the name of its group (relative to the selected one).
   * A keyword filter lists the whole library as one run instead.
   */
  const sections = $derived(buildSections(group, library?.tree, keywordMode, sortBy))
  /** Every sheet the list can show, before filtering. */
  const listed = $derived(sections.flatMap((x) => x.sheets))
  const shownSections = $derived(filterSections(sections, parsedFilter.text, parsedFilter.keywords))
  const shown = $derived(shownSections.flatMap((x) => x.sheets))
  /** The groups a sheet is in, for a card in a library-wide list. */
  function whereIs(path: string): string {
    return library ? whereIsIn(library.tree, path) : ''
  }

  const keywords = new KeywordEdit({
    sheets: () => (library ? librarySheets(library.tree) : []),
    selected: () => [...sel.paths],
    warn: (text) => (notice = text),
    runOp: (op) => runOp(op),
    change: (paths, add, remove) => window.api.changeKeywords(paths, add, remove)
  })
  /** The sheets in the order the list shows them, for keyboard and range selection. */
  const listPaths = $derived(shown.map((s) => s.path))
  // Sheets that follow a glued sheet, so a run can be drawn as one bar.
  const gluedFrom = $derived(gluedFollowers(sections))

  function labelOf(node: GroupNode | undefined): string | undefined {
    return node ? groupLabel(node) : undefined
  }
  function showLibrary(info: LibraryInfo): void {
    library = info
    nav.reset(info.tree.path)
    clearSheets()
    void recovery.check()
    unused.check()
  }

  // --- Unused pictures and sync conflict copies -------------------------------

  const unused = new UnusedImages(window.api, { hasLibrary: () => library !== null, info: showInfo })

  function allSheets(group: GroupNode): { name: string; path: string }[] {
    return group.children.flatMap((c) => (c.kind === 'group' ? allSheets(c) : [{ name: c.name, path: c.path }]))
  }
  const conflictPairs = $derived(library ? findConflictCopies(allSheets(library.tree)) : [])
  const conflicts = new ConflictFlow(window.api, {
    pairs: () => conflictPairs,
    flush: () => autosaver.flush(),
    writeText: async (path, text) => {
      await guard.save(path, text)
      run.edits[path] = text
      editors[path]?.replaceText(text)
    },
    trashCopy: (path) => runOp(() => window.api.deleteNodes([path])),
    info: showInfo,
    fail: (e) => (notice = errorMessage(e))
  })

  function clearSheets(): void {
    sel.clear()
    run.clear()
  }

  /** The sheet being typed in: the only one selected, else the first of the open run. */
  function activeEditor(): (typeof editors)[string] | undefined {
    const path = sel.only ?? run.open?.parts[0]?.path
    return path ? editors[path] : undefined
  }
  const editing = new EditorActions({
    editor: activeEditor,
    chooseImages: () => window.api.chooseImages(),
    info: (message) => showInfo(message)
  })

  let styleOpen = $state(false)
  let styleNow = $state<LineStyle>('body')
  function toggleStyleMenu(): void {
    if (!styleOpen) {
      styleNow = activeEditor()?.lineStyle() || 'body'
    }
    styleOpen = !styleOpen
  }
  function applyStyle(kind: FormatKind): void {
    styleOpen = false
    editing.format(kind)
  }
  /** `hint` is the digit after Cmd/Ctrl+Alt; `keys` is a whole shortcut, for the rest. */
  const STYLES: { kind: FormatKind; label: string; hint?: string; keys?: string }[][] = [
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
      { kind: 'highlight', label: 'Highlight' },
      { kind: 'code', label: 'Inline code' },
      { kind: 'codeblock', label: 'Code block' },
      { kind: 'comment', label: 'Comment', keys: '/' },
      { kind: 'rule', label: 'Horizontal rule' }
    ]
  ]


  const outlineEntries = $derived<Entry[]>(
    run.open
      ? run.open.parts.flatMap((part) =>
          extractHeadings(run.edits[part.path] ?? part.text).map((h) => ({ ...h, path: part.path }))
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



  let preferencesOpen = $state(false)

  let themes = $state<ColorTheme[]>([])
  const activeTheme = $derived(themes.find((t) => t.id === prefs?.colorTheme))
  $effect(() => {
    if (prefs) applyView(prefs, activeTheme)
  })

  function applyViewSettings(view: Parameters<typeof applyView>[0]): void {
    const turnedOn = view.saveMode === 'auto' && prefs !== null && prefs.saveMode !== 'auto'
    prefs = view
    // Text typed while autosave was off is saved as soon as it is turned back on.
    if (turnedOn) void autosaver.flush()
    ui.apply(view)
  }

  async function chooseLibrary(): Promise<void> {
    if (!(await resolveUnsaved(autosaver.unsavedPaths(), 'library'))) return
    await autosaver.flush()
    const info = await window.api.chooseLibrary()
    if (info) showLibrary(info)
  }

  /** The sheets that read as one with `path`: its glued run, or just itself. */
  function runPaths(path: string): string[] {
    return runOf(group?.children ?? [], path)
  }

  /** Brings a sheet's part of the open run into view. */
  async function scrollToPart(path: string): Promise<void> {
    await tick()
    document.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'start' })
  }

  // --- Tabs ----------------------------------------------------------------

  // Each tab holds a sheet; opening another sheet in the front tab replaces it. The
  // bar shows only when there are two or more.
  const tabs = new TabsState()

  $effect(() => {
    const only = sel.only
    if (!only) return
    untrack(() => tabs.follow(only, manual(), tabHasChanges))
  })

  // Sheets that were deleted or moved away take their tabs with them.
  $effect(() => {
    const tree = library?.tree
    if (!tree) return
    untrack(() => tabs.prune((p) => sheetExists(tree, p)))
  })

  const tabTitles = $derived(
    new Map((library ? listSheets(library.tree) : []).map((s) => [s.path, s.title || 'Untitled']))
  )

  /** The sheets that read as one with `path` in its own group (so a glued run is one tab). */
  function runFor(path: string): string[] {
    const folder = library ? findGroup(library.tree, path.slice(0, path.lastIndexOf('/'))) : undefined
    return folder ? runOf(folder.children, path) : [path]
  }

  /** Whether the tab's sheet, or any sheet glued to it, has text that is not saved. */
  function tabHasChanges(path: string): boolean {
    return runFor(path).some((p) => dirty.includes(p))
  }

  const sheetName = (path: string): string => tabTitles.get(path) ?? path.slice(path.lastIndexOf('/') + 1)

  /** Asks what to do with unsaved changes; resolves at once when saving is not manual or there are none. */
  const unsavedPrompt = new UnsavedPrompt()
  function askUnsaved(paths: string[], what: UnsavedWhat): Promise<UnsavedAnswer> {
    if (!manual() || paths.length === 0) return Promise.resolve('save')
    return unsavedPrompt.ask(paths.map(sheetName), what)
  }

  /** Settles the unsaved text of `paths`: saves it, or drops it. False when the user cancelled or a save failed. */
  async function resolveUnsaved(paths: string[], what: UnsavedWhat): Promise<boolean> {
    const unsaved = paths.filter((p) => dirty.includes(p))
    const answer = await askUnsaved(unsaved, what)
    if (answer === 'cancel') return false
    if (answer === 'discard') {
      for (const p of unsaved) autosaver.discard(p)
      return true
    }
    await autosaver.flush(unsaved.length > 0 ? unsaved : undefined)
    if (autosaver.unsavedPaths().some((p) => unsaved.includes(p))) {
      notice = 'Could not save, so nothing was closed.'
      return false
    }
    return true
  }

  const tabFlow = new TabFlow(tabs, {
    only: () => sel.only,
    reveal: (path) => revealSheet(path),
    runFor,
    resolveUnsaved,
    closeWindow: () => void window.api.closeWindow()
  })

  const tabDrag = new TabDrag(tabs, {
    hasChanges: tabHasChanges,
    sheetExists: (path) => (library ? sheetExists(library.tree, path) : false),
    show: tabFlow.show,
    close: tabFlow.close,
    newWindow: (path, at) => window.api.newWindow(path, at),
    windowSize: () => ({ width: window.innerWidth, height: window.innerHeight })
  })

  // --- Back and forward ---------------------------------------------------

  const trail = new Trail({
    exists: (path) => (library ? sheetExists(library.tree, path) : false),
    show: (path) => revealSheet(path, false)
  })

  const selection = new SelectionFlow(window.api, sel, run, {
    settle,
    visit: (path) => trail.visit(path),
    wantFocus: (focus) => (focusEditor = focus),
    focusEditor: (path) => editors[path]?.focus(),
    focusAt: (path, where) => editors[path]?.focusAt(where),
    scrollToPart,
    reveal: (path) => revealSheet(path, false),
    manual,
    hasUnsaved: () => autosaver.unsavedPaths().length > 0,
    apply: (result) => runOp(() => Promise.resolve(result)),
    listPaths: () => listPaths,
    keywordMode: () => keywordMode
  })
  const { setSelection, focusedPart, crossEdge, clickSheet } = selection

  const opRunner = new OpRunner(sel, run, {
    flush: () => autosaver.flush(),
    library: () => library,
    setLibrary: (info) => (library = info),
    remap: (change, tree) => {
      sel.remap(change)
      tabs.remap(change)
      nav.follow(tree, change)
    },
    notice: (text) => (notice = text)
  })
  const { runOp, refreshOpen } = opRunner

  function showInfo(text: string): void {
    info = text
    clearTimeout(infoTimer)
    infoTimer = setTimeout(() => (info = ''), 3000)
  }

  const ops = new NodeOps(window.api, sel, nav, {
    library: () => library,
    runOp,
    setSelection,
    selectGroup,
    clearSheets,
    treeFocused: () => treeEl?.contains(document.activeElement) ?? false,
    focusTree: async () => {
      await tick()
      treeEl?.focus()
    },
    cursor: () => {
      const part = run.open?.parts.find((p) => editors[p.path]?.cursorInfo())
      const where = part && editors[part.path]?.cursorInfo()
      return part && where ? { path: part.path, text: where.text, offset: where.offset } : undefined
    },
    info: showInfo,
    warn: (text) => (notice = text)
  })


  /** The right-click menu being shown, if any. */
  let contextMenu = $state<{ x: number; y: number; items: MenuItem[]; onpick: (item: MenuItem) => void } | null>(null)
  /** The menu for right-clicked text; spelling help arrives from the main process. */
  function textMenu(info: EditMenuInfo): void {
    contextMenu = {
      x: info.x,
      y: info.y,
      items: editMenuItems(info, isMac),
      onpick: (item) => {
        const value = item.value ?? ''
        if (item.action === 'replace-misspelling') void window.api.replaceMisspelling(value)
        else if (item.action === 'add-to-dictionary') void window.api.addToDictionary(value)
        else if (item.action === 'select-all') void window.api.editCommand('selectAll')
        else if (item.action) void window.api.editCommand(item.action as 'undo' | 'redo' | 'cut' | 'copy' | 'paste')
      }
    }
  }

  /** Right-click menu: act on what was clicked, selecting it first if it is not already. */
  async function nodeMenu(kind: 'sheet' | 'group' | 'root', path: string, at: { x: number; y: number }): Promise<void> {
    if (!library) return
    if (kind === 'sheet') {
      if (!sel.has(path)) await setSelection([path], path)
    } else if (nav.selectedGroup !== path) {
      selectGroup(path)
      await tick()
    }
    contextMenu = {
      ...at,
      items: nodeMenuItems(kind, ops.clip !== null, isMac),
      onpick: (item) => void nodeAction(kind, path, item.action)
    }
  }

  async function nodeAction(kind: 'sheet' | 'group' | 'root', path: string, action: string | undefined): Promise<void> {
    if (action === 'reveal') await window.api.revealPath(path)
    else if (action === 'copy-path') await window.api.copyPath(path)
    else if (action === 'new-sheet') await creation.newSheet()
    else if (action === 'new-group') await ops.newGroup(kind === 'root')
    else if (action === 'open-tab') await tabFlow.open(path)
    else if (action === 'open-window') await window.api.newWindow(path)
    else if (action === 'keywords') keywords.open()
    else if (action === 'rename') void ops.startRename(path)
    else if (action === 'duplicate' || action === 'copy' || action === 'cut' || action === 'paste') {
      if (kind === 'group') treeEl?.focus()
      await tick()
      if (action === 'duplicate') await ops.duplicate()
      else if (action === 'paste') await ops.paste()
      else ops.copy(action === 'cut')
    }
    else if (action === 'move') {
      if (kind === 'group') treeEl?.focus()
      else await tick()
      move.open()
    } else if (action === 'delete') {
      if (kind === 'group') treeEl?.focus()
      await tick()
      await ops.remove()
    }
  }

  /** Every sheet title, for wiki links. */
  const sheetTitles = $derived(library ? listSheets(library.tree).map((s) => s.title) : [])
  /** The sheets that link to the open one. */
  const backlinks = $derived(
    library && sel.paths.length === 1 ? backlinksTo(library.tree, sel.paths[0]!) : []
  )

  /** Opens the sheet a [[link]] names; a link to nothing creates that sheet beside the current one. */
  async function followWikiLink(target: string): Promise<void> {
    if (!library) return
    const path = resolveWikiLink(library.tree, target)
    if (path) {
      await revealSheet(path)
      return
    }
    await creation.forLink(target)
  }

  const creation = new SheetCreation(window.api, sel, {
    group: () => group,
    runOp: (op) => runOp(op),
    setSelection,
    selectCopies: (paths) => ops.selectCopies(paths),
    settle,
    flush: () => autosaver.flush(),
    currentText: () => {
      const path = sel.only ?? run.open?.parts[0]?.path
      return path ? editors[path]?.getText() : undefined
    },
    info: showInfo,
    warn: (text) => (notice = text)
  })

  /** A click on the empty page around the text (below the last line, beside the column) puts the cursor at the end. */
  function clickBelowText(e: MouseEvent): void {
    if (e.button !== 0 || !run.open) return
    const target = e.target as HTMLElement
    if (target.closest('.cm-editor, .seam, button, a, input')) return
    const box = e.currentTarget as HTMLElement
    // The scrollbar is part of this element; leave it alone.
    if (e.clientX > box.getBoundingClientRect().left + box.clientWidth) return
    const last = run.open.parts[run.open.parts.length - 1]
    if (!last) return
    e.preventDefault()
    editors[last.path]?.focusAt('end')
  }

  function edited(path: string, content: string): void {
    autosaver.change(path, content)
    run.edits[path] = content
    // Keep the sheet list's title and preview in step with what is typed.
    const sheet = listed.find((s) => s.path === path)
    if (sheet) {
      sheet.title = sheetTitle(content)
      sheet.preview = sheetPreview(content)
      sheet.links = linkTargets(content)
    }
  }

  async function selectGroup(path: string): Promise<void> {
    await settle()
    nav.selectedGroup = path
    filter = ''
    clearSheets()
    // Open the first sheet, so choosing a group rarely leaves the editor empty.
    const first = listed[0]
    if (first) {
      sel.anchor = first.path
      await setSelection([first.path], first.path, false)
    }
  }

  function toggle(path: string): void {
    nav.toggle(path)
  }

  // --- Changes made outside the app -----------------------------------------

  const externalHost: ExternalHost = {
    library: () => library,
    setLibrary: (info) => (library = info),
    openPaths: () => run.open?.parts.map((p) => p.path) ?? [],
    checkImages: () => unused.check(),
    keepGroup: (info) => nav.keep(info.tree, info.tree.path),
    clearSheets,
    refreshOpen: () => refreshOpen(false),
    checkConflicts: (paths) => diskConflicts.check(paths)
  }
  const externalChange = (info: LibraryInfo): Promise<void> => takeExternalChange(info, externalHost)

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

  let searchReturnFocus: HTMLElement | null = null
  let findBar = $state<FindBar>()

  /** The scopes the Find bar offers: the open sheet, the selected group, its project, the library. */
  const findScopes = $derived(
    library
      ? findScopeOptions(
          library.tree,
          nav.selectedGroup,
          sel.only && run.open ? { path: sel.only, title: tabTitles.get(sel.only) ?? 'this sheet' } : undefined
        )
      : []
  )

  const find = new FindFlow(window.api, {
    scopes: () => findScopes,
    selectedText: () => run.selectedText,
    only: () => sel.only,
    editor: (path) => editors[path],
    editors: () => Object.entries(editors).filter((e): e is [string, Editor] => e[1] !== undefined),
    openSheet: async (path) => {
      if (!library) return
      if (!listed.some((x) => x.path === path)) nav.reveal(path.slice(0, path.lastIndexOf('/')), library.tree.path)
      await setSelection([path], path, false)
    },
    focusBar: (seed, replace) => findBar?.focusQuery(seed, replace),
    tick,
    rememberFocus: () => {
      const was = document.activeElement as HTMLElement | null
      return () => was?.focus()
    },
    runOp: (op, reload) => runOp(op, reload),
    flush: () => autosaver.flush(),
    info: showInfo
  })

  /** Opens a sheet found by search: selects its group, expands the way to it, and shows it. */
  async function revealSheet(path: string, focus = true): Promise<void> {
    if (!library) return
    quickOpening = false
    await settle()
    const parent = path.slice(0, path.lastIndexOf('/'))
    nav.reveal(parent, library.tree.path)
    await setSelection([path], path, focus)
  }

  // --- Export ----------------------------------------------------------------

  const exporter = new ExportFlow(window.api, {
    fail: (e) => (notice = errorMessage(e)),
    info: showInfo,
    clearNotice: () => (notice = '')
  })

  /** Previews the HTML export of the selected sheets, or of the group when the tree has focus. */
  async function openExport(): Promise<void> {
    if (!library) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    await exporter.open(!inTree && sel.paths.length > 0 ? sel.paths : [nav.selectedGroup])
  }

  // --- Move to… ------------------------------------------------------------

  const move = new MoveFlow({
    tree: () => library?.tree,
    selectedGroup: () => nav.selectedGroup,
    groupLabel: () => labelOf(group),
    selectedSheets: () => [...sel.paths],
    treeFocused: () => treeEl?.contains(document.activeElement) ?? false,
    rememberFocus: () => {
      const was = document.activeElement as HTMLElement | null
      return () => was?.focus()
    },
    runOp: (op) => runOp(op),
    move: (paths, target) => window.api.move(paths, target),
    expand: (path) => (nav.expanded[path] = true),
    clearSheets,
    warn: (text) => (notice = text)
  })

  // --- Drag and drop -------------------------------------------------------

  const dnd = new DragDrop({
    tree: () => library?.tree,
    selectedGroup: () => nav.selectedGroup,
    manualOrder: () => sortBy === 'manual',
    listPaths: () => listPaths,
    isSelected: (path) => sel.has(path),
    selection: () => [...sel.paths], // a plain array: state proxies cannot cross the bridge
    selectOnly: (path) => void setSelection([path], path),
    move: (paths, parent, slot) => runOp(() => window.api.move(paths, parent, slot)),
    expand: (path) => (nav.expanded[path] = true),
    clearSheets
  })

  // --- Keyboard -----------------------------------------------------------

  function treeKeydown(e: KeyboardEvent): void {
    if (!library || ops.renaming) return
    const result = treeKey(e, visibleGroups(library.tree, nav.expanded), nav.selectedGroup, nav.expanded, () =>
      ops.clipboardKey(e)
    )
    if (result.handled) e.preventDefault()
    const action = result.action
    if (!action) return
    if (action.kind === 'select') void selectGroup(action.path)
    else if (action.kind === 'expand') nav.expanded[action.path] = action.open
    else if (action.kind === 'rename') void ops.startRename(action.path)
    else void runOp(() => window.api.move(action.paths, action.parent, action.slot))
  }

  function sheetsKeydown(e: KeyboardEvent): void {
    const result = sheetsKey(
      e,
      {
        listPaths,
        // a plain array: state proxies cannot cross the bridge
        selected: [...sel.paths],
        cursor: sel.cursor,
        anchor: sel.anchor,
        manual: sortBy === 'manual',
        siblings: (where) => {
          const parent = library ? findGroup(library.tree, where) : undefined
          return parent?.children.map((c) => c.path)
        }
      },
      () => ops.clipboardKey(e)
    )
    if (result.handled) e.preventDefault()
    const action = result.action
    if (!action) return
    if (action.kind === 'move') void runOp(() => window.api.move(action.paths, action.parent, action.slot))
    else if (action.kind === 'edit') {
      if (sel.paths[0]) editors[sel.paths[0]]?.focus()
    } else {
      if (action.anchor !== undefined) sel.anchor = action.anchor
      void setSelection(action.paths, action.cursor)
    }
  }

  function windowKeydown(e: KeyboardEvent): void {
    const action = windowKey(e, library !== null, sel.paths[0] !== undefined)
    if (!action) return
    if (action === 'back') void trail.step(-1)
    else if (action === 'forward') void trail.step(1)
    else if (action === 'focus-library') {
      if (ui.sidebarHidden) ui.sidebarPeek = true
      treeEl?.focus()
    } else if (action === 'focus-sheets') sheetsEl?.focus()
    else if (sel.paths[0]) editors[sel.paths[0]]?.focus()
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
    if (command === 'close-tab' && !library) void window.api.closeWindow()
    if (!library) return
    runMenuCommand(command, commandActions)
  }

  const commandActions: CommandActions = {
    newTab: tabFlow.newTab,
    closeTab: () => void tabFlow.close(),
    cycleTab: tabFlow.cycle,
    save: () => void autosaver.flush(manual() ? (run.open?.parts.map((p) => p.path) ?? []) : undefined),
    saveAll: () => void autosaver.flush(),
    toggleSidebar: ui.toggleSidebar,
    toggleSheets: ui.toggleSheets,
    newSheet: () => void creation.newSheet(),
    dailyNote: () => void creation.dailyNote(),
    saveTemplate: () => void creation.saveAsTemplate(),
    openTemplates: () => openPalette(),
    moveTo: move.open,
    exportHtml: () => void openExport(),
    search: find.search,
    findReplace: () => find.open('sheet', true),
    quickOpen: () => openQuick(),
    commandPalette: () => openPalette(),
    distractionFree: () => toggleZen(),
    preferences: () => (preferencesOpen = true),
    insertTable: editing.insertTable,
    insertFootnote: editing.insertFootnote,
    insertContents: editing.insertContents,
    insertImage: () => void editing.insertImage(),
    cleanImages: () => void unused.open(),
    resolveConflicts: () => conflicts.restart(),
    goToFootnote: editing.goToFootnote,
    toggleTask: editing.toggleTask,
    jumpHeading: editing.jumpHeading,
    copySheets: (cut) => ops.copy(cut),
    pasteSheets: () => void ops.paste(),
    importFiles: () => void creation.importFiles(),
    fold: (fold, all) => (all ? editing.foldAll(fold) : editing.foldHere(fold)),
    format: editing.format,
    remove: () => void ops.remove(),
    duplicate: () => void ops.duplicate(),
    split: () => void ops.split(),
    merge: () => void ops.merge(),
    glue: (glued) => void ops.glue(glued),
    editKeywords: keywords.open,
    undo: () => void ops.undo(),
    newGroup: (project) => void ops.newGroup(project)
  }

  function toggleZen(): void {
    if (ui.toggleZen()) {
      const only = sel.only ?? run.open?.parts[0]?.path
      if (only) editors[only]?.focus()
    }
  }

  // --- Command palette ---------------------------------------------------------

  let palette = $state(false)

  function openPalette(): void {
    searchReturnFocus = document.activeElement as HTMLElement | null
    palette = true
    void creation.loadTemplates()
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

  const paletteCommands = $derived.by(() =>
    buildPaletteCommands({
      keyMod,
      keyShift,
      styles: STYLES,
      sorts: SORTS,
      templates: creation.templates,
      unusedCount: unused.list.length,
      conflictCount: conflictPairs.length,
      zen: ui.zen,
      view: prefs,
      command: handleCommand,
      setView: (patch) => void window.api.setView(patch),
      newFromTemplate: (path) => void creation.fromTemplate(path),
      toggleOutline: ui.toggleOutline
    })
  )

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
        // A window opened for a sheet shows that; any other picks up where the last session ended.
        const wanted = (await window.api.initialSheet()) ?? (await window.api.getLastSheet())
        if (wanted && sheetExists(info.tree, wanted)) await revealSheet(wanted, false)
      })
      .finally(() => (loading = false))
    const unsubscribeOpened = window.api.onLibraryOpened(showLibrary)
    const unsubscribeChanged = window.api.onLibraryChanged((info) => void externalChange(info))
    const unsubscribeMenu = window.api.onMenuCommand(handleCommand)
    const unsubscribeText = window.api.onEditMenu(textMenu)
    // Last chance to save when the window closes.
    const saveOnClose = (): void => {
      if (!manual()) void autosaver.flush()
    }
    window.addEventListener('beforeunload', saveOnClose)
    // The main process holds the window open until this finishes.
    const unsubscribeFlush = window.api.onFlushRequest(() => {
      void (async () => {
        const waiting = autosaver.unsavedPaths()
        if (manual() && waiting.length > 0) {
          // Asking the user can take longer than the main process is willing to wait.
          window.api.holdClose()
          if (!(await resolveUnsaved(waiting, 'window'))) {
            window.api.closeCancelled()
            return
          }
        } else await autosaver.flush()
        window.api.flushed()
      })()
    })
    return () => {
      unsubscribeFlush()
      unsubscribeOpened()
      unsubscribeChanged()
      unsubscribeMenu()
      unsubscribeText()
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
  <Welcome loading />
{:else if !library}
  <Welcome onchoose={chooseLibrary} />
{:else}
  <div
    class="layout"
    class:collapsed={ui.zen}
    class:no-library={ui.sidebarHidden && !ui.zen}
    class:no-sheets={ui.sheetsCollapsed && !ui.zen}
    class:zen={ui.zen}
  >
    {#if ui.sidebarHidden}
      <div class="edge" role="presentation" onmouseenter={ui.peek}></div>
    {/if}
    <div
      class="sidebar"
      class:peek={ui.sidebarPeek}
      role="presentation"
      onmouseenter={ui.peek}
      onmouseleave={ui.unpeek}
    >
    <LibraryPane
      {library}
      selectedGroup={nav.selectedGroup}
      expanded={nav.expanded}
      renaming={ops.renaming}
      {notice}
      {info}
      conflictCount={conflictPairs.length}
      {keyMod}
      {keyShift}
      bind:el={treeEl}
      dnd={dnd.tree}
      onkeydown={treeKeydown}
      onmousedown={keepFocus(treeEl)}
      onfocusout={(e) => {
        const box = e.currentTarget.closest('.sidebar')
        if (ui.sidebarHidden && !box?.contains(e.relatedTarget as Node | null)) ui.sidebarPeek = false
      }}
      onnewgroup={() => void ops.newGroup(false)}
      onhide={ui.toggleSidebar}
      onselect={(path) => void selectGroup(path)}
      ontoggle={toggle}
      onstartrename={ops.startRename}
      oncommitrename={ops.commitRename}
      oncancelrename={ops.finishRename}
      oncolor={(path, color) => void runOp(() => window.api.setColor(path, color))}
      onnodemenu={(kind, path, at) => void nodeMenu(kind, path, at)}
      onconflicts={conflicts.restart}
    />

    <SheetsPane
      title={labelOf(group) ?? ''}
      {sortBy}
      {listed}
      {shown}
      {shownSections}
      {knownKeywords}
      {parsedFilter}
      {keywordMode}
      bind:filter
      bind:el={sheetsEl}
      {sel}
      {gluedFrom}
      sheetHint={dnd.sheetHint}
      {keyMod}
      {whereIs}
      onkeydown={sheetsKeydown}
      onmousedown={keepFocus(sheetsEl)}
      onpaneover={dnd.paneOver}
      onpanedrop={dnd.drop}
      onsheetdragstart={dnd.sheetStart}
      onsheetdragend={dnd.end}
      onsheetdragover={dnd.sheetOver}
      onsheetclick={clickSheet}
      onsheetmenu={(path, at) => void nodeMenu('sheet', path, at)}
      onnew={() => void creation.newSheet()}
      onsort={(value) => void window.api.setView({ sheetSort: value })}
    />

    </div>

    <section class="editor" aria-label="Editor" ondragover={tabDrag.over} ondrop={(e) => void tabDrag.drop(e)}>
      <EditorBar
        sidebarCollapsed={ui.sidebarCollapsed}
        sheetsCollapsed={ui.sheetsCollapsed}
        outlineOpen={ui.outlineOpen}
        canBack={trail.canBack}
        canForward={trail.canForward}
        finding={find.current !== null}
        hasSheet={run.open !== null}
        {styleOpen}
        {styleNow}
        styles={STYLES}
        showSave={!!run.open && (prefs?.saveIndicator !== false || saveStatus === 'error')}
        {saveStatus}
        auto={prefs?.saveMode === 'auto'}
        {keyMod}
        ontogglesidebar={ui.toggleSidebar}
        ontogglesheets={ui.toggleSheets}
        ontoggleoutline={ui.toggleOutline}
        onstep={(d) => void trail.step(d)}
        ontogglefind={find.toggle}
        onformat={editing.format}
        oninsertimage={() => void editing.insertImage()}
        onstylemenu={toggleStyleMenu}
        onstyleclose={() => (styleOpen = false)}
        onstyle={applyStyle}
        onexport={() => void openExport()}
      />
      <div class="above">
      {#if (tabs.list.length > 1 || (manual() && tabs.list.length > 0)) && !ui.zen}
        <TabBar
          paths={tabs.list}
          active={tabs.active}
          hint={tabs.hint}
          titles={tabTitles}
          {keyMod}
          hasChanges={tabHasChanges}
          onshow={(i) => void tabFlow.show(i)}
          onclose={tabFlow.close}
          onnew={tabFlow.newTab}
          ondragstart={tabDrag.start}
          ondragend={tabDrag.end}
        />
      {/if}
      {#if find.current && !ui.zen}
        {#key find.current.key}
          <FindBar
            bind:this={findBar}
            scopes={findScopes}
            scope={find.current.scope}
            initialQuery={find.current.query}
            showReplace={find.current.replace}
            host={find.bar}
            onclose={find.close}
            onscope={(v) => find.current && (find.current.scope = v)}
          />
        {/key}
      {/if}
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scroller" onmousedown={clickBelowText}>
      {#if run.error}
        <p class="hint">{run.error}</p>
      {:else if run.open}
        {#key run.open.parts.map((p) => p.path).join('\n')}
          <div class="run" class:focus-mode={ui.focusMode} class:typewriter={ui.typewriter}>
            {#each run.open.parts as part, i (part.path)}
              {#if i > 0}<hr class="seam" />{/if}
              <div class="part" data-path={part.path}>
                <Editor
                  bind:this={editors[part.path]}
                  text={part.text}
                  onchange={(content) => edited(part.path, content)}
                  onblur={() => {
                    if (prefs?.saveMode === 'auto') void autosaver.flush()
                  }}
                  onescape={() => (ui.zen ? toggleZen() : sheetsEl?.focus())}
                  onfocus={() => focusedPart(part.path)}
                  onedge={run.open.parts.length > 1 ? (d) => crossEdge(part.path, d) : undefined}
                  onselection={(text) => (run.selectedText = text)}
                  onsection={(heading) => (currentSection = { path: part.path, heading })}
                  onfind={(action) => (action === 'next' || action === 'previous' ? findBar?.next(action === 'next' ? 1 : -1) : find.open(undefined, action === 'replace'))}
                  focusMode={ui.focusMode}
                  typewriter={ui.typewriter}
                  lineNumbers={ui.lineNumbers}
                  smartTypography={prefs?.smartTypography}
                  hideMarkers={prefs?.hideMarkers}
                  focusScope={prefs?.focusScope}
                  typewriterAt={prefs?.typewriterPosition}
                  foldKey={part.path}
                  autofocus={focusEditor && part.path === sel.paths[0]}
                  titles={sheetTitles}
                  onwiki={(target) => void followWikiLink(target)}
                />
              </div>
            {/each}
          </div>
        {/key}
      {:else if sel.paths.length > 1}
        <p class="placeholder">{sel.paths.length} Sheets Selected</p>
      {:else}
        <p class="placeholder">No Sheet Selected</p>
      {/if}
      </div>
      {#if run.open}
        <StatusBar text={run.text} selected={run.selectedText} {groupWords} />
      {/if}
      {#if ui.outlineOpen && !ui.zen}
        <div class="outline-slot"><Outline entries={outlineEntries} current={currentEntry} onpick={goToHeading} {backlinks} onbacklink={(p) => void revealSheet(p)} /></div>
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

{#if palette}
  <CommandPalette commands={paletteCommands} onrun={runPaletteCommand} oncancel={closePalette} />
{/if}

{#if unsavedPrompt.current}
  <UnsavedDialog
    names={unsavedPrompt.current.names}
    what={unsavedPrompt.current.what}
    onsave={() => unsavedPrompt.answer('save')}
    ondiscard={() => unsavedPrompt.answer('discard')}
    oncancel={() => unsavedPrompt.answer('cancel')}
  />
{/if}

{#if recovery.current && !diskConflicts.current}
  {@const entry = recovery.current}
  <RecoveryDialog
    name={entry.path.slice(entry.path.lastIndexOf('/') + 1)}
    recovered={entry.text}
    disk={entry.disk}
    savedAt={entry.savedAt}
    missing={entry.missing === true}
    position={recovery.total - recovery.pending.length + 1}
    total={recovery.total}
    onrestore={() => void recovery.finish(true)}
    ondiscard={() => void recovery.finish(false)}
  />
{/if}

{#if contextMenu}
  {@const menu = contextMenu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={menu.items}
    onchoose={(item) => {
      contextMenu = null
      menu.onpick(item)
    }}
    onclose={() => (contextMenu = null)}
  />
{/if}

{#if keywords.current}
  <KeywordsDialog
    sheets={keywords.current}
    known={knownKeywords}
    onapply={(add, remove) => void keywords.apply(add, remove)}
    oncancel={keywords.close}
  />
{/if}

{#if unused.cleaning}
  <CleanUpImages images={unused.cleaning} onclean={(names) => void unused.clean(names)} oncancel={unused.close} />
{/if}

{#if diskConflicts.current}
  {@const clash = diskConflicts.current}
  <ConflictDialog
    name={clash.path.slice(clash.path.lastIndexOf('/') + 1)}
    mine={clash.mine}
    disk={clash.disk}
    onkeep={diskConflicts.keepMine}
    onuse={diskConflicts.useDisk}
    onmerge={diskConflicts.useMerged}
  />
{/if}

{#if conflicts.resolving}
  <ConflictCopyDialog
    original={conflicts.resolving.original}
    copy={conflicts.resolving.copy}
    position={conflicts.skipped.length + 1}
    total={conflicts.skipped.length + conflicts.remaining.length}
    onresolve={(text) => void conflicts.resolve(text)}
    onskip={conflicts.skip}
    oncancel={conflicts.cancel}
  />
{/if}

{#if quickOpening && library}
  <QuickOpen items={listSheets(library.tree)} onpick={revealSheet} oncancel={closeQuick} />
{/if}

{#if exporter.preview}
  <ExportPreview
    title={exporter.preview.title}
    html={exporter.preview.html}
    sheets={exporter.preview.sheets}
    imageBytes={exporter.preview.imageBytes}
    saving={exporter.saving}
    onsave={exporter.save}
    onsavepdf={exporter.savePdf}
    onsavemarkdown={exporter.saveMarkdown}
    onsavedocx={exporter.saveDocx}
    onsaveepub={exporter.saveEpub}
    onclose={exporter.close}
  />
{/if}

{#if move.current}
  <MovePicker
    heading={move.current.heading}
    targets={move.current.targets}
    onpick={move.pick}
    oncancel={move.close}
  />
{/if}

<style>
  .layout {
    height: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
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
  .layout.no-sheets :global(.sheets) {
    display: none;
  }
  .layout.no-sheets .sidebar {
    grid-template-columns: 240px;
  }
  .layout.no-library .sidebar {
    grid-template-columns: 300px;
  }
  .layout.no-library.no-sheets .sidebar {
    grid-template-columns: 0;
  }
  /* Only the library hidden: it floats over the editor until it is peeked at. */
  .layout.no-library :global(.library) {
    position: fixed;
    inset: 0 auto 0 0;
    width: 240px;
    z-index: 30;
    transform: translateX(-101%);
    transition: transform 140ms ease-out;
  }
  .layout.no-library .sidebar.peek :global(.library) {
    transform: none;
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
  }
  /* The sheet list is pushed along to the right, so the library sits beside it. */
  .layout.no-library :global(.sheets) {
    position: relative;
    z-index: 29;
    transition: transform 140ms ease-out;
  }
  .layout.no-library .sidebar.peek :global(.sheets) {
    transform: translateX(240px);
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
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
  .layout.collapsed .sidebar:has(:global(:focus-visible)) {
    transform: none;
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
  }
  .edge {
    position: fixed;
    inset: 0 auto 0 0;
    width: 6px;
    z-index: 29;
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
    grid-template-rows: var(--topbar-height) auto minmax(0, 1fr);
    overflow: hidden;
  }
  /* Distraction-free: the tool row floats over the top edge and appears on hover. */
  .layout.zen .editor {
    grid-template-rows: 0 0 minmax(0, 1fr);
  }
  .layout.zen .scroller {
    padding-top: 2.5rem;
  }
  .layout.zen :global(.editor-bar) {
    position: absolute;
    inset: 0 0 auto 0;
    height: var(--topbar-height);
    z-index: 5;
    background: var(--bg);
    opacity: 0;
    transition: opacity 160ms;
  }
  .layout.zen :global(.editor-bar):hover,
  .layout.zen :global(.editor-bar):focus-within {
    opacity: 1;
  }
  .layout.zen :global(.pill) {
    opacity: 0;
    transition: opacity 160ms;
  }
  .layout.zen :global(.pill:hover) {
    opacity: 1;
  }
  :global(.scrim) {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  :global(.style-menu) {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 6px;
    z-index: 21;
    min-width: 200px;
    padding: 5px;
    border-radius: var(--radius-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-popover);
  }
  :global(.style-menu hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 2px;
  }
  :global(.style-menu button) {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    width: 100%;
    padding: 5px 9px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: default;
  }
  :global(.style-menu button:hover) {
    background: var(--hover);
  }
  :global(.style-menu button.current) {
    color: var(--accent);
    font-weight: 600;
  }
  :global(.style-menu kbd) {
    font: inherit;
    font-size: 12px;
    color: var(--muted);
  }
  .above {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
  }
  .scroller {
    grid-column: 1;
    grid-row: 3;
    position: relative;
    overflow-y: auto;
  }
  .outline-slot {
    grid-column: 2;
    grid-row: 1 / span 3;
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
