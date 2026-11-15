import type { GroupNode } from '@writingapp/core'
import type { Api, OpResult } from '../../preload/api'
import type { SelectionState } from './selectionState.svelte'

type CreationApi = Pick<
  Api,
  'createSheet' | 'newFromTemplate' | 'dailyNote' | 'importFiles' | 'writeSheet' | 'saveTemplate' | 'listTemplates'
>

/** What making sheets needs from the rest of the app. */
export interface CreationHost {
  /** The group whose sheets are listed. */
  group(): GroupNode | undefined
  /** Saves anything outstanding, runs the change, then brings the UI in line with the result. */
  runOp(op: () => Promise<OpResult>): Promise<OpResult | undefined>
  setSelection(paths: string[], to: string | null, focus?: boolean): Promise<void>
  /** Selects what an import produced. */
  selectCopies(paths: string[]): Promise<void>
  /** Waits for a pending selection change to finish. */
  settle(): Promise<void>
  /** Writes out unsaved text. */
  flush(): Promise<void>
  /** The text of the sheet being edited, if one is open. */
  currentText(): string | undefined
  info(text: string): void
  /** Shows a message about something that could not be done. */
  warn(text: string): void
}

/** Making new sheets: blank, from a template, the daily note, a link's target, or imported files. */
export class SheetCreation {
  /** The templates the library offers. */
  templates = $state<{ name: string; path: string }[]>([])

  constructor(
    private readonly api: CreationApi,
    private readonly sel: SelectionState,
    private readonly host: CreationHost
  ) {}

  /** Where a new sheet goes in `parent`: after the one the cursor is on, else at the end. */
  private slot(parent: GroupNode): number | undefined {
    const at = parent.children.findIndex((c) => c.path === this.sel.cursor)
    return at >= 0 ? at + 1 : undefined
  }

  /** Selects a sheet that was just made, with the cursor in it. */
  private async open(result: OpResult | undefined): Promise<void> {
    if (!result?.created) return
    this.sel.anchor = result.created
    await this.host.setSelection([result.created], result.created, true)
  }

  loadTemplates = async (): Promise<void> => {
    this.templates = await this.api.listTemplates()
  }

  newSheet = async (): Promise<void> => {
    const parent = this.host.group()
    if (!parent) return
    const at = this.slot(parent)
    await this.open(await this.host.runOp(() => this.api.createSheet(parent.path, at)))
  }

  fromTemplate = async (template: string): Promise<void> => {
    const parent = this.host.group()
    if (!parent) return
    const at = this.slot(parent)
    await this.open(await this.host.runOp(() => this.api.newFromTemplate(parent.path, template, at)))
  }

  dailyNote = async (): Promise<void> => {
    const parent = this.host.group()
    if (!parent) return
    await this.open(await this.host.runOp(() => this.api.dailyNote(parent.path)))
  }

  /** A [[link]] to nothing: makes that sheet beside the current one, titled by the link. */
  forLink = async (target: string): Promise<void> => {
    await this.host.settle()
    const parent = this.host.group()
    if (!parent) return
    await this.host.flush()
    const at = this.slot(parent)
    const result = await this.host.runOp(() => this.api.createSheet(parent.path, at))
    if (!result?.created) return
    await this.api.writeSheet(result.created, `# ${target.trim()}\n\n`)
    await this.host.setSelection([result.created], result.created, true)
  }

  importFiles = async (): Promise<void> => {
    const parent = this.host.group()
    if (!parent) return
    const at = this.slot(parent)
    const result = await this.host.runOp(() => this.api.importFiles(parent.path, at))
    if (result?.copied?.length) await this.host.selectCopies(result.copied)
    const done = result?.copied?.length ?? 0
    const bad = result?.skipped ?? []
    if (bad.length > 0) {
      const names = bad.slice(0, 3).join(', ') + (bad.length > 3 ? ` and ${bad.length - 3} more` : '')
      this.host.warn(`${done > 0 ? `Imported ${done}. ` : ''}Could not import ${names}.`)
    } else if (done > 0) {
      this.host.info(`Imported ${done === 1 ? '1 sheet' : `${done} sheets`}.`)
    }
  }

  saveAsTemplate = async (): Promise<void> => {
    const text = this.host.currentText()
    if (text === undefined) return
    await this.api.saveTemplate(text)
    await this.loadTemplates()
    this.host.info('Saved as a template')
  }
}
