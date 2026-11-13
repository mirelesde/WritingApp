import { EditorState, StateField, type Extension, type Range } from '@codemirror/state'
import { inlineSpans } from './inlineMarks'
import { redo, undo } from '@codemirror/commands'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import {
  addColumn,
  addRow,
  findTables,
  formatTable,
  newTable,
  removeColumn,
  removeRow,
  setAlign,
  type Align,
  type Table
} from '@writingapp/core'

/** What a table's DOM remembers between updates. */
interface Live {
  table: Table
  /** Length of the table's text in the document (caption included). */
  length: number
  /** The formatted Markdown this DOM shows. */
  key: string
  row: number
  col: number
  timer?: ReturnType<typeof setTimeout>
}

const live = new WeakMap<HTMLElement, Live>()
const NEXT_ALIGN: Align[] = [null, 'left', 'center', 'right']

function button(label: string, text: string, onclick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'cm-table-tool'
  b.title = label
  b.setAttribute('aria-label', label)
  b.textContent = text
  b.tabIndex = -1
  // Keep focus in the cell the button acts on.
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', onclick)
  return b
}

class TableWidget extends WidgetType {
  readonly key: string

  constructor(
    readonly table: Table,
    readonly length: number
  ) {
    super()
    this.key = formatTable(table)
  }

