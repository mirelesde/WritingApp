import { app, dialog, shell, type BrowserWindow } from 'electron'
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Reloads allowed within the window before giving up, so a crash on start-up cannot loop. */
export const MAX_RELOADS = 3
export const RELOAD_WINDOW_MS = 60_000

/** Whether a crashed window should be reloaded, given when it crashed before. Records this crash. */
export function shouldReload(history: number[], now: number): boolean {
  while (history.length > 0 && now - history[0]! > RELOAD_WINDOW_MS) history.shift()
  history.push(now)
  return history.length <= MAX_RELOADS
}

/** Where errors.log lives. */
export function errorLogPath(): string {
  return join(app.getPath('userData'), 'errors.log')
}

/** Shows errors.log in the system file manager, making it first if nothing has been logged yet, so a bug report can attach it. */
export async function showErrorLog(): Promise<void> {
  const file = errorLogPath()
  await appendFile(file, '', 'utf8').catch(() => writeFile(file, '', 'utf8').catch(() => undefined))
  shell.showItemInFolder(file)
}

/** Appends a line to errors.log in the app's data folder; never throws. */
export async function logError(what: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(what, detail)
  try {
    await appendFile(errorLogPath(), `${new Date().toISOString()} ${what}: ${detail}\n`, 'utf8')
  } catch {
    // Logging must never be the thing that fails.
  }
}

/**
 * A window whose page crashed is reloaded (its unsaved text is in the journal
 * and comes back through recovery). After repeated crashes it is left alone and
 * the person is told.
 */
export function recoverFromCrashes(window: BrowserWindow): void {
  const history: number[] = []
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    void logError('renderer gone', details.reason)
    if (window.isDestroyed()) return
    if (shouldReload(history, Date.now())) {
      window.webContents.reload()
    } else {
      void dialog.showMessageBox(window, {
        type: 'error',
        message: 'This window keeps crashing.',
        detail: 'Your text is kept and will be offered back the next time you open the app. Close the window and open it again.'
      })
    }
  })
}

/** Logs errors that nothing caught, instead of letting them pass unseen. */
export function logUncaught(): void {
  process.on('uncaughtException', (error) => void logError('uncaught exception', error))
  process.on('unhandledRejection', (reason) => void logError('unhandled rejection', reason))
}
