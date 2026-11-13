import { Annotation, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  type KeyBinding
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { emphasisPairs } from './emphasis'
import { bracketPairs } from './pairs'
import { linkBehaviour } from './links'
import { richPaste } from './richPaste'
import { blankLines } from './blankLines'
import { taskBoxes } from './taskBoxes'
import { tableWidgets } from './tableWidget'
import { footnotes } from './footnotes'
import { linkChips } from './linkChips'
import { formattingKeymap } from './formatting'
import { blockKeymap } from './blockStyle'
import { headingMarks } from './headingMarks'
import { paragraphStarts } from './paragraphs'
import { currentHeading, nextHeading, previousHeading } from './headingJump'

const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/** Layout and typography: a readable column, generous leading. */
const theme = EditorView.theme({
  // The editor grows with its text; the run it sits in does the scrolling.
  // Slightly softer than the UI text: long reading is easier on the eyes.
  '&': { color: 'color-mix(in srgb, var(--text) 90%, var(--bg))', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font)',
    fontSize: 'var(--editor-size)', lineHeight: 'var(--editor-line-height, 1.85)', overflow: 'visible' },
  '.cm-content': {
    // A 46rem column with 64px of air each side leaves about 38rem of text.
    maxWidth: 'var(--editor-width, 46rem)',
    textAlign: 'var(--text-align, left)',
    margin: '0 auto',
    padding: '0 64px',
    caretColor: 'var(--text)'
  },
  '.cm-line': { padding: '0', transition: 'opacity 0.2s' },
  // One outlined chip around the whole [text](address) link.
  '.cm-link-chip': {
    border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
    borderRadius: '5px',
    padding: '0 3px'
  },
  '.cm-line.cm-dim': { opacity: 'var(--dim-opacity, 0.3)' },
  '.cm-dim-text': { opacity: 'var(--dim-opacity, 0.3)', transition: 'opacity 0.2s' },
  // The blank line between paragraphs: its height is the paragraph spacing setting.
  '.cm-task-box': { cursor: 'pointer', color: 'var(--accent)' },
  '.cm-line.cm-blank': { lineHeight: 'calc(var(--editor-line-height, 1.85) * var(--blank-line-scale, 1))' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)', borderLeftWidth: 'var(--caret-width, 2px)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--faint)',
    border: 'none',
    fontFamily: 'var(--editor-font)',
    fontSize: '0.75em'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 8px', minWidth: '2.5em' },
  // Find and replace bar: sticky at the top of the sheet, in the app's own colours.
  '.cm-panels': {
    backgroundColor: 'var(--pane)',
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'system-ui, sans-serif'
  },
  '.cm-search': { padding: '8px 12px', fontSize: '13px' },
  '.cm-search input, .cm-search button': { font: 'inherit', fontSize: '13px' },
  '.cm-search input.cm-textfield': {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '3px 6px'
  },
  '.cm-search button.cm-button': {
    background: 'var(--bg)',
    backgroundImage: 'none',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '3px 8px'
  },
  '.cm-searchMatch': { backgroundColor: 'var(--selection)', outline: '1px solid var(--marker)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--accent)', color: '#fff' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { background: 'var(--selection)' }
})

/**
 * Markdown styling. Markers (#, *, -, >, backticks, link brackets) stay in
 * the text but are dimmed, so the cursor never meets hidden characters.
 */
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '2.7em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '2.1em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontSize: '1.2em', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)' },
  // Commented-out text: kept in the file, left out of exports and counts.
  { tag: tags.comment, color: 'var(--comment)', fontStyle: 'italic' },
  { tag: tags.url, color: 'var(--faint)' },
  { tag: tags.monospace, fontFamily: mono, fontSize: '0.88em' },
  { tag: tags.quote, color: 'var(--quote)', fontStyle: 'italic' },
  // Markers (#, *, >, brackets) stay in the text but fade back.
  { tag: tags.processingInstruction, color: 'var(--faint)' },
  // A --- rule is drawn as a spaced accent line.
  { tag: tags.contentSeparator, color: 'var(--accent)', letterSpacing: '0.25em' }
])