  eq(other: TableWidget): boolean {
    return other.key === this.key && other.length === this.length
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'cm-table'
    live.set(dom, {
      table: structuredClone(this.table),
      length: this.length,
      key: this.key,
      row: 0,
      col: 0
    })
    fill(dom, view)
    return dom
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = live.get(dom)
    if (!state) return false
    // The change came from this very table being edited: the DOM is already right.
    if (formatTable(state.table) === this.key) {
      state.length = this.length
      state.key = this.key
      return true
    }
    state.table = structuredClone(this.table)
    state.length = this.length
    state.key = this.key
    fill(dom, view)
    return true
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Writes the table in the document, right now. */
function commit(dom: HTMLElement, view: EditorView): void {
  const state = live.get(dom)
  if (!state) return
  clearTimeout(state.timer)
  state.timer = undefined
  const text = formatTable(state.table)
  if (text === state.key) return
  const from = view.posAtDOM(dom)
  state.key = text
  const length = state.length
  state.length = text.length
  view.dispatch({
    changes: { from, to: from + length, insert: text },
    userEvent: 'input.table'
  })
}

function schedule(dom: HTMLElement, view: EditorView): void {
  const state = live.get(dom)
  if (!state) return
  clearTimeout(state.timer)
  state.timer = setTimeout(() => commit(dom, view), 250)
}

/** Replaces the table with an edited copy, rebuilds the grid and focuses a cell. */
function change(dom: HTMLElement, view: EditorView, next: Table, row: number, col: number): void {
  const state = live.get(dom)
  if (!state) return
  state.table = next
  state.row = row
  state.col = col
  fill(dom, view)
  focusCell(dom, row, col)
  commit(dom, view)
}

function focusCell(dom: HTMLElement, row: number, col: number): void {
  const cell = dom.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)
  if (!cell) return
  cell.focus()
  // Arriving by keyboard selects the cell's text, so typing replaces it.
  const range = document.createRange()
  range.selectNodeContents(cell)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Puts the cursor in the document just after the table, leaving the grid. */
function leave(dom: HTMLElement, view: EditorView, forward: boolean): void {
  const state = live.get(dom)
  if (!state) return
  commit(dom, view)
  const from = view.posAtDOM(dom)
  const end = Math.min(view.state.doc.length, from + (live.get(dom)?.length ?? 0) + 1)
  view.dispatch({ selection: { anchor: forward ? end : Math.max(0, from - 1) }, scrollIntoView: true })
  view.focus()
}

function cellKeys(e: KeyboardEvent, dom: HTMLElement, view: EditorView, row: number, col: number): void {
  const state = live.get(dom)
  if (!state) return
  const { table } = state
  const last = table.rows.length - 1
  const columns = table.header.length
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    // Undo belongs to the document, not the cell.
    e.preventDefault()
    commit(dom, view)
    if (e.shiftKey) redo(view)
    else undo(view)
  } else if (e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      if (col > 0) focusCell(dom, row, col - 1)
      else if (row > -1) focusCell(dom, row - 1, columns - 1)
    } else if (col < columns - 1) focusCell(dom, row, col + 1)
    else if (row < last) focusCell(dom, row + 1, 0)
    else change(dom, view, addRow(table), row + 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (row < last) focusCell(dom, row + 1, col)
    else change(dom, view, addRow(table), row + 1, col)
  } else if (e.key === 'ArrowDown' && row < last) {
    e.preventDefault()
    focusCell(dom, row + 1, col)
  } else if (e.key === 'ArrowUp' && row > -1) {
    e.preventDefault()
    focusCell(dom, row - 1, col)
  } else if (e.key === 'ArrowDown' && row === last) {
    e.preventDefault()
    leave(dom, view, true)
  } else if (e.key === 'ArrowUp' && row === -1) {
    e.preventDefault()
    leave(dom, view, false)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    leave(dom, view, true)
  } else return
  e.stopPropagation()
}

/** Shows a cell's Markdown formatted, with the marks dimmed, as the editor does. */
function renderCell(cell: HTMLElement, text: string): void {
  cell.replaceChildren()
  for (const span of inlineSpans(text)) {
    if (span.marks.length === 0) {
      cell.append(span.text)
      continue
    }
    const mark = span.marks[0] ?? ''
    const closing = mark
    const box = document.createElement(span.code ? 'code' : 'span')
    box.className = [
      span.bold ? 'cm-table-bold' : '',
      span.italic ? 'cm-table-italic' : '',
      span.strike ? 'cm-table-strike' : ''
    ]
      .filter(Boolean)
      .join(' ')
    const open = document.createElement('span')
    open.className = 'cm-table-mark'
    open.textContent = mark
    const close = open.cloneNode() as HTMLElement
    close.textContent = closing
    box.append(span.text)
    cell.append(open, box, close)
  }
}

/** Builds (or rebuilds) everything inside a table's element from its model. */
function fill(dom: HTMLElement, view: EditorView): void {
  const state = live.get(dom)
  if (!state) return
  const { table } = state
  dom.replaceChildren()

  // Caption bar: the title on the left, size on the right, tools while editing.
  const bar = document.createElement('div')
  bar.className = 'cm-table-bar'
  const title = document.createElement('input')
  title.className = 'cm-table-title'
  title.placeholder = 'Table title'
  title.value = table.title
  title.setAttribute('aria-label', 'Table title')
  title.addEventListener('input', () => {
    state.table = { ...state.table, title: title.value }
    schedule(dom, view)
  })
  title.addEventListener('blur', () => commit(dom, view))
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
      e.preventDefault()
      focusCell(dom, -1, 0)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      leave(dom, view, true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      leave(dom, view, false)
    }
    e.stopPropagation()
  })

  const tools = document.createElement('span')
  tools.className = 'cm-table-tools'
  const rowAt = (): number => Math.max(state.row, 0)
  const alignNow = (): Align => state.table.align[state.col] ?? null
  tools.append(
    button('Add row below', '+ Row', () => change(dom, view, addRow(state.table, rowAt() + 1), rowAt() + 1, state.col)),
    button('Add column after', '+ Col', () =>
      change(dom, view, addColumn(state.table, state.col + 1), state.row, state.col + 1)
    ),
    button('Delete row', '− Row', () => {
      if (state.row < 0) return
      const next = removeRow(state.table, state.row)
      change(dom, view, next, Math.min(state.row, next.rows.length - 1), state.col)
    }),
    button('Delete column', '− Col', () => {
      const next = removeColumn(state.table, state.col)
      change(dom, view, next, state.row, Math.min(state.col, next.header.length - 1))
    }),
    button('Change column alignment', 'Align', () => {
      const next = NEXT_ALIGN[(NEXT_ALIGN.indexOf(alignNow()) + 1) % NEXT_ALIGN.length] ?? null
      change(dom, view, setAlign(state.table, state.col, next), state.row, state.col)
    }),
    button('Edit as Markdown', 'Source', () => {
      commit(dom, view)
      view.dispatch({ selection: { anchor: view.posAtDOM(dom) }, scrollIntoView: true })
      view.focus()
    })
  )

  const size = document.createElement('span')
  size.className = 'cm-table-size'
  size.textContent = `${table.header.length} × ${table.rows.length + 1}`
  bar.append(title, tools, size)

  const grid = document.createElement('table')
  const head = grid.createTHead().insertRow()
  const body = grid.createTBody()

  const makeCell = (cell: HTMLElement, text: string, row: number, col: number): void => {
    cell.contentEditable = 'plaintext-only'
    cell.spellcheck = true
    cell.dataset.row = String(row)
    cell.dataset.col = String(col)
    renderCell(cell, text)
    cell.style.textAlign = table.align[col] ?? ''
    const raw = (): string => (row === -1 ? state.table.header[col] : state.table.rows[row]?.[col]) ?? ''
    cell.addEventListener('focus', () => {
      state.row = row
      state.col = col
      dom.classList.add('editing')
      // While editing, the cell shows its Markdown as written.
      if (cell.querySelector('.cm-table-mark')) {
        cell.textContent = raw()
        const range = document.createRange()
        range.selectNodeContents(cell)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    })
    cell.addEventListener('blur', () => {
      renderCell(cell, raw())
      commit(dom, view)
      setTimeout(() => {
        if (!dom.contains(document.activeElement)) dom.classList.remove('editing')
      }, 0)
    })
    cell.addEventListener('input', () => {
      const value = (cell.textContent ?? '').replace(/\s*\n\s*/g, ' ')
      if (row === -1) state.table.header[col] = value
      else if (state.table.rows[row]) state.table.rows[row][col] = value
      schedule(dom, view)
    })
    cell.addEventListener('keydown', (e) => cellKeys(e, dom, view, row, col))
    cell.addEventListener('paste', (e) => {
      // One line of plain text: tables have no line breaks inside cells.
      e.preventDefault()
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ')
      document.execCommand('insertText', false, text)
    })
  }

  table.header.forEach((text, c) => {
    const th = document.createElement('th')
    makeCell(th, text, -1, c)
    head.append(th)
  })
  table.rows.forEach((cells, r) => {
    const tr = body.insertRow()
    for (let c = 0; c < table.header.length; c++) {
      const td = tr.insertCell()
      makeCell(td, cells[c] ?? '', r, c)
    }
  })

  dom.append(bar, grid)
}

