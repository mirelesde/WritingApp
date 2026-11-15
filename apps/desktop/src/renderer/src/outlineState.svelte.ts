import { backlinksTo, extractHeadings } from '@writingapp/core'
import type { LibraryInfo } from '../../preload/api'
import type { Entry } from './Outline.svelte'

/** What the outline needs from the rest of the app. */
export interface OutlineHost {
  /** The sheets of the open run, with the text they were loaded with; undefined when none is open. */
  parts(): { path: string; text: string }[] | undefined
  /** Text typed into a sheet since it was loaded. */
  edited(path: string): string | undefined
  library(): LibraryInfo | null
  /** The paths of the selected sheets. */
  selected(): string[]
  /** Moves the cursor of a sheet's editor to an offset. */
  goTo(path: string, offset: number): void
}

/** The outline of the open sheets: their headings, the one the cursor is under, and what links to them. */
export class OutlineState {
  /** Which section the cursor is in: its part of the run and the heading index within it. */
  section = $state<{ path: string; heading: number } | null>(null)

  constructor(private readonly host: OutlineHost) {}

  /** Every heading of the open sheets, with what has been typed since loading. */
  entries = $derived.by<Entry[]>(() =>
    (this.host.parts() ?? []).flatMap((part) =>
      extractHeadings(this.host.edited(part.path) ?? part.text).map((h) => ({ ...h, path: part.path }))
    )
  )

  /** The heading the cursor is under, if any. */
  current = $derived.by<Entry | null>(() => {
    const section = this.section
    if (!section) return null
    return this.entries.filter((e) => e.path === section.path)[section.heading] ?? null
  })

  /** The sheets that link to the open one. */
  backlinks = $derived.by(() => {
    const library = this.host.library()
    const selected = this.host.selected()
    return library && selected.length === 1 ? backlinksTo(library.tree, selected[0]!) : []
  })

  /** The cursor moved into a section of one of the open sheets. */
  moved = (path: string, heading: number): void => {
    this.section = { path, heading }
  }

  goTo = (entry: Entry): void => this.host.goTo(entry.path, entry.offset)
}
