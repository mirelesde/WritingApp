import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/** Layout and typography: a readable column, generous leading. */
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: serif, fontSize: '18px', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: '48px 32px 40vh',
    caretColor: 'var(--text)'
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { background: 'var(--selection)' }
})

/**
 * Markdown styling. Markers (#, *, -, >, backticks, link brackets) stay in
 * the text but are dimmed, so the cursor never meets hidden characters.
 */
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '700' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--marker)' },
  { tag: tags.monospace, fontFamily: mono, fontSize: '0.88em' },
  { tag: tags.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--marker)' }
])

interface Hooks {
  onchange: (text: string) => void
  onblur: () => void
}

/** Everything the sheet editor is made of. */
export function editorExtensions({ onchange, onblur }: Hooks): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    // GitHub-flavoured base: strikethrough, task lists, tables.
    // The markdown keymap (included) continues lists on Enter and
    // removes list markers on Backspace.
    markdown({ base: markdownLanguage }),
    // Four spaces nests correctly under both "- " and "1. " markers.
    indentUnit.of('    '),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    theme,
    syntaxHighlighting(markdownStyle),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences' }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onchange(update.state.doc.toString())
    }),
    EditorView.domEventHandlers({
      blur: () => {
        onblur()
      }
    })
  ]
}

export function createEditorState(doc: string, hooks: Hooks): EditorState {
  return EditorState.create({ doc, extensions: editorExtensions(hooks) })
}
