import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export interface Settings {
  /** The library folder to reopen at launch. */
  libraryPath?: string
}

/** A small JSON settings file. A missing or damaged file reads as empty. */
export function createSettingsStore(file: string): {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
} {
  return {
    async load() {
      try {
        const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
        if (typeof data === 'object' && data !== null) {
          const { libraryPath } = data as Record<string, unknown>
          if (typeof libraryPath === 'string' && libraryPath !== '') return { libraryPath }
        }
      } catch {
        // Missing or malformed: start from defaults.
      }
      return {}
    },

    async save(settings) {
      await fs.mkdir(dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(settings, null, 2) + '\n', 'utf8')
    }
  }
}
