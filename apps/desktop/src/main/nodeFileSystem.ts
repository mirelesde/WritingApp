import { promises as nodeFs } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import type { DirEntry, FileSystem } from '@writingapp/core'

/**
 * The Node implementation of the core's FileSystem. Electron's
 * `shell.trashItem` is passed in rather than imported, so this file runs
 * (and is tested) under plain Node.
 */
export function createNodeFileSystem(trashItem: (path: string) => Promise<void>): FileSystem {
  let tempCounter = 0

  async function exists(path: string): Promise<boolean> {
    try {
      await nodeFs.stat(path)
      return true
    } catch {
      return false
    }
  }

  return {
    readText: (path) => nodeFs.readFile(path, 'utf8'),

    // Write to a temporary dotfile, then rename over the target, so a crash
    // mid-write never leaves a half-written sheet.
    async writeText(path, text) {
      const temp = join(dirname(path), `.${basename(path)}.${process.pid}-${tempCounter++}.tmp`)
      try {
        await nodeFs.writeFile(temp, text, 'utf8')
        await nodeFs.rename(temp, path)
      } catch (error) {
        await nodeFs.rm(temp, { force: true })
        throw error
      }
    },

    async list(path) {
      const entries: DirEntry[] = []
      for (const dirent of await nodeFs.readdir(path, { withFileTypes: true })) {
        // stat follows symlinks, so a linked folder or file counts as itself.
        const stats = dirent.isSymbolicLink()
          ? await nodeFs.stat(join(path, dirent.name)).catch(() => undefined)
          : dirent
        if (stats?.isDirectory()) entries.push({ name: dirent.name, kind: 'directory' })
        else if (stats?.isFile()) entries.push({ name: dirent.name, kind: 'file' })
      }
      return entries
    },

    exists,

    async fileTimes(path) {
      const stats = await nodeFs.stat(path)
      return { modified: stats.mtimeMs, created: stats.birthtimeMs, size: stats.size }
    },

    async makeDir(path) {
      await nodeFs.mkdir(path, { recursive: true })
    },

    async rename(from, to) {
      const source = await nodeFs.stat(from)
      const target = await nodeFs.stat(to).catch(() => undefined)
      // On a case-insensitive disk "a" and "A" are the same file, so a
      // case-only rename finds its own destination; allow exactly that.
      const sameFile = target && target.ino === source.ino && target.dev === source.dev
      if (target && !sameFile) throw new Error(`Already exists: ${to}`)
      await nodeFs.rename(from, to)
    },

    trash: trashItem
  }
}
