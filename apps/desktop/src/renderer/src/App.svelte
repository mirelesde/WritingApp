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
    type SearchOptions,
    allSheets as librarySheets,
    libraryKeywords,
    parseFilter
  } from '@writingapp/core'
  import type { EditMenuInfo, LibraryInfo, MenuCommand, OpResult } from '../../preload/api'
  import { applyView } from './view'
  import { ViewState } from './viewState.svelte'
  import { RecoveryFlow } from './recoveryFlow.svelte'
  import { sheetsKey, treeKey, windowKey } from './keyActions'
  import { DragDrop } from './dragDrop.svelte'
  import { NodeOps } from './nodeOps.svelte'
  import { TabDrag } from './tabDrag'
  import { UnsavedPrompt, type UnsavedAnswer, type UnsavedWhat } from './unsavedPrompt.svelte'
  import { TabsState } from './tabsState.svelte'
  import { SelectionState } from './selectionState.svelte'
  import { GroupNav } from './groupNav.svelte'
  import { ExportFlow } from './exportFlow.svelte'
  import { UnusedImages } from './unusedImages.svelte'
  import { buildPaletteCommands } from './paletteCommands'
  import { findScopeOptions, replacedMessage, seedQuery, startScope } from './findScopes'
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
  import LibraryPane from './LibraryPane.svelte'
  import Welcome from './Welcome.svelte'
  import MovePicker from './MovePicker.svelte'
  import FindBar, { type FindHost, type FindScope } from './FindBar.svelte'
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
    moveTargets,
    pathRange,
    remapPath,
    runOf,
    visibleGroups,
    type MoveTarget
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
  let open = $state<{ parts: { path: string; text: string }[] } | null>(null)
  let error = $state('')
  // Text typed since a run was loaded, by path; the status bar counts from it.
  let edits = $state<Record<string, string>>({})
  let selectedText = $state('')
  let groupWords = $state<number | null>(null)
  let readId = 0
  let saveStatus = $state<SaveStatus>('saved')
  let notice = $state('')
  let info = $state('')
  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let focusEditor = $state(false)
  const ui = new ViewState((change) => window.api.setView(change))
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
        if (e instanceof SaveConflict) raiseConflict(path, edits[path] ?? content, e.disk)
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
      edits[path] = text
      editors[path]?.replaceText(text)
    },
    trust: (path, text) => guard.trust(path, text),
    info: showInfo,
    fail: (e) => (notice = errorMessage(e))
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

  function useMerged(text: string): void {
    if (!conflict) return
    const { path, disk } = conflict
    conflict = null
    guard.trust(path, disk)
    edits[path] = text
    editors[path]?.replaceText(text)
    autosaver.change(path, text)
    showInfo('Combined the two versions')
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

  // Keywords dialog: edits the selected sheets.
  let keywordEdit = $state<{ path: string; title: string; keywords: string[] }[] | null>(null)
  function openKeywords(): void {
    if (!library) return
    const wanted = new Set(sel.paths)
    const chosen = librarySheets(library.tree).filter((s) => wanted.has(s.path))
    if (chosen.length === 0) {
      notice = 'Select a sheet first.'
      return
    }
    keywordEdit = chosen.map((s) => ({ path: s.path, title: s.title, keywords: [...s.keywords] }))
  }
  async function applyKeywords(add: string[], remove: string[]): Promise<void> {
    const paths = keywordEdit?.map((s) => s.path) ?? []
    keywordEdit = null
    await runOp(() => window.api.changeKeywords(paths, add, remove))
  }
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
      edits[path] = text
      editors[path]?.replaceText(text)
    },
    trashCopy: (path) => runOp(() => window.api.deleteNodes([path])),
    info: showInfo,
    fail: (e) => (notice = errorMessage(e))
  })

  function clearSheets(): void {
    sel.clear()
    open = null
    error = ''
    readId++
  }

  /** Collapsed, the sidebar slides in while the pointer is at the left edge or over it. */


  /** Applies bold, italic or link to the sheet being typed in (the last one focused in a run). */
  function formatActive(kind: 'bold' | 'italic' | 'link' | FormatKind): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.format(kind)
  }

  function insertTable(): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.insertTableAtCursor()
  }

  function insertFootnote(): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.insertFootnoteAtCursor()
  }

  function activeEditor(): (typeof editors)[string] | undefined {
    const path = sel.only ?? open?.parts[0]?.path
    return path ? editors[path] : undefined
  }

  function insertContents(): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.insertContentsAtCursor()
  }

  async function insertImage(): Promise<void> {
    const path = sel.only ?? open?.parts[0]?.path
    if (!path || !editors[path]) return
    const markdown = await window.api.chooseImages()
    editors[path]?.insertImagesAtCursor(markdown)
  }

  async function importFiles(): Promise<void> {
    const parent = group
    if (!parent) return
    const at = parent.children.findIndex((c) => c.path === sel.cursor)
    const result = await runOp(() => window.api.importFiles(parent.path, at >= 0 ? at + 1 : undefined))
    if (result?.copied?.length) await ops.selectCopies(result.copied)
    const done = result?.copied?.length ?? 0
    const bad = result?.skipped ?? []
    if (bad.length > 0) {
      const names = bad.slice(0, 3).join(', ') + (bad.length > 3 ? ` and ${bad.length - 3} more` : '')
      notice = `${done > 0 ? `Imported ${done}. ` : ''}Could not import ${names}.`
    } else if (done > 0) {
      showInfo(`Imported ${done === 1 ? '1 sheet' : `${done} sheets`}.`)
    }
  }

  function foldHere(fold: boolean): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.foldSectionAtCursor(fold)
  }

  function foldAll(fold: boolean): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path) editors[path]?.foldSections(fold)
  }

  function goToFootnote(): void {
    const path = sel.only ?? open?.parts[0]?.path
    if (path && !editors[path]?.goToFootnoteAtCursor()) showInfo('This sheet has no footnotes.')
  }

  let styleOpen = $state(false)
  let styleNow = $state<LineStyle>('body')
  function toggleStyleMenu(): void {
    if (!styleOpen) {
      const path = sel.only ?? open?.parts[0]?.path
      styleNow = (path && editors[path]?.lineStyle()) || 'body'
    }
    styleOpen = !styleOpen
  }
  function applyStyle(kind: FormatKind): void {
    styleOpen = false
    formatActive(kind)
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
      // Text waiting to be saved (manual mode) is shown instead of the file's.
      const shown = paths.map((p, i) => autosaver.pending(p) ?? texts[i]!)
      open = { parts: paths.map((p, i) => ({ path: p, text: shown[i]! })) }
      edits = Object.fromEntries(paths.flatMap((p, i) => (shown[i] !== texts[i] ? [[p, shown[i]!]] : [])))
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

  async function showTab(index: number): Promise<void> {
    const path = tabs.select(index)
    if (path === undefined) return
    await revealSheet(path)
  }

  /** Opens `path` in a tab after the front one, or switches to the tab that already has it. */
  async function openInTab(path: string | undefined, reuse = true): Promise<void> {
    if (!path) return
    await showTab(tabs.open(path, reuse))
  }

  function newTab(): void {
    void openInTab(sel.only ?? tabs.front, false)
  }

  async function closeTab(index = tabs.active): Promise<void> {
    if (tabs.list.length <= 1) {
      // The window asks about unsaved changes itself when it closes.
      void window.api.closeWindow()
      return
    }
    const closing = tabs.list[index]
    if (closing !== undefined && !(await resolveUnsaved(runFor(closing), 'tab'))) return
    if (tabs.list[index] !== closing) return
    if (tabs.remove(index)) void showTab(tabs.active)
  }

  const tabDrag = new TabDrag(tabs, {
    hasChanges: tabHasChanges,
    sheetExists: (path) => (library ? sheetExists(library.tree, path) : false),
    show: showTab,
    close: closeTab,
    newWindow: (path, at) => window.api.newWindow(path, at),
    windowSize: () => ({ width: window.innerWidth, height: window.innerHeight })
  })

  function cycleTab(delta: number): void {
    const to = tabs.cycleTarget(delta)
    if (to !== undefined) void showTab(to)
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
    await settle()
    const left = sel.paths.filter((p) => !paths.includes(p))
    sel.paths = paths
    sel.cursor = to
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
    // Renaming is a change to the library, which saves what is open first. In manual
    // mode nothing is saved unasked, so renames wait until nothing has unsaved text.
    if (left.length > 0 && !(manual() && autosaver.unsavedPaths().length > 0)) void renameToMatchTitles(left)
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
    if (sel.only === path) return
    sel.selectOnly(path)
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
    if (keywordMode && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      sel.anchor = path
      return revealSheet(path, false)
    }
    if (e.shiftKey && sel.anchor) return setSelection(pathRange(listPaths, sel.anchor, path), path)
    sel.anchor = path
    if (e.metaKey || e.ctrlKey) {
      const next = sel.has(path)
        ? sel.paths.filter((p) => p !== path)
        : [...sel.paths, path]
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
      sel.remap(remap)
      tabs.remap(remap)
      nav.follow(result.library.tree, remap)
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
    sel.prune((p) => sheetExists(tree, p))
    if (sel.paths.length !== 1) {
      if (open) {
        open = null
        readId++
      }
      return
    }
    if (force || !runIsOpen(sel.paths[0]!)) await loadRun(sel.paths[0]!)
  }

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
      const part = open?.parts.find((p) => editors[p.path]?.cursorInfo())
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
    else if (action === 'new-sheet') await newSheet()
    else if (action === 'new-group') await ops.newGroup(kind === 'root')
    else if (action === 'open-tab') await openInTab(path)
    else if (action === 'open-window') await window.api.newWindow(path)
    else if (action === 'keywords') openKeywords()
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
      openMoveTo()
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
    await settle()
    const parent = group
    if (!parent) return
    await autosaver.flush()
    const at = parent.children.findIndex((c) => c.path === sel.cursor)
    const result = await runOp(() =>
      window.api.createSheet(parent.path, at >= 0 ? at + 1 : undefined)
    )
    if (!result?.created) return
    await window.api.writeSheet(result.created, `# ${target.trim()}\n\n`)
    await setSelection([result.created], result.created, true)
  }

  async function newSheet(): Promise<void> {
    const parent = group
    if (!parent) return
    const at = parent.children.findIndex((c) => c.path === sel.cursor)
    const result = await runOp(() =>
      window.api.createSheet(parent.path, at >= 0 ? at + 1 : undefined)
    )
    if (result?.created) {
      sel.anchor = result.created
      await setSelection([result.created], result.created, true)
    }
  }

  let templates = $state<{ name: string; path: string }[]>([])

  async function newFromTemplate(template: string): Promise<void> {
    const parent = group
    if (!parent) return
    const at = parent.children.findIndex((c) => c.path === sel.cursor)
    const result = await runOp(() =>
      window.api.newFromTemplate(parent.path, template, at >= 0 ? at + 1 : undefined)
    )
    if (result?.created) {
      sel.anchor = result.created
      await setSelection([result.created], result.created, true)
    }
  }

  async function openDailyNote(): Promise<void> {
    const parent = group
    if (!parent) return
    const result = await runOp(() => window.api.dailyNote(parent.path))
    if (result?.created) {
      sel.anchor = result.created
      await setSelection([result.created], result.created, true)
    }
  }

  async function saveAsTemplate(): Promise<void> {
    const path = sel.only ?? open?.parts[0]?.path
    const text = path ? editors[path]?.getText() : undefined
    if (text === undefined) return
    await window.api.saveTemplate(text)
    templates = await window.api.listTemplates()
    showInfo('Saved as a template')
  }

  /** A click on the empty page around the text (below the last line, beside the column) puts the cursor at the end. */
  function clickBelowText(e: MouseEvent): void {
    if (e.button !== 0 || !open) return
    const target = e.target as HTMLElement
    if (target.closest('.cm-editor, .seam, button, a, input')) return
    const box = e.currentTarget as HTMLElement
    // The scrollbar is part of this element; leave it alone.
    if (e.clientX > box.getBoundingClientRect().left + box.clientWidth) return
    const last = open.parts[open.parts.length - 1]
    if (!last) return
    e.preventDefault()
    editors[last.path]?.focusAt('end')
  }

  function edited(path: string, content: string): void {
    autosaver.change(path, content)
    edits[path] = content
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

  /** Takes in a change to the library folder made by something else: a sync client, a file manager. */
  async function externalChange(info: LibraryInfo): Promise<void> {
    if (!library || info.path !== library.path) return
    if (JSON.stringify(info.tree) === JSON.stringify(library.tree) && !open) return
    if (JSON.stringify(info.tree) !== JSON.stringify(library.tree)) {
      library = info
      unused.check()
      if (nav.keep(info.tree, info.tree.path)) {
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

  let finding = $state<{ scope: FindScope; replace: boolean; query: string; key: number } | null>(null)
  let findBar = $state<FindBar>()
  let searchReturnFocus: HTMLElement | null = null
  let findKey = 0

  /** The scopes the Find bar offers: the open sheet, the selected group, its project, the library. */
  const findScopes = $derived(
    library
      ? findScopeOptions(
          library.tree,
          nav.selectedGroup,
          sel.only && open ? { path: sel.only, title: tabTitles.get(sel.only) ?? 'this sheet' } : undefined
        )
      : []
  )

  /** Opens the Find bar. Without a scope it starts as narrow as makes sense. */
  function openFind(scope?: FindScope, replace = false): void {
    if (finding) {
      const wanted = scope && findScopes.some((s) => s.value === scope) ? scope : undefined
      if (wanted) finding.scope = wanted
      findBar?.focusQuery(seedQuery(selectedText), replace)
      return
    }
    searchReturnFocus = document.activeElement as HTMLElement | null
    finding = { scope: startScope(scope, findScopes), replace, query: seedQuery(selectedText) ?? '', key: ++findKey }
  }

  function closeFind(): void {
    finding = null
    for (const e of Object.values(editors)) e?.clearMarks()
    const path = sel.only
    if (path && editors[path]) editors[path]!.focus()
    else searchReturnFocus?.focus()
  }

  /** The editor of a sheet, once it has opened. */
  async function editorFor(path: string): Promise<Editor | undefined> {
    for (let i = 0; i < 20 && !editors[path]; i++) await tick()
    return editors[path]
  }

  const findHost: FindHost = {
    sheet() {
      const path = sel.only
      const editor = path ? editors[path] : undefined
      if (!path || !editor) return null
      return { path, text: editor.getText(), cursor: editor.cursorOffset() }
    },
    async reveal(path, from, to) {
      if (!library) return
      if (!(sel.paths.length === 1 && sel.paths[0] === path && editors[path])) {
        if (listed.some((x) => x.path === path)) await setSelection([path], path, false)
        else {
          const parent = path.slice(0, path.lastIndexOf('/'))
          nav.reveal(parent, library.tree.path)
          await setSelection([path], path, false)
        }
      }
      ;(await editorFor(path))?.selectRange(from, to)
    },
    mark(path, query, options) {
      for (const [p, e] of Object.entries(editors)) {
        if (p === path) e?.markMatches(query, options)
        else e?.clearMarks()
      }
    },
    unmark() {
      for (const e of Object.values(editors)) e?.clearMarks()
    },
    replaceHere(path, changes) {
      editors[path]?.replaceRanges(changes)
    },
    async replaceAll(query, replacement, within, options) {
      return replaceFound(query, replacement, undefined, { ...options, ...(within ? { within } : {}) })
    },
    flush: () => autosaver.flush()
  }

  /** Replaces in the library (or one sheet) for the Find bar; returns how many were changed. */
  async function replaceFound(
    query: string,
    replacement: string,
    path: string | undefined,
    options: SearchOptions
  ): Promise<number> {
    const result = await runOp(
      () => window.api.replaceAll(query, replacement, path ? [path] : undefined, options),
      true
    )
    if (result?.replaced) showInfo(replacedMessage(result.replaced))
    return result?.replaced ?? 0
  }

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
      if (nav.selectedGroup === root.path) return
      paths = moving = [nav.selectedGroup]
      from = nav.selectedGroup.slice(0, nav.selectedGroup.lastIndexOf('/'))
      heading = `Move “${labelOf(group) ?? 'group'}” to…`
    } else {
      paths = [...sel.paths]
      if (paths.length === 0) return
      moving = []
      from = nav.selectedGroup
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
    nav.expanded[target] = true
    if (movedSheets) clearSheets()
  }

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
    if (action === 'back') void step(-1)
    else if (action === 'forward') void step(1)
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
    if (command === 'new-tab') newTab()
    else if (command === 'close-tab') closeTab()
    else if (command === 'next-tab') cycleTab(1)
    else if (command === 'previous-tab') cycleTab(-1)
    else if (command === 'save') void autosaver.flush(manual() ? (open?.parts.map((p) => p.path) ?? []) : undefined)
    else if (command === 'save-all') void autosaver.flush()
    else if (command === 'toggle-sidebar') ui.toggleSidebar()
    else if (command === 'toggle-sheets') ui.toggleSheets()
    else if (command === 'new-sheet') void newSheet()
    else if (command === 'daily-note') void openDailyNote()
    else if (command === 'save-template') void saveAsTemplate()
    else if (command === 'new-from-template') openPalette()
    else if (command === 'move-to') openMoveTo()
    else if (command === 'export-html') void openExport()
    else if (command === 'search') openFind(findScopes.some((x) => x.value === 'group') ? 'group' : undefined)
    else if (command === 'quick-open') openQuick()
    else if (command === 'command-palette') openPalette()
    else if (command === 'distraction-free') toggleZen()
    else if (command === 'preferences') preferencesOpen = true
    else if (command === 'insert-table') insertTable()
    else if (command === 'insert-footnote') insertFootnote()
    else if (command === 'insert-contents') insertContents()
    else if (command === 'insert-image') void insertImage()
    else if (command === 'clean-images') void unused.open()
    else if (command === 'resolve-conflicts') conflicts.restart()
    else if (command === 'go-to-footnote') goToFootnote()
    else if (command === 'toggle-task') {
      if (!activeEditor()?.toggleTaskAtCursor()) showInfo('Put the cursor on a task item (- [ ]) first.')
    }
    else if (command === 'previous-heading') activeEditor()?.jumpHeading('previous')
    else if (command === 'next-heading') activeEditor()?.jumpHeading('next')
    else if (command === 'find-replace') openFind('sheet', true)
    else if (command === 'copy-sheets') ops.copy(false)
    else if (command === 'cut-sheets') ops.copy(true)
    else if (command === 'paste-sheets') void ops.paste()
    else if (command === 'import') void importFiles()
    else if (command === 'fold-section') foldHere(true)
    else if (command === 'unfold-section') foldHere(false)
    else if (command === 'fold-all') foldAll(true)
    else if (command === 'unfold-all') foldAll(false)
    else if (command.startsWith('format-')) formatActive(command.slice(7) as FormatKind)
    else if (command === 'delete') void ops.remove()
    else if (command === 'duplicate') void ops.duplicate()
    else if (command === 'split') void ops.split()
    else if (command === 'merge') void ops.merge()
    else if (command === 'glue') void ops.glue(true)
    else if (command === 'edit-keywords') openKeywords()
    else if (command === 'unglue') void ops.glue(false)
    else if (command === 'undo-sheet-change') void ops.undo()
    else void ops.newGroup(command === 'new-project')
  }

  function toggleZen(): void {
    if (ui.toggleZen()) {
      const only = sel.only ?? open?.parts[0]?.path
      if (only) editors[only]?.focus()
    }
  }

  // --- Command palette ---------------------------------------------------------

  let palette = $state(false)

  function openPalette(): void {
    searchReturnFocus = document.activeElement as HTMLElement | null
    palette = true
    void window.api.listTemplates().then((found) => (templates = found))
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
      templates,
      unusedCount: unused.list.length,
      conflictCount: conflictPairs.length,
      zen: ui.zen,
      view: prefs,
      command: handleCommand,
      setView: (patch) => void window.api.setView(patch),
      newFromTemplate: (path) => void newFromTemplate(path),
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
      onnew={() => void newSheet()}
      onsort={(value) => void window.api.setView({ sheetSort: value })}
    />

    </div>

    <section class="editor" aria-label="Editor" ondragover={tabDrag.over} ondrop={(e) => void tabDrag.drop(e)}>
      <EditorBar
        sidebarCollapsed={ui.sidebarCollapsed}
        sheetsCollapsed={ui.sheetsCollapsed}
        outlineOpen={ui.outlineOpen}
        {canBack}
        {canForward}
        finding={finding !== null}
        hasSheet={open !== null}
        {styleOpen}
        {styleNow}
        styles={STYLES}
        showSave={!!open && (prefs?.saveIndicator !== false || saveStatus === 'error')}
        {saveStatus}
        auto={prefs?.saveMode === 'auto'}
        {keyMod}
        ontogglesidebar={ui.toggleSidebar}
        ontogglesheets={ui.toggleSheets}
        ontoggleoutline={ui.toggleOutline}
        onstep={(d) => void step(d)}
        ontogglefind={() => (finding ? closeFind() : openFind())}
        onformat={formatActive}
        oninsertimage={() => void insertImage()}
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
          onshow={(i) => void showTab(i)}
          onclose={closeTab}
          onnew={newTab}
          ondragstart={tabDrag.start}
          ondragend={tabDrag.end}
        />
      {/if}
      {#if finding && !ui.zen}
        {#key finding.key}
          <FindBar
            bind:this={findBar}
            scopes={findScopes}
            scope={finding.scope}
            initialQuery={finding.query}
            showReplace={finding.replace}
            host={findHost}
            onclose={closeFind}
            onscope={(v) => finding && (finding.scope = v)}
          />
        {/key}
      {/if}
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scroller" onmousedown={clickBelowText}>
      {#if error}
        <p class="hint">{error}</p>
      {:else if open}
        {#key open.parts.map((p) => p.path).join('\n')}
          <div class="run" class:focus-mode={ui.focusMode} class:typewriter={ui.typewriter}>
            {#each open.parts as part, i (part.path)}
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
                  onedge={open.parts.length > 1 ? (d) => crossEdge(part.path, d) : undefined}
                  onselection={(text) => (selectedText = text)}
                  onsection={(heading) => (currentSection = { path: part.path, heading })}
                  onfind={(action) => (action === 'next' || action === 'previous' ? findBar?.next(action === 'next' ? 1 : -1) : openFind(undefined, action === 'replace'))}
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
      {#if open}
        <StatusBar text={runText} selected={selectedText} {groupWords} />
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

{#if recovery.current && !conflict}
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

{#if keywordEdit}
  <KeywordsDialog
    sheets={keywordEdit}
    known={knownKeywords}
    onapply={(add, remove) => void applyKeywords(add, remove)}
    oncancel={() => (keywordEdit = null)}
  />
{/if}

{#if unused.cleaning}
  <CleanUpImages images={unused.cleaning} onclean={(names) => void unused.clean(names)} oncancel={unused.close} />
{/if}

{#if conflict}
  <ConflictDialog
    name={conflict.path.slice(conflict.path.lastIndexOf('/') + 1)}
    mine={conflict.mine}
    disk={conflict.disk}
    onkeep={keepMine}
    onuse={useDisk}
    onmerge={useMerged}
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

{#if picker}
  <MovePicker
    heading={picker.heading}
    targets={picker.targets}
    onpick={pickTarget}
    oncancel={closePicker}
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
