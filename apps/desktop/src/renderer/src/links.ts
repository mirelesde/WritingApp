import { syntaxTree } from '@codemirror/language'
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const URL_PATTERN = /^(https?:\/\/|mailto:)\S+$/i

/**
 * Pasting a web address over selected text makes the selection a link:
 * `[selected text](address)`. Returns null when the paste is anything else.
 */
export function pasteAsLink(state: EditorState, pasted: string): TransactionSpec | null {
  const range = state.selection.main
  const url = pasted.trim()
  if (state.selection.ranges.length !== 1 || range.empty) return null
  if (!URL_PATTERN.test(url)) return null
  const text = state.sliceDoc(range.from, range.to)
  if (text.includes('\n')) return null
  const link = `[${text}](${url})`
  return {
    changes: { from: range.from, to: range.to, insert: link },
    selection: EditorSelection.cursor(range.from + link.length),
    userEvent: 'input.paste'
  }
}

/** The address of the link at `pos` (an inline link or a bare URL), if any. */
export function linkUrlAt(state: EditorState, pos: number): string | null {
  for (let node = syntaxTree(state).resolveInner(pos, 0); node; node = node.parent!) {
    if (node.name === 'URL') return state.sliceDoc(node.from, node.to)
    if (node.name === 'Link') {
      const url = node.getChild('URL')
      return url ? state.sliceDoc(url.from, url.to) : null
    }
    if (!node.parent) break
  }
  return null
}

/** Only addresses a browser or mail client should handle are opened. */
export function isOpenable(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url)
}

/** Paste-over-selection links, and Cmd/Ctrl-click to open the link under the pointer. */
export const linkBehaviour = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain')
    if (!text) return false
    const spec = pasteAsLink(view.state, text)
    if (!spec) return false
    event.preventDefault()
    view.dispatch(spec)
    return true
  },
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return false
    const url = linkUrlAt(view.state, pos)
    if (!url || !isOpenable(url)) return false
    event.preventDefault()
    window.open(url)
    return true
  }
})
