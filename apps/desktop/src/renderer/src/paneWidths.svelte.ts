const KEY = 'pane-widths'

export const LIBRARY = { min: 160, max: 400, fallback: 240 }
export const SHEETS = { min: 220, max: 520, fallback: 300 }

export const clamp = (value: number, range: { min: number; max: number }): number =>
  Math.round(Math.min(range.max, Math.max(range.min, value)))

/** The widths of the group list and the sheet list, which the writer can drag to change. */
export class PaneWidths {
  library = $state(LIBRARY.fallback)
  sheets = $state(SHEETS.fallback)

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      if (typeof saved.library === 'number') this.library = clamp(saved.library, LIBRARY)
      if (typeof saved.sheets === 'number') this.sheets = clamp(saved.sheets, SHEETS)
    } catch {
      // Nothing saved, or storage is unavailable: the defaults do.
    }
  }

  /** Sets one width while dragging. */
  set(which: 'library' | 'sheets', value: number): void {
    this[which] = clamp(value, which === 'library' ? LIBRARY : SHEETS)
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ library: this.library, sheets: this.sheets }))
    } catch {
      // Not remembered this time.
    }
  }

  reset(which: 'library' | 'sheets'): void {
    this[which] = which === 'library' ? LIBRARY.fallback : SHEETS.fallback
    this.save()
  }
}
