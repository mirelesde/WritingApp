import { writeFileAtomic } from './atomicWrite'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { parseViewSettings, type ViewSettings } from '@writingapp/core'

export interface Settings {
  /** The library folder to reopen at launch. */
  libraryPath?: string
  /** Look and layout choices; only what the user changed. */
  view?: Partial<ViewSettings>
  /** Libraries opened before, most recent first. */
  recentLibraries?: string[]
  /** The sheet that was open when the app last ran. */
  lastSheet?: string
}

export const MAX_RECENT = 10

/** `path` moved to the front of the list, without duplicates, cut to the limit. */
export function withRecent(list: readonly string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT)
}

/** A small JSON settings file. A missing or damaged file reads as empty. */
export function createSettingsStore(file: string): {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
  /** Loads, lays `patch` over what is there (view fields merge), and saves. */
  update(patch: Settings): Promise<Settings>
} {
  return {
    async load() {
      try {
        const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
        if (typeof data === 'object' && data !== null) {
          const { libraryPath, view, recentLibraries, lastSheet } = data as Record<string, unknown>
          const settings: Settings = {}
          if (typeof libraryPath === 'string' && libraryPath !== '') {
            settings.libraryPath = libraryPath
          }
          const parsed = parseViewSettings(view)
          if (Object.keys(parsed).length > 0) settings.view = parsed
          if (Array.isArray(recentLibraries)) {
            const paths = recentLibraries.filter(
              (p): p is string => typeof p === 'string' && p !== ''
            )
            if (paths.length > 0) settings.recentLibraries = [...new Set(paths)].slice(0, MAX_RECENT)
          }
          if (typeof lastSheet === 'string' && lastSheet !== '') settings.lastSheet = lastSheet
          return settings
        }
      } catch {
        // Missing or malformed: start from defaults.
      }
      return {}
    },

    async save(settings) {
      await fs.mkdir(dirname(file), { recursive: true })
      await writeFileAtomic(file, JSON.stringify(settings, null, 2) + '\n')
    },

    async update(patch) {
      const current = await this.load()
      const next: Settings = { ...current, ...patch }
      if (current.view || patch.view) next.view = { ...current.view, ...patch.view }
      await this.save(next)
      return next
    }
  }
}
