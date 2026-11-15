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
export function watchFolder(
  root: string,
  onChange: () => void,
  quietMs = 400,
  options: { watch?: typeof watch; retryMs?: number; maxRetryMs?: number; log?: (what: string, error: unknown) => void } = {}
): () => void {
  const watchIt = options.watch ?? watch
  const maxRetryMs = options.maxRetryMs ?? 30_000
  let retryMs = options.retryMs ?? 1000
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  let stopped = false

  const changed = (): void => {
    clearTimeout(timer)
    timer = setTimeout(onChange, quietMs)
  }
  // A watcher that fails is closed and started again with a growing pause;
  // anything that changed while it was down is picked up by a refresh once it is back.
  const fail = (): void => {
    watcher?.close()
    watcher = undefined
    if (stopped || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (start()) {
        retryMs = options.retryMs ?? 1000
        changed()
      }
    }, retryMs)
    retryMs = Math.min(retryMs * 2, maxRetryMs)
  }
  const start = (): boolean => {
    try {
      watcher = watchIt(root, { recursive: true }, (_event, name) => {
        if (name && isTempName(basename(name.toString()))) return
        changed()
      })
      watcher.on('error', fail)
      return true
    } catch (e) {
      // Watching is a convenience: without it the library still works, but the reason is logged.
      options.log?.('watching the library folder', e)
      fail()
      return false
    }
  }
  start()
  return () => {
    stopped = true
    clearTimeout(timer)
    clearTimeout(retryTimer)
    watcher?.close()
  }
}