/** Marks a change that came from the disk, not from typing, so it is not saved back. */
export const fromDisk = Annotation.define<boolean>()

interface Hooks {
  onchange: (text: string) => void
  onblur: () => void
  onescape?: () => void
  onfocus?: () => void
  /**
   * The cursor tried to move past the start or end of the text. Return true
   * if something else took over (the neighbouring sheet in a run).
   */
  onedge?: (direction: 'back' | 'forward') => boolean
  /** The selected text changed; empty when nothing is selected. */
  onselection?: (selected: string) => void
  /** The section the cursor is in changed: the index of its heading, or -1 before the first. */
  onsection?: (heading: number) => void
}

/** An arrow key that hands over to the next sheet when the cursor cannot go further. */
function edgeKey(
  key: string,
  forward: boolean,
  vertical: boolean,
  onedge: NonNullable<Hooks['onedge']>
): KeyBinding {
  return {
    key,
    run: (view) => {
      const range = view.state.selection.main
      if (!range.empty) return false
      const stuck = vertical
        ? view.moveVertically(range, forward).head === range.head
        : range.head === (forward ? view.state.doc.length : 0)
      return stuck ? onedge(forward ? 'forward' : 'back') : false
    }
  }
}

/** Everything the sheet editor is made of. */
export function editorExtensions({
  onchange,
  onblur,
  onescape,
  onfocus,
  onedge,
  onselection,
  onsection
}: Hooks): Extension[] {
  return [
    history(),
    drawSelection(),
    highlightActiveLine(),
    blankLines,
    headingMarks,
    paragraphStarts,
    taskBoxes,
    tableWidgets,
    footnotes,
    EditorView.lineWrapping,
    // GitHub-flavoured base: strikethrough, task lists, tables.
    // The markdown keymap (included) continues lists on Enter and
    // removes list markers on Backspace.
    markdown({ base: markdownLanguage }),
    ...emphasisPairs,
    ...bracketPairs,
    linkBehaviour,
    richPaste,
    linkChips,
    // Find and replace within this sheet; Find in Library searches all of them.
    search({ top: true }),
    highlightSelectionMatches(),
    // Four spaces nests correctly under both "- " and "1. " markers.
    indentUnit.of('    '),
    keymap.of([
      // Cmd/Ctrl+F and Cmd/Ctrl+Alt+F both open the bar; it always has a replace field.
      { key: 'Mod-Alt-f', run: openSearchPanel, preventDefault: true },
      ...searchKeymap,
      { key: 'Escape', run: () => (onescape ? (onescape(), true) : false) },
      ...(onedge
        ? [
            edgeKey('ArrowDown', true, true, onedge),
            edgeKey('ArrowRight', true, false, onedge),
            edgeKey('ArrowUp', false, true, onedge),
            edgeKey('ArrowLeft', false, false, onedge)
          ]
        : []),
      // Before the default keymap, which uses Mod-i to select the parent syntax node.
      ...formattingKeymap,
      ...blockKeymap,
      // Before the default keymap, which uses these for multiple cursors.
      { key: 'Mod-Alt-ArrowUp', run: previousHeading },
      { key: 'Mod-Alt-ArrowDown', run: nextHeading },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    theme,
    syntaxHighlighting(markdownStyle),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences' }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((t) => t.annotation(fromDisk))) {
        onchange(update.state.doc.toString())
      }
      if (onsection && (update.selectionSet || update.docChanged)) {
        onsection(currentHeading(update.state.doc.toString(), update.state.selection.main.head))
      }
      if (onselection && (update.selectionSet || update.docChanged)) {
        const { from, to } = update.state.selection.main
        onselection(update.state.sliceDoc(from, to))
      }
    }),
    EditorView.domEventHandlers({
      blur: () => {
        onblur()
      },
      focus: () => {
        onfocus?.()
      }
    })
  ]
}

export function createEditorState(doc: string, hooks: Hooks, extra: Extension = []): EditorState {
  return EditorState.create({ doc, extensions: [editorExtensions(hooks), extra] })
}
