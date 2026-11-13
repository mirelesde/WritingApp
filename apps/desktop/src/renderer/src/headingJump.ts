import { extractHeadings } from '@writingapp/core'
import { EditorSelection, type EditorState } from '@codemirror/state'
import { EditorView, type Command } from '@codemirror/view'

/**
 * Where the cursor should go to reach the previous or next heading from
 * `pos`, or null if there is none that way.
 */
export function headingTarget(text: string, pos: number, direction: -1 | 1): number | null {
  const offsets = extractHeadings(text).map((h) => h.offset)
  if (direction === 1) return offsets.find((o) => o > pos) ?? null
  // Going back from inside a heading's own line means the one before it.
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  return [...offsets].reverse().find((o) => o < lineStart || (o < pos && o !== lineStart)) ?? null
}

/** The index of the heading whose section holds `pos`, or -1 before the first heading. */
export function currentHeading(text: string, pos: number): number {
  const offsets = extractHeadings(text).map((h) => h.offset)
  let current = -1
  offsets.forEach((o, i) => {
    if (o <= pos) current = i
  })
  return current
}

function jump(direction: -1 | 1): Command {
  return (view: EditorView) => {
    const state: EditorState = view.state
    const target = headingTarget(state.doc.toString(), state.selection.main.head, direction)
    if (target === null) return true // swallow the key; nothing to jump to
    view.dispatch({
      selection: EditorSelection.cursor(target),
      effects: EditorView.scrollIntoView(target, { y: 'start', yMargin: 24 }),
      userEvent: 'select'
    })
    return true
  }
}

export const previousHeading = jump(-1)
export const nextHeading = jump(1)
