/**
 * Records a failure that was caught and handled without telling the person, so that
 * a bug report can include it (Help > Show Error Log). Never throws and does nothing
 * where there is no bridge, as in tests.
 */
export function report(what: string, error: unknown): void {
  try {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
    const bridge = typeof window === 'undefined' ? undefined : window.api
    void bridge?.logError(what, detail)
  } catch {
    // Reporting must never be the thing that fails.
  }
}
