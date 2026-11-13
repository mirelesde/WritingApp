/** Alignment of a column, from the colons in the delimiter row. */
export type Align = 'left' | 'center' | 'right' | null

export interface Table {
  /** A caption written as a `Table: …` line above the table, if there is one. */
  title: string
  header: string[]
  align: Align[]
  rows: string[][]
}

/** A table found in a document, as a range of lines (zero-based, `to` exclusive). */
export interface TableBlock {
  from: number
  to: number
  table: Table
}

const DELIMITER_CELL = /^\s*:?-+:?\s*$/
const CAPTION = /^Table:\s*(.*)$/

/** Splits a row into cells. `\|` stays inside a cell; the outer pipes are optional. */
export function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '\\|'
      i++
    } else if (text[i] === '|') {
      cells.push(current.trim())
      current = ''
    } else current += text[i]
  }
  cells.push(current.trim())
  return cells
}

function isDelimiter(line: string): boolean {
  if (!line.includes('-')) return false
  const cells = splitRow(line)
  return cells.every((c) => DELIMITER_CELL.test(c))
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null
}

/** Every GFM table in the text, with its caption line (if any) included in the range. */
export function findTables(text: string): TableBlock[] {
  const lines = text.split(/\r?\n/)
  const at = (i: number): string => lines[i] ?? ''
  const found: TableBlock[] = []
  let fence = false
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s{0,3}(```|~~~)/.test(at(i))) fence = !fence
    if (fence) continue
    if (!at(i).includes('|') || !isDelimiter(at(i + 1))) continue
    const header = splitRow(at(i))
    const delimiter = splitRow(at(i + 1))
    if (header.length !== delimiter.length) continue
    let end = i + 2
    while (end < lines.length && at(end).trim() !== '' && at(end).includes('|')) end++
    const columns = header.length
    const rows = lines.slice(i + 2, end).map((line) => {
      const cells = splitRow(line).slice(0, columns)
      while (cells.length < columns) cells.push('')
      return cells
    })
    let from = i
    let title = ''
    let above = from - 1
    if (above >= 0 && at(above).trim() === '') above--
    if (above >= 0) {
      const caption = CAPTION.exec(at(above))
      if (caption) {
        title = (caption[1] ?? '').trim()
        from = above
      }
    }
    found.push({ from, to: end, table: { title, header, align: delimiter.map(alignOf), rows } })
    i = end - 1
  }
  return found
}

function delimiterCell(align: Align, width: number): string {
  const dashes = '-'.repeat(Math.max(3, width))
  if (align === 'center') return ':' + dashes.slice(2) + ':'
  if (align === 'left') return ':' + dashes.slice(1)
  if (align === 'right') return dashes.slice(1) + ':'
  return dashes
}

/** Clean Markdown for a table: columns padded to line up, caption above when titled. */
export function formatTable(table: Table): string {
  const columns = Math.max(1, table.header.length)
  const cell = (row: string[], c: number): string =>
    (row[c] ?? '').replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim()
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(3, cell(table.header, c).length, ...table.rows.map((r) => cell(r, c).length))
  )
  const pad = (text: string, c: number): string => {
    const gap = (widths[c] ?? 3) - text.length
    const align = table.align[c] ?? null
    if (align === 'right') return ' '.repeat(gap) + text
    if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2))
    return text + ' '.repeat(gap)
  }
  const row = (cells: string[]): string =>
    '| ' + Array.from({ length: columns }, (_, c) => pad(cell(cells, c), c)).join(' | ') + ' |'
  const delimiter =
    '| ' +
    Array.from({ length: columns }, (_, c) => delimiterCell(table.align[c] ?? null, widths[c] ?? 3)).join(' | ') +
    ' |'
  const lines = [row(table.header), delimiter, ...table.rows.map(row)]
  const title = table.title.trim()
  return (title === '' ? lines : [`Table: ${title}`, '', ...lines]).join('\n')
}

/** A fresh table of the given size, with column names to start from. */
export function newTable(columns = 3, rows = 2): Table {
  return {
    title: '',
    header: Array.from({ length: columns }, (_, c) => `Column ${c + 1}`),
    align: Array.from({ length: columns }, () => null),
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''))
  }
}

/** The table with an empty row inserted at `at` (the end by default). */
export function addRow(table: Table, at = table.rows.length): Table {
  const rows = table.rows.map((r) => [...r])
  rows.splice(at, 0, table.header.map(() => ''))
  return { ...table, rows }
}

/** The table with a new column inserted at `at` (the end by default). */
export function addColumn(table: Table, at = table.header.length): Table {
  const header = [...table.header]
  const align = [...table.align]
  header.splice(at, 0, `Column ${header.length + 1}`)
  align.splice(at, 0, null)
  const rows = table.rows.map((r) => {
    const row = [...r]
    row.splice(at, 0, '')
    return row
  })
  return { ...table, header, align, rows }
}

/** The table without row `index`. */
export function removeRow(table: Table, index: number): Table {
  return { ...table, rows: table.rows.filter((_, i) => i !== index) }
}

/** The table without column `index`; the last column is never removed. */
export function removeColumn(table: Table, index: number): Table {
  if (table.header.length <= 1) return table
  const without = <T>(list: T[]): T[] => list.filter((_, i) => i !== index)
  return {
    ...table,
    header: without(table.header),
    align: without(table.align),
    rows: table.rows.map(without)
  }
}

/** The table with column `index` aligned as given. */
export function setAlign(table: Table, index: number, align: Align): Table {
  const next = [...table.align]
  next[index] = align
  return { ...table, align: next }
}
