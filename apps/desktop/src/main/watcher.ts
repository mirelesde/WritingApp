import { watch, type FSWatcher } from 'node:fs'
import { basename } from 'node:path'

/** Temporary files the app itself writes while saving; they are not changes. */
export function isTempName(name: string): boolean {
  return name.startsWith('.') && name.endsWith('.tmp')
}

/**
 * Calls `onChange` once things have settled after something under `root`
 * changes: a burst of events (a sync client writing many files) becomes one
 * call. Returns a function that stops watching.
 */
export function watchFolder(root: string, onChange: () => void, quietMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  try {
    watcher = watch(root, { recursive: true }, (_event, name) => {
      if (name && isTempName(basename(name.toString()))) return
      clearTimeout(timer)
      timer = setTimeout(onChange, quietMs)
    })
    watcher.on('error', () => watcher?.close())
  } catch {
    // Watching is a convenience: without it the library still works.
  }
  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}
