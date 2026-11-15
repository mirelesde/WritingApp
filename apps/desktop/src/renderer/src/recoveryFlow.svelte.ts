import type { Api, RecoveredSheet } from '../../preload/api'
import { report } from './report'

type RecoveryApi = Pick<Api, 'journalPending' | 'journalClear' | 'recreateSheet'>

/** What offering recovered text back needs from the rest of the app. */
export interface RecoveryHost {
  /** Saves anything outstanding, so restoring does not race a pending write. */
  flush(): Promise<void>
  /** Writes `text` over the sheet on disk. */
  save(path: string, text: string): Promise<void>
  /** Shows `text` in the sheet's editor and keeps it as the sheet's current text. */
  showText(path: string, text: string): void
  /** Records a sheet that was just recreated, so the next save does not look like a conflict. */
  trust(path: string, text: string): void
  info(text: string): void
  fail(error: unknown): void
}

/** Offers back, one sheet at a time, the unsaved text a crash left behind. */
export class RecoveryFlow {
  /** The sheets still to be offered; the first is the one being asked about. */
  pending = $state<RecoveredSheet[]>([])
  /** How many there were when the walk began, for "2 of 3". */
  total = $state(0)

  constructor(
    private readonly api: RecoveryApi,
    private readonly host: RecoveryHost
  ) {}

  get current(): RecoveredSheet | undefined {
    return this.pending[0]
  }

  /** Looks for text left by a crash. Does nothing visible when there is none. */
  check = async (): Promise<void> => {
    try {
      this.pending = await this.api.journalPending()
      this.total = this.pending.length
    } catch (e) {
      report('looking for unsaved text from a crash', e)
      this.pending = []
    }
  }

  /** Restores or drops the current sheet's text, then moves on to the next. */
  finish = async (restore: boolean): Promise<void> => {
    const entry = this.pending[0]
    if (!entry) return
    if (restore && entry.missing) {
      try {
        const made = await this.api.recreateSheet(entry.path, entry.text)
        this.host.trust(made, entry.text)
        this.host.info(`Restored the text as “${made.slice(made.lastIndexOf('/') + 1)}”`)
      } catch (e) {
        this.host.fail(e)
        return
      }
    } else if (restore) {
      try {
        await this.host.flush()
        await this.host.save(entry.path, entry.text)
      } catch (e) {
        this.host.fail(e)
        return
      }
      this.host.showText(entry.path, entry.text)
      this.host.info('Restored the recovered text')
    }
    void this.api.journalClear(entry.path)
    this.pending = this.pending.slice(1)
  }
}
