import { report } from './report'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export interface Autosaver {
  /** Records the latest text for a sheet and schedules a save after a pause. */
  change(path: string, text: string): void
  /** Saves everything outstanding now, or only the given sheets. Resolves when the writes are done. */
  flush(paths?: readonly string[]): Promise<void>
  /** The text waiting to be saved for a sheet, if there is any. */
  pending(path: string): string | undefined
  /** The sheets that have text waiting to be saved. */
  unsavedPaths(): string[]
  /** Forgets unsaved text for a sheet, e.g. when the disk's version replaced it. */
  discard(path: string): void
}

interface Options {
  save: (path: string, text: string) => Promise<void>
  onStatus?: (status: SaveStatus) => void
  /** Quiet time after the last keystroke before saving. */
  delay?: number
  /** How long to wait before retrying after a failed save. */
  retryDelay?: number
  /** Keeps unsaved text somewhere safe, so a crash before the save loses nothing. */
  journal?: {
    put: (path: string, text: string) => Promise<void>
    clear: (path: string) => Promise<void>
  }
  /** Quiet time after a keystroke before the text is journaled. Shorter than `delay`. */
  journalDelay?: number
  /** Told which sheets have unsaved text, whenever that changes. */
  onUnsaved?: (paths: string[]) => void
  /** Whether to save by itself after a pause. When it says no, text waits for `flush` (the journal still keeps it safe). */
  enabled?: () => boolean
}

/**
 * Debounced, serialised saving. Text stays in `unsaved` until a write of
 * exactly that text succeeds, so a failed write is retried and a newer edit
 * made during a write is never marked saved.
 */
export function createAutosaver({
  save,
  onStatus = () => {},
  delay = 800,
  retryDelay = 5000,
  journal,
  journalDelay = 250,
  onUnsaved = () => {},
  enabled = () => true
}: Options): Autosaver {
  const unsaved = new Map<string, string>()
  // What the journal holds for each sheet, so only new text is sent and only stored text is cleared.
  const journaled = new Map<string, string>()
  let journalTimer: ReturnType<typeof setTimeout> | undefined

  function writeJournal(): void {
    for (const [path, text] of unsaved) {
      if (journaled.get(path) === text) continue
      journaled.set(path, text)
      journal?.put(path, text).catch(() => journaled.delete(path))
    }
  }

  function clearJournal(path: string): void {
    if (!journaled.delete(path)) return
    journal?.clear(path).catch(() => {})
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let tail: Promise<void> = Promise.resolve()
  let writing = 0
  let failed = false

  let reported = ''
  function status(): void {
    const paths = [...unsaved.keys()]
    const key = paths.join('\n')
    if (key !== reported) {
      reported = key
      onUnsaved(paths)
    }
    onStatus(writing > 0 ? 'saving' : failed ? 'error' : unsaved.size > 0 ? 'unsaved' : 'saved')
  }

  function schedule(ms: number): void {
    clearTimeout(timer)
    timer = setTimeout(() => void flushNow(), ms)
  }

  async function write(path: string, text: string): Promise<void> {
    try {
      await save(path, text)
      failed = false
      if (unsaved.get(path) === text) {
        unsaved.delete(path)
        clearJournal(path)
      }
    } catch (e) {
      report('saving a sheet', e)
      failed = true
      if (enabled()) schedule(retryDelay)
    } finally {
      writing--
      status()
    }
  }

  /** The save that follows a pause in typing. */
  function flushNow(only?: readonly string[]): Promise<void> {
    clearTimeout(timer)
    for (const [path, text] of [...unsaved]) {
      if (only && !only.includes(path)) continue
      writing++
      // Start at once when idle (matters when the window is closing);
      // otherwise queue behind the write in progress so order is kept.
      tail = writing === 1 ? write(path, text) : tail.then(() => write(path, text))
    }
    status()
    return tail
  }

  /** Saves everything outstanding now, for callers that cannot wait for a pause (closing, searching). */
  function flush(paths?: readonly string[]): Promise<void> {
    // The text goes to the journal first, without waiting: if the window closes
    // or the write fails, the journal still has it.
    clearTimeout(journalTimer)
    writeJournal()
    return flushNow(paths)
  }

  return {
    change(path, text) {
      unsaved.set(path, text)
      status()
      if (enabled()) schedule(delay)
      if (journal) {
        clearTimeout(journalTimer)
        journalTimer = setTimeout(writeJournal, journalDelay)
      }
    },
    flush,
    pending: (path) => unsaved.get(path),
    unsavedPaths: () => [...unsaved.keys()],
    discard(path) {
      unsaved.delete(path)
      clearJournal(path)
      status()
    }
  }
}
