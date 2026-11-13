export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export interface Autosaver {
  /** Records the latest text for a sheet and schedules a save after a pause. */
  change(path: string, text: string): void
  /** Saves everything outstanding now. Resolves when the writes are done. */
  flush(): Promise<void>
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
  retryDelay = 5000
}: Options): Autosaver {
  const unsaved = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let tail: Promise<void> = Promise.resolve()
  let writing = 0
  let failed = false

  function status(): void {
    onStatus(writing > 0 ? 'saving' : failed ? 'error' : unsaved.size > 0 ? 'unsaved' : 'saved')
  }

  function schedule(ms: number): void {
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), ms)
  }

  async function write(path: string, text: string): Promise<void> {
    try {
      await save(path, text)
      failed = false
      if (unsaved.get(path) === text) unsaved.delete(path)
    } catch {
      failed = true
      schedule(retryDelay)
    } finally {
      writing--
      status()
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timer)
    for (const [path, text] of [...unsaved]) {
      writing++
      // Start at once when idle (matters when the window is closing);
      // otherwise queue behind the write in progress so order is kept.
      tail = writing === 1 ? write(path, text) : tail.then(() => write(path, text))
    }
    status()
    return tail
  }

  return {
    change(path, text) {
      unsaved.set(path, text)
      status()
      schedule(delay)
    },
    flush,
    discard(path) {
      unsaved.delete(path)
      status()
    }
  }
}
