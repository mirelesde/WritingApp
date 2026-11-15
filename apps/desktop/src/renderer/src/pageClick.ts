/** What a click on the page around the text tells us. */
export interface PageClick {
  button: number
  /** Whether the click landed on the editor, a seam between sheets, or a control. */
  onContent: boolean
  clientX: number
  /** Where the scrollbar starts: a click right of this is on the scrollbar. */
  contentRight: number
}

/**
 * A click on the empty page around the text (below the last line, beside the column) puts the cursor
 * at the end of the last sheet. Returns that sheet, or undefined when the click means something else.
 */
export function sheetToFocusAtEnd(click: PageClick, parts: { path: string }[]): string | undefined {
  if (click.button !== 0 || parts.length === 0 || click.onContent) return undefined
  if (click.clientX > click.contentRight) return undefined
  return parts[parts.length - 1]?.path
}