function build(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  if (!text.includes('|')) return Decoration.none
  const head = state.selection.main.head
  const widgets: Range<Decoration>[] = []
  for (const block of findTables(text)) {
    const from = state.doc.line(block.from + 1).from
    const to = state.doc.line(block.to).to
    // With the cursor inside, the table shows as Markdown, ready to edit as text.
    if (head >= from && head <= to) continue
    widgets.push(
      Decoration.replace({
        widget: new TableWidget(block.table, to - from),
        block: true
      }).range(from, to)
    )
  }
  return Decoration.set(widgets)
}

const field = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    return tr.docChanged || tr.selection ? build(tr.state) : value
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Shows Markdown tables as editable grids; the cursor entering one shows its source. */
export const tableWidgets: Extension = [field]

/** Inserts an empty table at the cursor as its own block and moves into its first cell. */
export function insertTable(view: EditorView): void {
  const doc = view.state.doc
  const line = doc.lineAt(view.state.selection.main.head)
  const blank = line.text.trim() === ''
  const from = blank ? line.from : line.to
  const text = formatTable(newTable())
  const before = blank ? '' : '\n\n'
  const after = line.number === doc.lines ? '\n' : '\n\n'
  view.dispatch({
    changes: { from: blank ? line.from : line.to, to: line.to, insert: before + text + after },
    selection: { anchor: from + before.length + text.length + after.length },
    scrollIntoView: true
  })
  setTimeout(() => {
    const dom = [...view.dom.querySelectorAll<HTMLElement>('.cm-table')].find(
      (d) => view.posAtDOM(d) === from + before.length
    )
    if (dom) focusCell(dom, -1, 0)
  }, 0)
}
