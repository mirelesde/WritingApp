import { EditorView } from '@codemirror/view'
import { htmlToMarkdown, isRichPaste } from '@writingapp/core'

/** Set by Cmd/Ctrl+Shift+V, which pastes the plain text as it is. */
let plainNext = false

/**
 * Pasting from a web page or a word processor gives Markdown: headings,
 * emphasis, links and lists carry over. Paste as Plain Text
 * (Cmd/Ctrl+Shift+V) and anything without formatting paste as before.
 */
export const richPaste = EditorView.domEventHandlers({
  keydown(event) {
    plainNext = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v'
    return false
  },
  paste(event, view) {
    const plain = plainNext
    plainNext = false
    if (plain) return false
    const html = event.clipboardData?.getData('text/html')
    if (!html) return false
    const text = event.clipboardData?.getData('text/plain') ?? ''
    const markdown = htmlToMarkdown(html)
    if (!isRichPaste(markdown, text)) return false
    event.preventDefault()
    view.dispatch({
      ...view.state.replaceSelection(markdown),
      scrollIntoView: true,
      userEvent: 'input.paste'
    })
    return true
  }
})
