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
    type SheetNode,
    type SheetSort,
    allSheets as librarySheets,
    libraryKeywords,
    parseFilter
  } from '@writingapp/core'
  import type { EditMenuInfo, LibraryInfo, MenuCommand, OpResult, RecoveredSheet } from '../../preload/api'
  import { applyView } from './view'
  import { ViewState } from './viewState.svelte'
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
  import GroupTree from './GroupTree.svelte'
  import MovePicker from './MovePicker.svelte'
  import FindBar, { type FindHost, type FindScope } from './FindBar.svelte'
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
    commonParent,
    listKeyTarget,
    type DropZone,
    type MoveTarget,
    type TreeDnd
  } from './organise'
  import {
    buildSections,
    filterSections,
    findGroup,
    gluedFollowers,
    sheetExists,
    toggleKeywordInFilter,
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
  let renaming = $state<string | null>(null)
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

  // Unsaved text left by a crash, offered back one sheet at a time.
  let recovery = $state<RecoveredSheet[]>([])
  let recoveryTotal = $state(0)

  async function checkRecovery(): Promise<void> {
    try {
      recovery = await window.api.journalPending()
      recoveryTotal = recovery.length
    } catch {
      recovery = []
    }
  }

  async function finishRecovery(restore: boolean): Promise<void> {
    const entry = recovery[0]
    if (!entry) return
    if (restore && entry.missing) {
      try {
        const made = await window.api.recreateSheet(entry.path, entry.text)
        guard.trust(made, entry.text)
        showInfo(`Restored the text as “${made.slice(made.lastIndexOf('/') + 1)}”`)
      } catch (e) {
        notice = errorMessage(e)
        return
      }
    } else if (restore) {
      try {
        await autosaver.flush()
        await guard.save(entry.path, entry.text)
      } catch (e) {
        notice = errorMessage(e)
        return
      }
      edits[entry.path] = entry.text
      editors[entry.path]?.replaceText(entry.text)
      showInfo('Restored the recovered text')
    }
    void window.api.journalClear(entry.path)
    recovery = recovery.slice(1)
  }

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
  let keywordPicker = $state(false)
  /** Adds or removes `#keyword` in the filter box. */
  function toggleFilterKeyword(keyword: string): void {
    filter = toggleKeywordInFilter(filter, keyword)
    keywordPicker = false
  }
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
    void checkRecovery()
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
    if (result?.copied?.length) await selectCopies(result.copied)
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
  let unsavedAsk = $state<{
    names: string[]
    what: 'tab' | 'window' | 'library'
    resolve: (answer: 'save' | 'discard' | 'cancel') => void
  } | null>(null)

  function askUnsaved(paths: string[], what: 'tab' | 'window' | 'library'): Promise<'save' | 'discard' | 'cancel'> {
    if (!manual() || paths.length === 0) return Promise.resolve('save')
    return new Promise((resolve) => {
      unsavedAsk = {
        names: paths.map(sheetName),
        what,
        resolve: (answer) => {
          unsavedAsk = null
          resolve(answer)
        }
      }
    })
  }

  /** Settles the unsaved text of `paths`: saves it, or drops it. False when the user cancelled or a save failed. */
  async function resolveUnsaved(paths: string[], what: 'tab' | 'window' | 'library'): Promise<boolean> {
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

  const TAB_MIME = 'application/x-writingapp-tab'
  /** Set on a drag whose tab has unsaved changes: only this window can take it, since the text lives here. */
  const DIRTY_MIME = 'application/x-writingapp-unsaved'
  function tabDragStart(i: number, e: DragEvent): void {
    if (!e.dataTransfer) return
    e.dataTransfer.setData(TAB_MIME, tabs.list[i] ?? '')
    if (tabHasChanges(tabs.list[i] ?? '')) e.dataTransfer.setData(DIRTY_MIME, '1')
    e.dataTransfer.effectAllowed = 'move'
    tabs.startDrag(i)
  }

  /** Where in the bar a drag at this point would land: before or after the tab under it. */
  function tabSlot(e: DragEvent): number {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')
    if (!tab) return tabs.list.length
    const box = tab.getBoundingClientRect()
    return Number(tab.dataset.tab) + (e.clientX > box.left + box.width / 2 ? 1 : 0)
  }

  function tabDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes(TAB_MIME)) return
    if (e.dataTransfer.types.includes(DIRTY_MIME) && tabs.dragFrom === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    tabs.hint = tabSlot(e)
  }

  async function tabDrop(e: DragEvent): Promise<void> {
    const path = e.dataTransfer?.getData(TAB_MIME)
    if (!path) return
    e.preventDefault()
    const at = tabSlot(e)
    tabs.hint = null
    tabs.dropped = true
    if (tabs.dragFrom !== null) {
      // Reordered within this window; the front tab stays in front.
      tabs.reorder(tabs.dragFrom, at)
    } else if (library && sheetExists(library.tree, path)) {
      // Brought over from another window, which closes its copy.
      tabs.insert(at, path)
      await showTab(at)
    }
  }

  function tabDragEnd(e: DragEvent): void {
    const from = tabs.endDrag()
    if (from === null) return
    const outside =
      e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight
    const path = tabs.list[from]
    if (e.dataTransfer?.dropEffect === 'move') {
      // Another window took it.
      closeTab(from)
    } else if (outside && path && tabs.list.length > 1 && !tabHasChanges(path)) {
      // Dropped on the desktop: it becomes a window of its own.
      void window.api.newWindow(path, { x: e.screenX, y: e.screenY })
      closeTab(from)
    }
  }

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
      sel.anchor = result.created
      await setSelection([result.created], result.created, true)
    }
  }

  async function mergeSelected(): Promise<void> {
    if (sel.paths.length < 2) {
      notice = 'Select two or more sheets to merge.'
      return
    }
    const chosen = [...sel.paths]
    const result = await runOp(() => window.api.merge(chosen), true)
    if (result?.created) {
      sel.anchor = result.created
      await setSelection([result.created], result.created)
    }
  }

  async function glueSelected(glue: boolean): Promise<void> {
    if (sel.paths.length === 0) {
      notice = 'Select a sheet first.'
      return
    }
    const chosen = [...sel.paths]
    await runOp(() => (glue ? window.api.glue(chosen) : window.api.unglue(chosen)))
  }

  /** Moves the selected sheets, or the selected group when the tree has focus, to the trash. */
  async function deleteSelected(): Promise<void> {
    if (!library) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    let paths: string[]
    let fallback = nav.selectedGroup
    if (inTree || sel.paths.length === 0) {
      if (nav.selectedGroup === library.tree.path) {
        notice = 'Select a sheet or group to delete first.'
        return
      }
      paths = [nav.selectedGroup]
      fallback = nav.selectedGroup.slice(0, nav.selectedGroup.lastIndexOf('/'))
    } else paths = [...sel.paths] // a plain array: state proxies cannot cross the bridge
    const result = await runOp(() => window.api.deleteNodes(paths))
    if (!result) return
    nav.keep(result.library.tree, fallback)
    showInfo('Moved to the trash. Undo with Cmd/Ctrl+Alt+Z.')
  }

  // --- Duplicate, copy, cut and paste --------------------------------------

  /** What Cut or Copy last took: sheets or groups, waiting for Paste. */
  let nodeClip = $state<{ paths: string[]; cut: boolean } | null>(null)

  /** What these commands act on: the selected sheets, or the selected group when the tree has focus. */
  function nodeTargets(): string[] {
    if (!library) return []
    const inTree = treeEl?.contains(document.activeElement) ?? false
    if (inTree || sel.paths.length === 0) {
      return nav.selectedGroup === library.tree.path ? [] : [nav.selectedGroup]
    }
    return [...sel.paths] // a plain array: state proxies cannot cross the bridge
  }

  const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

  /** Selects what a copy or move produced: the new sheets, or the new group. */
  async function selectCopies(paths: string[]): Promise<void> {
    if (!library || paths.length === 0) return
    if (paths.every((p) => sheetExists(library!.tree, p))) {
      sel.anchor = paths[0]!
      await setSelection(paths, paths[0]!, false)
    } else if (findGroup(library.tree, paths[0]!)) {
      selectGroup(paths[0]!)
    }
  }

  async function duplicateSelected(): Promise<void> {
    const targets = nodeTargets()
    const first = targets[0]
    if (!library || !first) {
      notice = 'Select a sheet or group to duplicate first.'
      return
    }
    const parent = findGroup(library.tree, dirOf(first))
    const after = Math.max(...targets.map((p) => parent?.children.findIndex((c) => c.path === p) ?? -1))
    const result = await runOp(() =>
      window.api.copy(targets, dirOf(first), after >= 0 ? after + 1 : undefined, 'Duplicate')
    )
    if (result?.copied) await selectCopies(result.copied)
  }

  function copySelected(cut: boolean): void {
    const targets = nodeTargets()
    if (targets.length === 0) {
      notice = `Select a sheet or group to ${cut ? 'cut' : 'copy'} first.`
      return
    }
    nodeClip = { paths: targets, cut }
    showInfo(`${cut ? 'Cut' : 'Copied'} ${targets.length === 1 ? '1 item' : `${targets.length} items`}. Paste with Cmd/Ctrl+V.`)
  }

  async function pasteNodes(): Promise<void> {
    const clip = nodeClip
    const parent = group
    if (!library || !clip || !parent) return
    const inTree = treeEl?.contains(document.activeElement) ?? false
    const at = inTree ? -1 : parent.children.findIndex((c) => c.path === sel.cursor)
    const index = at >= 0 ? at + 1 : undefined
    const paths = [...clip.paths]
    if (clip.cut) {
      const result = await runOp(() => window.api.move(paths, parent.path, index))
      if (!result) return
      nodeClip = null
      await selectCopies(paths.map((p) => remapPath(p, result.moved)))
    } else {
      const result = await runOp(() => window.api.copy(paths, parent.path, index, 'Paste'))
      if (result?.copied) await selectCopies(result.copied)
    }
  }

  /** Cmd/Ctrl+C, X, V and D in the sheet list and the tree. Returns whether the key was used. */
  function nodeClipboardKey(e: KeyboardEvent): boolean {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false
    if ((e.target as HTMLElement).closest('input, textarea')) return false
    const key = e.key.toLowerCase()
    if (key === 'c') copySelected(false)
    else if (key === 'x') copySelected(true)
    else if (key === 'v') void pasteNodes()
    else if (key === 'd') void duplicateSelected()
    else return false
    e.preventDefault()
    return true
  }

  async function undoSheetChange(): Promise<void> {
    const result = await runOp(() => window.api.undo(), true)
    if (result?.label) showInfo(`Undid ${result.label.toLowerCase()}`)
  }

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
      items: nodeMenuItems(kind, nodeClip !== null, isMac),
      onpick: (item) => void nodeAction(kind, path, item.action)
    }
  }

  async function nodeAction(kind: 'sheet' | 'group' | 'root', path: string, action: string | undefined): Promise<void> {
    if (action === 'reveal') await window.api.revealPath(path)
    else if (action === 'copy-path') await window.api.copyPath(path)
    else if (action === 'new-sheet') await newSheet()
    else if (action === 'new-group') await newGroup(kind === 'root')
    else if (action === 'open-tab') await openInTab(path)
    else if (action === 'open-window') await window.api.newWindow(path)
    else if (action === 'keywords') openKeywords()
    else if (action === 'rename') void startRename(path)
    else if (action === 'duplicate' || action === 'copy' || action === 'cut' || action === 'paste') {
      if (kind === 'group') treeEl?.focus()
      await tick()
      if (action === 'duplicate') await duplicateSelected()
      else if (action === 'paste') await pasteNodes()
      else copySelected(action === 'cut')
    }
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

  async function newGroup(inRoot: boolean): Promise<void> {
    if (!library) return
    const parent = inRoot ? library.tree.path : nav.selectedGroup
    const result = await runOp(() =>
      window.api.createGroup(parent, inRoot ? 'Untitled Project' : undefined)
    )
    if (!result?.created) return
    nav.expand(parent)
    nav.selectedGroup = result.created
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
    const current = library ? labelOf(findGroup(library.tree, path)) : undefined
    if (trimmed === '' || trimmed === (current ?? path.slice(path.lastIndexOf('/') + 1))) return
    await runOp(() => window.api.renameGroup(path, trimmed))
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
    const chosen = sel.has(path) ? [...sel.paths] : [path]
    if (!sel.has(path)) void setSelection([path], path)
    const paths = listPaths.filter((p) => chosen.includes(p))
    // Sheets from one group can be put in a new order; a mixed selection can only be moved to another group.
    const parents = new Set(paths.map((p) => p.slice(0, p.lastIndexOf('/'))))
    drag = { kind: 'sheets', paths, parent: parents.size === 1 ? [...parents][0]! : '' }
    e.dataTransfer?.setData('text/plain', drag.paths.join('\n'))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function sheetsPaneDragOver(e: DragEvent): void {
    // A sorted list has no saved order to rearrange; sheets can still be dragged to a group.
    if (sortBy !== 'manual') return
    if (drag?.kind !== 'sheets' || drag.parent !== nav.selectedGroup) return
    e.preventDefault()
    sheetHint = 'end'
  }

  function sheetDragOver(path: string, e: DragEvent): void {
    if (sortBy !== 'manual') return
    if (drag?.kind !== 'sheets' || drag.parent === '' || path.slice(0, path.lastIndexOf('/')) !== drag.parent || drag.paths.includes(path))
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
    const parent = dragged ? findGroup(library?.tree ?? ({} as GroupNode), dragged.parent) : undefined
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
          nav.expanded[path] = true
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
    const flat = visibleGroups(library.tree, nav.expanded)
    const i = flat.findIndex((v) => v.group.path === nav.selectedGroup)
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
    if (nodeClipboardKey(e)) return
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
        if (subgroups && !nav.expanded[current.group.path]) nav.expanded[current.group.path] = true
        else go(flat[i + 1]?.parent === current.group ? flat[i + 1] : undefined)
        break
      case 'ArrowLeft':
        if (subgroups && nav.expanded[current.group.path]) nav.expanded[current.group.path] = false
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
      // As with dragging: a sorted list has no saved order to change, and sheets from
      // different groups can only be moved to another group, not reordered.
      const chosen = [...sel.paths] // a plain array: state proxies cannot cross the bridge
      const where = commonParent(chosen)
      const parent = where !== undefined && library ? findGroup(library.tree, where) : undefined
      if (!parent || sortBy !== 'manual') return
      const slot = moveSlot(
        parent.children.map((c) => c.path),
        listPaths.filter((p) => commonParent([p]) === where),
        chosen,
        e.key === 'ArrowUp' ? -1 : 1
      )
      if (slot !== undefined) void runOp(() => window.api.move(chosen, parent.path, slot))
      return
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      void setSelection([...listPaths], sel.cursor ?? listPaths[0] ?? null)
      return
    }
    if (nodeClipboardKey(e)) return
    if (mod || e.altKey) return

    const at = sel.cursor ? listPaths.indexOf(sel.cursor) : -1
    if (e.key === 'Enter') {
      e.preventDefault()
      if (sel.paths[0]) editors[sel.paths[0]]?.focus()
      return
    }
    const target = listKeyTarget(e.key, at, listPaths.length)
    if (target === undefined) return
    e.preventDefault()
    const path = listPaths[target]
    if (path === undefined) return
    if (e.shiftKey && sel.anchor) {
      void setSelection(pathRange(listPaths, sel.anchor, path), path)
    } else {
      sel.anchor = path
      void setSelection([path], path)
    }
  }

  function windowKeydown(e: KeyboardEvent): void {
    // Cmd/Ctrl+1, 2, 3 jump between the panes; Cmd/Ctrl+[ and ] go back and forward.
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !library) return
    if (e.key === '[') void step(-1)
    else if (e.key === ']') void step(1)
    else if (e.key === '1') {
      if (ui.sidebarHidden) ui.sidebarPeek = true
      treeEl?.focus()
    }
    else if (e.key === '2') sheetsEl?.focus()
    else if (e.key === '3' && sel.paths[0]) editors[sel.paths[0]]?.focus()
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
    else if (command === 'copy-sheets') copySelected(false)
    else if (command === 'cut-sheets') copySelected(true)
    else if (command === 'paste-sheets') void pasteNodes()
    else if (command === 'import') void importFiles()
    else if (command === 'fold-section') foldHere(true)
    else if (command === 'unfold-section') foldHere(false)
    else if (command === 'fold-all') foldAll(true)
    else if (command === 'unfold-all') foldAll(false)
    else if (command.startsWith('format-')) formatActive(command.slice(7) as FormatKind)
    else if (command === 'delete') void deleteSelected()
    else if (command === 'duplicate') void duplicateSelected()
    else if (command === 'split') void splitAtCursor()
    else if (command === 'merge') void mergeSelected()
    else if (command === 'glue') void glueSelected(true)
    else if (command === 'edit-keywords') openKeywords()
    else if (command === 'unglue') void glueSelected(false)
    else if (command === 'undo-sheet-change') void undoSheetChange()
    else void newGroup(command === 'new-project')
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
    <div
      class="pane library"
      role="tree"
      aria-label="Library"
      tabindex="0"
      bind:this={treeEl}
      onfocusout={(e) => {
        const box = e.currentTarget.closest('.sidebar')
        if (ui.sidebarHidden && !box?.contains(e.relatedTarget as Node | null)) ui.sidebarPeek = false
      }}
      onkeydown={treeKeydown}
      onmousedown={keepFocus(treeEl)}
    >
      <header class="library-bar">
        <span class="tools">
          <ToolButton icon="new-group" label="New group" hint="{keyMod}{keyShift}N" onclick={() => void newGroup(false)} />
          <ToolButton icon="sidebar" label="Hide sidebar" hint={keyMod + "\\"} onclick={ui.toggleSidebar} />
        </span>
      </header>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="project"
        class:selected={nav.selectedGroup === library.tree.path}
        oncontextmenu={(e) => {
          e.preventDefault()
          if (library) void nodeMenu('root', library.tree.path, { x: e.clientX, y: e.clientY })
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
          selected={nav.selectedGroup}
          expanded={nav.expanded}
          {renaming}
          onselect={selectGroup}
          ontoggle={toggle}
          onstartrename={startRename}
          oncommitrename={commitRename}
          oncancelrename={finishRename}
          oncolor={(path, color) => void runOp(() => window.api.setColor(path, color))}
          oncontext={(path, at) => void nodeMenu(path === library?.tree.path ? 'root' : 'group', path, at)}
          dnd={treeDnd}
        />
      </ul>
      {#if conflictPairs.length > 0}
        <button class="conflict-banner" onclick={conflicts.restart}>
          {conflictPairs.length} sync conflict{conflictPairs.length === 1 ? '' : 's'} — compare and resolve
        </button>
      {/if}
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
        <span class="title">{labelOf(group) ?? ''}</span>
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
                sheetsEl?.focus()
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
                ondragstart={(e) => !keywordMode && sheetDragStart(sheet.path, e)}
                ondragend={endDrag}
                ondragover={(e) => sheetDragOver(sheet.path, e)}
                onclick={(e) => clickSheet(sheet.path, e)}
                oncontextmenu={(e) => {
                  e.preventDefault()
                  void nodeMenu('sheet', sheet.path, { x: e.clientX, y: e.clientY })
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

    </div>

    <section class="editor" aria-label="Editor" ondragover={tabDragOver} ondrop={(e) => void tabDrop(e)}>
      <div class="editor-bar" role="toolbar" aria-label="Editor tools">
        <span class="tools">
          {#if ui.sidebarCollapsed}
            <ToolButton icon="sidebar" label="Show sidebar" hint={keyMod + "\\"} onclick={ui.toggleSidebar} />
          {/if}
          <ToolButton
            icon={ui.sheetsCollapsed ? 'shrink' : 'expand'}
            label={ui.sheetsCollapsed ? 'Show sheet list' : 'Hide sheet list'}
            onclick={ui.toggleSheets}
          />
          <ToolButton icon="back" label="Back" hint="{keyMod}[" disabled={!canBack} onclick={() => void step(-1)} />
          <ToolButton icon="forward" label="Forward" hint="{keyMod}]" disabled={!canForward} onclick={() => void step(1)} />
          <ToolButton icon="search" label="Find" hint="{keyMod}F" pressed={finding !== null} onclick={() => (finding ? closeFind() : openFind())} />
        </span>
        <span class="tools">
          <ToolButton icon="bold" label="Bold" hint="{keyMod}B" disabled={open === null} onclick={() => formatActive('bold')} />
          <ToolButton icon="italic" label="Italic" hint="{keyMod}I" disabled={open === null} onclick={() => formatActive('italic')} />
          <ToolButton icon="link" label="Link" hint="{keyMod}K" disabled={open === null} onclick={() => formatActive('link')} />
          <ToolButton icon="image" label="Insert image" hint="{keyMod}⌥I" disabled={open === null} onclick={() => void insertImage()} />
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
                      {#if item.hint}<kbd>{keyMod}⌥{item.hint}</kbd>{:else if item.keys}<kbd>{keyMod}{item.keys}</kbd>{/if}
                    </button>
                  {/each}
                {/each}
              </div>
            {/if}
          </span>
        </span>
        <span class="tools right">
          {#if open && (prefs?.saveIndicator !== false || saveStatus === 'error')}<SaveIndicator status={saveStatus} auto={prefs?.saveMode === 'auto'} />{/if}
          <ToolButton icon="outline" label="{ui.outlineOpen ? 'Hide' : 'Show'} outline" hint="{keyMod}⌥O" pressed={ui.outlineOpen} onclick={ui.toggleOutline} />
          <ToolButton icon="export" label="Export" hint="{keyMod}E" onclick={() => void openExport()} />
        </span>
      </div>
      <div class="above">
      {#if (tabs.list.length > 1 || (manual() && tabs.list.length > 0)) && !ui.zen}
        <div class="tabs" role="tablist" aria-label="Open sheets">
          {#each tabs.list as path, i (i)}
            <div
              class="tab"
              class:active={i === tabs.active}
              class:before={tabs.hint === i}
              class:after={tabs.hint === tabs.list.length && i === tabs.list.length - 1}
              data-tab={i}
              draggable="true"
              role="presentation"
              ondragstart={(e) => tabDragStart(i, e)}
              ondragend={tabDragEnd}
            >
              <button
                class="tab-label"
                role="tab"
                aria-selected={i === tabs.active}
                title={tabTitles.get(path) ?? path}
                onclick={() => void showTab(i)}
                onauxclick={(e) => {
                  if (e.button === 1) closeTab(i)
                }}
              >
                {#if tabHasChanges(path)}<span class="tab-dot" role="img" aria-label="Unsaved changes"></span>{/if}
                {tabTitles.get(path) ?? 'Untitled'}
              </button>
              <button class="tab-close" aria-label="Close tab" onclick={() => closeTab(i)}>×</button>
            </div>
          {/each}
          <button class="tab-new" aria-label="New tab" title="New tab ({keyMod}T)" onclick={newTab}>+</button>
        </div>
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

{#if unsavedAsk}
  <UnsavedDialog
    names={unsavedAsk.names}
    what={unsavedAsk.what}
    onsave={() => unsavedAsk?.resolve('save')}
    ondiscard={() => unsavedAsk?.resolve('discard')}
    oncancel={() => unsavedAsk?.resolve('cancel')}
  />
{/if}

{#if recovery[0] && !conflict}
  <RecoveryDialog
    name={recovery[0].path.slice(recovery[0].path.lastIndexOf('/') + 1)}
    recovered={recovery[0].text}
    disk={recovery[0].disk}
    savedAt={recovery[0].savedAt}
    missing={recovery[0].missing === true}
    position={recoveryTotal - recovery.length + 1}
    total={recoveryTotal}
    onrestore={() => void finishRecovery(true)}
    ondiscard={() => void finishRecovery(false)}
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
    color: var(--on-accent);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    padding: 5px 12px;
    cursor: default;
  }
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
  .layout.no-sheets .sheets {
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
  .layout.no-library .library {
    position: fixed;
    inset: 0 auto 0 0;
    width: 240px;
    z-index: 30;
    transform: translateX(-101%);
    transition: transform 140ms ease-out;
  }
  .layout.no-library .sidebar.peek .library {
    transform: none;
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.25);
  }
  /* The sheet list is pushed along to the right, so the library sits beside it. */
  .layout.no-library .sheets {
    position: relative;
    z-index: 29;
    transition: transform 140ms ease-out;
  }
  .layout.no-library .sidebar.peek .sheets {
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
  /* The group's name lines up with the sheet titles below it. */
  .sheets header {
    padding-left: 21px;
  }
  header.library-bar {
    justify-content: flex-end;
  }
  /* The library's name, big and bold above its projects. */
  .project {
    padding: 4px 14px 10px 34px;
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
  .kw-button.active {
    color: var(--accent);
    border-color: var(--accent);
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
  .info {
    margin: 0;
    padding: 8px 14px;
    color: var(--muted);
    font-size: 12px;
  }
  .conflict-banner {
    margin: 6px 10px;
    padding: 6px 10px;
    font: inherit;
    font-size: 12px;
    text-align: left;
    border: 1px solid var(--accent);
    border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text);
  }
  .notice {
    margin: 0;
    padding: 8px 14px;
    color: var(--danger);
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
    border-radius: var(--radius-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-popover);
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
    border-radius: var(--radius-sm);
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
  .above {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 10px 4px;
    overflow-x: auto;
    user-select: none;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: flex;
    align-items: center;
    flex: 0 1 180px;
    min-width: 90px;
    border-radius: 6px;
    color: var(--muted);
  }
  .tab {
    position: relative;
  }
  .tab.before::before,
  .tab.after::after {
    content: '';
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
  }
  .tab.before::before {
    left: -2px;
  }
  .tab.after::after {
    right: -2px;
  }
  .tab-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: 1px;
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    background: var(--hover);
    color: var(--text);
  }
  .tab button,
  .tabs .tab-new {
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: default;
  }
  .tab-label {
    flex: 1;
    min-width: 0;
    padding: 4px 4px 4px 10px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-close {
    padding: 2px 7px;
    border-radius: 5px;
    opacity: 0;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 0.7;
  }
  .tab-close:hover {
    opacity: 1;
    background: var(--border);
  }
  .tabs .tab-new {
    flex-shrink: 0;
    padding: 2px 9px;
    border-radius: 6px;
    color: var(--muted);
  }
  .tabs .tab-new:hover {
    background: var(--hover);
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
