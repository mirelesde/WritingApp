/** Raised instead of overwriting a file that changed on disk since the app last saw it. */
export class SaveConflict extends Error {
  constructor(
    readonly path: string,
    /** What is on disk now. */
    readonly disk: string
  ) {
    super('The sheet changed on disk')
  }
}

interface Options {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

/**
 * Remembers what each sheet held the last time the app loaded or saved it,
 * and refuses to save over a different file: if the disk no longer matches
 * that, something else wrote it, and the writer should choose.
 */
export function createSaveGuard({ read, write }: Options): {
  /** Records `text` as what is on disk for `path`. */
  trust(path: string, text: string): void
  /** Saves `text`, or throws SaveConflict. */
  save(path: string, text: string): Promise<void>
  /** What the app last saw on disk for `path`. */
  baseline(path: string): string | undefined
} {
  const baselines = new Map<string, string>()

  async function conflictFor(path: string, mine: string): Promise<string | null> {
    const base = baselines.get(path)
    if (base === undefined) return null
    let disk: string
    try {
      disk = await read(path)
    } catch {
      return null // gone from disk: saving recreates it
    }
    return disk !== base && disk !== mine ? disk : null
  }

  return {
    trust: (path, text) => void baselines.set(path, text),
    baseline: (path) => baselines.get(path),
    async save(path, text) {
      const disk = await conflictFor(path, text)
      if (disk !== null) throw new SaveConflict(path, disk)
      // Set before writing: the file watcher may report our own write before `write` returns.
      const before = baselines.get(path)
      baselines.set(path, text)
      try {
        await write(path, text)
      } catch (error) {
        if (before === undefined) baselines.delete(path)
        else baselines.set(path, before)
        throw error
      }
    }
  }
}
