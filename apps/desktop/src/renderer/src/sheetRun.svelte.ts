import { report } from './report'

/** The sheets being edited: one, or a whole glued run, with the text each had when loaded. */
export interface OpenRun {
  parts: { path: string; text: string }[]
}

/** What loading a run into the editor needs from the rest of the app. */
export interface RunHost {
  readSheet(path: string): Promise<string>
  /** The sheets that read as one with `path`: its glued run, or just itself. */
  pathsOf(path: string): string[]
  /** Records `text` as what the file holds. */
  trust(path: string, text: string): void
  /** Text waiting to be saved (manual mode), shown instead of the file's. */
  pending(path: string): string | undefined
}

/** The run of sheets in the editor: what is open, what was typed since, and whether it could be read. */
export class SheetRun {
  /** What is open, set only once its text has loaded. Null when nothing is. */
  open = $state<OpenRun | null>(null)
  /** Why nothing is shown, if the sheet could not be read. */
  error = $state('')
  /** Text typed since a run was loaded, by path; the status bar counts from it. */
  edits = $state<Record<string, string>>({})
  /** The text selected in the editor. */
  selectedText = $state('')
  private readId = 0

  constructor(private readonly host: RunHost) {}

  /** The open sheets as one text, with what was typed since loading. */
  get text(): string {
    return this.open ? this.open.parts.map((p) => this.edits[p.path] ?? p.text).join('\n\n') : ''
  }

  /** Shows nothing, and abandons any load still under way. */
  clear(): void {
    this.open = null
    this.error = ''
    this.readId++
  }

  /** True if the editor already shows `path` as part of its current run. */
  isOpen(path: string): boolean {
    const shown = this.open?.parts.map((p) => p.path).join('\n')
    return shown !== undefined && this.host.pathsOf(path).join('\n') === shown && shown.split('\n').includes(path)
  }

  /** Loads the glued run that `path` belongs to into the editor. A later load wins over an earlier one. */
  async load(path: string): Promise<void> {
    const id = ++this.readId
    const paths = this.host.pathsOf(path)
    try {
      const texts = await Promise.all(paths.map((p) => this.host.readSheet(p)))
      if (id !== this.readId) return
      paths.forEach((p, i) => this.host.trust(p, texts[i]!))
      const shown = paths.map((p, i) => this.host.pending(p) ?? texts[i]!)
      this.open = { parts: paths.map((p, i) => ({ path: p, text: shown[i]! })) }
      this.edits = Object.fromEntries(paths.flatMap((p, i) => (shown[i] !== texts[i] ? [[p, shown[i]!]] : [])))
      this.selectedText = ''
      this.error = ''
    } catch (e) {
      report('reading a sheet', e)
      if (id !== this.readId) return
      this.open = null
      this.error = 'This sheet could not be read.'
    }
  }
}
