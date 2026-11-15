import type { SearchOptions } from '@writingapp/core'
import type { Api, OpResult } from '../../preload/api'
import type Editor from './Editor.svelte'
import type { FindHost, FindScope } from './FindBar.svelte'
import { replacedMessage, seedQuery, startScope, type findScopeOptions } from './findScopes'

/** The parts of an editor the search uses. */
export type FindEditor = Pick<
  Editor,
  'getText' | 'cursorOffset' | 'selectRange' | 'markMatches' | 'clearMarks' | 'replaceRanges' | 'focus'
>

/** What searching needs from the rest of the app. */
export interface FindFlowHost {
  /** The scopes the bar offers right now. */
  scopes(): ReturnType<typeof findScopeOptions>
  /** The text selected in the editor, to seed the query. */
  selectedText(): string
  /** The sheet that is the only one selected, if any. */
  only(): string | undefined
  editor(path: string): FindEditor | undefined
  /** Every editor that is open, by sheet. */
  editors(): [string, FindEditor][]
  /** Opens the sheet in the list, expanding the way to it if needed. */
  openSheet(path: string): Promise<void>
  /** Puts the cursor in the bar's query box, ready to type over. */
  focusBar(seed: string | undefined, replace: boolean): void
  /** Waits for the page to update. */
  tick(): Promise<void>
  /** Notes where the keyboard focus is, and returns a function that puts it back. */
  rememberFocus(): () => void
  runOp(op: () => Promise<OpResult>, reload?: boolean): Promise<OpResult | undefined>
  flush(): Promise<void>
  info(text: string): void
}

/** Find and replace: the bar's state, and how it reaches the editors and the library. */
export class FindFlow {
  /** The open bar, or null when it is closed. */
  current = $state<{ scope: FindScope; replace: boolean; query: string; key: number } | null>(null)
  private key = 0
  private restoreFocus: (() => void) | null = null

  constructor(
    private readonly api: Pick<Api, 'replaceAll'>,
    private readonly host: FindFlowHost
  ) {}

  /** Opens the Find bar. Without a scope it starts as narrow as makes sense. */
  open = (scope?: FindScope, replace = false): void => {
    const scopes = this.host.scopes()
    const seed = seedQuery(this.host.selectedText())
    if (this.current) {
      const wanted = scope && scopes.some((s) => s.value === scope) ? scope : undefined
      if (wanted) this.current.scope = wanted
      this.host.focusBar(seed, replace)
      return
    }
    this.restoreFocus = this.host.rememberFocus()
    this.current = { scope: startScope(scope, scopes), replace, query: seed ?? '', key: ++this.key }
  }

  /** Opens it for the whole group when that is a choice, else as narrowly as makes sense. */
  search = (): void => this.open(this.host.scopes().some((x) => x.value === 'group') ? 'group' : undefined)

  toggle = (): void => (this.current ? this.close() : this.open())

  close = (): void => {
    this.current = null
    for (const [, e] of this.host.editors()) e.clearMarks()
    const path = this.host.only()
    const editor = path ? this.host.editor(path) : undefined
    if (editor) editor.focus()
    else this.restoreFocus?.()
  }

  /** The editor of a sheet, once it has opened. */
  private async editorFor(path: string): Promise<FindEditor | undefined> {
    for (let i = 0; i < 20 && !this.host.editor(path); i++) await this.host.tick()
    return this.host.editor(path)
  }

  /** Replaces in the library (or one sheet); returns how many were changed. */
  replaceFound = async (
    query: string,
    replacement: string,
    path: string | undefined,
    options: SearchOptions
  ): Promise<number> => {
    const result = await this.host.runOp(
      () => this.api.replaceAll(query, replacement, path ? [path] : undefined, options),
      true
    )
    if (result?.replaced) this.host.info(replacedMessage(result.replaced))
    return result?.replaced ?? 0
  }

  /** What the bar uses to reach the sheets. */
  readonly bar: FindHost = {
    sheet: () => {
      const path = this.host.only()
      const editor = path ? this.host.editor(path) : undefined
      if (!path || !editor) return null
      return { path, text: editor.getText(), cursor: editor.cursorOffset() }
    },
    reveal: async (path, from, to) => {
      if (!(this.host.only() === path && this.host.editor(path))) await this.host.openSheet(path)
      ;(await this.editorFor(path))?.selectRange(from, to)
    },
    mark: (path, query, options) => {
      for (const [p, e] of this.host.editors()) {
        if (p === path) e.markMatches(query, options)
        else e.clearMarks()
      }
    },
    unmark: () => {
      for (const [, e] of this.host.editors()) e.clearMarks()
    },
    replaceHere: (path, changes) => this.host.editor(path)?.replaceRanges(changes),
    replaceAll: (query, replacement, within, options) =>
      this.replaceFound(query, replacement, undefined, { ...options, ...(within ? { within } : {}) }),
    flush: () => this.host.flush()
  }
}
