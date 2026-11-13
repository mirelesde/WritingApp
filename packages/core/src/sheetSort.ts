import type { SheetNode } from './library'
import type { SheetSort } from './viewSettings'

/**
 * The sheets in the order the list should show them. `manual` keeps the
 * saved order; the others sort a copy: titles A to Z, dates newest first,
 * longest first. Sheets without a date go last.
 */
export function sortSheets(sheets: SheetNode[], by: SheetSort): SheetNode[] {
  if (by === 'manual') return sheets
  const out = [...sheets]
  const newest = (key: 'modified' | 'created') => (a: SheetNode, b: SheetNode) =>
    (b[key] ?? -Infinity) - (a[key] ?? -Infinity)
  if (by === 'title') out.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
  else if (by === 'words') out.sort((a, b) => b.words - a.words)
  else out.sort(newest(by))
  return out
}
