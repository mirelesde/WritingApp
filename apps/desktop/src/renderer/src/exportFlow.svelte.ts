import type {
  Api,
  EpubDialogOptions,
  ExportPreview,
  PdfOptions,
  TitlePage
} from '../../preload/api'

type ExportApi = Pick<
  Api,
  | 'previewExport'
  | 'saveExport'
  | 'saveExportMarkdown'
  | 'saveExportDocx'
  | 'saveExportPdf'
  | 'saveExportEpub'
>

/** What the export dialog needs from the rest of the app. */
export interface ExportHost {
  /** Shows a failure. */
  fail(error: unknown): void
  /** Says what was done. */
  info(text: string): void
  /** Clears an earlier failure. */
  clearNotice(): void
}

/**
 * The export dialog: previews the chosen sheets or group, then saves them in one of the
 * formats. Holds the preview shown, whether a save is under way, and what is being exported.
 */
export class ExportFlow {
  preview = $state<ExportPreview | null>(null)
  saving = $state(false)
  /** The sheets or group being exported: a plain array, so it can cross the bridge. */
  private paths: string[] = []

  constructor(
    private readonly api: ExportApi,
    private readonly host: ExportHost
  ) {}

  /** Previews the HTML export of `paths`. */
  open = async (paths: string[]): Promise<void> => {
    this.paths = [...paths]
    try {
      this.preview = await this.api.previewExport(this.paths)
      this.host.clearNotice()
    } catch (e) {
      this.host.fail(e)
    }
  }

  close = (): void => {
    this.preview = null
  }

  save = (pictures: 'embed' | 'folder', css: string, titlePage: TitlePage | null): Promise<void> =>
    this.run((paths) =>
      this.api.saveExport(paths, pictures, css, titlePage ? { ...titlePage } : null)
    )

  saveMarkdown = (): Promise<void> => this.run((paths) => this.api.saveExportMarkdown(paths))

  saveDocx = (options: PdfOptions): Promise<void> =>
    this.run((paths) => this.api.saveExportDocx(paths, { ...options }))

  saveEpub = (options: EpubDialogOptions, css: string): Promise<void> =>
    this.run((paths) => this.api.saveExportEpub(paths, { ...options }, css))

  savePdf = (options: PdfOptions, css: string, titlePage: TitlePage | null): Promise<void> =>
    this.run((paths) =>
      this.api.saveExportPdf(paths, { ...options }, css, titlePage ? { ...titlePage } : null)
    )

  /** Saves through `task`; the dialog closes once something was saved, or when it failed. */
  private async run(task: (paths: string[]) => Promise<string | null | undefined>): Promise<void> {
    this.saving = true
    try {
      const saved = await task(this.paths)
      if (saved) {
        this.preview = null
        this.host.info('Exported to ' + saved.split(/[\\/]/).pop())
      }
    } catch (e) {
      this.host.fail(e)
      this.preview = null
    } finally {
      this.saving = false
    }
  }
}
