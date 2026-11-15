import {
  libraryKeywords,
  linkTargets,
  parseFilter,
  sheetPreview,
  sheetTitle,
  type GroupNode,
  type SheetNode,
  type SheetSort
} from '@writingapp/core'
import type { LibraryInfo } from '../../preload/api'
import { buildSections, filterSections, gluedFollowers, whereIs } from './listing'

/** What the list needs from the rest of the app. */
export interface SheetListHost {
  library(): LibraryInfo | null
  /** The group the list is for. */
  group(): GroupNode | undefined
  sortBy(): SheetSort
}

/** The sheets list: what it shows for the selected group and the filter typed above it. */
export class SheetList {
  /** The text typed in the filter box. */
  filter = $state('')

  constructor(private readonly host: SheetListHost) {}

  parsedFilter = $derived(parseFilter(this.filter))
  /** True while the filter names keywords: the list then spans the whole library, not just the group. */
  keywordMode = $derived(this.parsedFilter.keywords.length > 0)
  knownKeywords = $derived.by(() => {
    const library = this.host.library()
    return library ? libraryKeywords(library.tree) : []
  })
  /**
   * The sheets of the selected group, then those of each group inside it, in
   * tree order, each under the name of its group (relative to the selected one).
   * A keyword filter lists the whole library as one run instead.
   */
  sections = $derived.by(() =>
    buildSections(this.host.group(), this.host.library()?.tree, this.keywordMode, this.host.sortBy())
  )
  /** Every sheet the list can show, before filtering. */
  listed = $derived(this.sections.flatMap((x) => x.sheets))
  shownSections = $derived(filterSections(this.sections, this.parsedFilter.text, this.parsedFilter.keywords))
  /** What the list shows: every sheet, or those that match the filter. */
  shown = $derived(this.shownSections.flatMap((x) => x.sheets))
  /** The sheets in the order the list shows them, for keyboard and range selection. */
  paths = $derived(this.shown.map((s) => s.path))
  /** Sheets that follow a glued sheet, so a run can be drawn as one bar. */
  gluedFrom = $derived(gluedFollowers(this.sections))

  /** The groups a sheet is in, for a card in a library-wide list. */
  whereIs = (path: string): string => {
    const library = this.host.library()
    return library ? whereIs(library.tree, path) : ''
  }

  /** Whether the list can show this sheet. */
  has = (path: string): boolean => this.listed.some((s) => s.path === path)

  /** Keeps a card's title, preview and links in step with what is typed. */
  edited = (path: string, content: string): void => {
    const sheet: SheetNode | undefined = this.listed.find((s) => s.path === path)
    if (!sheet) return
    sheet.title = sheetTitle(content)
    sheet.preview = sheetPreview(content)
    sheet.links = linkTargets(content)
  }
}
