import { promises as nodeFs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/** Unsaved text found after a crash or a failed save: the sheet it belongs to and how it differs from the file. */
export interface RecoveredSheet {
  path: string
  /** The text that was in the editor. */
  text: string
  /** What the file holds now. */
  disk: string
  /** When the text was journaled, in ms since 1970. */
  savedAt: number
}

interface Entry {
  version: 1
  root: string
  path: string
  text: string
  savedAt: number
}

/**
 * A safety net for text that has not reached its file yet. The editor puts its
 * unsaved text here a moment after each change and clears it once the file is
 * written, so whatever is still here at the next launch was lost to a crash,
 * a power cut or a write that kept failing.
 */
export function createJournal(dir: string): {
  put(root: string, path: string, text: string): Promise<void>
  clear(path: string): Promise<void>
  /** Entries for `root` whose text differs from the file. The rest are deleted. */
  pending(root: string): Promise<RecoveredSheet[]>
} {
  // Operations on one sheet run in order, so a late write cannot undo a clear.
  const queues = new Map<string, Promise<unknown>>()
  const fileFor = (path: string): string => join(dir, `${createHash('sha1').update(path).digest('hex')}.json`)

  function inOrder<T>(path: string, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(path) ?? Promise.resolve()).then(task, task)
    const tail = run.catch(() => undefined)
    queues.set(path, tail)
    void tail.then(() => queues.get(path) === tail && queues.delete(path))
    return run
  }

  return {
    put: (root, path, text) =>
      inOrder(path, async () => {
        await nodeFs.mkdir(dir, { recursive: true })
        const file = fileFor(path)
        const entry: Entry = { version: 1, root, path, text, savedAt: Date.now() }
        await nodeFs.writeFile(`${file}.tmp`, JSON.stringify(entry), 'utf8')
        await nodeFs.rename(`${file}.tmp`, file)
      }),

    clear: (path) => inOrder(path, () => nodeFs.rm(fileFor(path), { force: true })),

    async pending(root) {
      const found: RecoveredSheet[] = []
      let names: string[]
      try {
        names = await nodeFs.readdir(dir)
      } catch {
        return found
      }
      for (const name of names.filter((n) => n.endsWith('.json'))) {
        const file = join(dir, name)
        try {
          const entry = JSON.parse(await nodeFs.readFile(file, 'utf8')) as Partial<Entry>
          if (entry.version !== 1 || typeof entry.path !== 'string' || typeof entry.text !== 'string') {
            await nodeFs.rm(file, { force: true })
            continue
          }
          if (entry.root !== root) continue // another library's
          let disk: string | undefined
          try {
            disk = await nodeFs.readFile(entry.path, 'utf8')
          } catch {
            // The sheet is gone or was renamed: there is nothing to restore into.
          }
          if (disk === undefined || disk === entry.text) {
            await nodeFs.rm(file, { force: true })
            continue
          }
          found.push({ path: entry.path, text: entry.text, disk, savedAt: entry.savedAt ?? 0 })
        } catch {
          await nodeFs.rm(file, { force: true })
        }
      }
      return found.sort((a, b) => a.savedAt - b.savedAt)
    }
  }
}
