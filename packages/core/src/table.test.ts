import { describe, expect, it } from 'vitest'
import {
  addColumn,
  addRow,
  findTables,
  formatTable,
  newTable,
  removeColumn,
  removeRow,
  setAlign,
  splitRow
} from './table'

const SAMPLE = 'Intro\n\n| Name | Qty |\n| :--- | ---: |\n| Tea | 2 |\n| Milk | 10 |\n\nAfter'

describe('splitRow', () => {
  it('handles optional outer pipes and escaped pipes', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b'])
    expect(splitRow('a | b')).toEqual(['a', 'b'])
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c'])
  })
})

describe('findTables', () => {
  it('finds a table with alignment and rows', () => {
    const block = findTables(SAMPLE)[0]!
    expect(block.from).toBe(2)
    expect(block.to).toBe(6)
    expect(block.table.header).toEqual(['Name', 'Qty'])
    expect(block.table.align).toEqual(['left', 'right'])
    expect(block.table.rows).toEqual([['Tea', '2'], ['Milk', '10']])
  })

  it('pads short rows and ignores tables in code fences', () => {
    expect(findTables('a | b\n--- | ---\nx |').at(0)?.table.rows).toEqual([['x', '']])
    expect(findTables('```\na | b\n--- | ---\n1 | 2\n```')).toEqual([])
  })

  it('includes a Table: caption line', () => {
    const block = findTables('Table: Stock\n\n| a |\n| - |\n| 1 |')[0]!
    expect(block.from).toBe(0)
    expect(block.table.title).toBe('Stock')
  })

  it('is not fooled by a pipe line with no delimiter row', () => {
    expect(findTables('a | b\nplain')).toEqual([])
  })
})

describe('formatTable', () => {
  it('lines columns up and round-trips', () => {
    const block = findTables(SAMPLE)[0]!
    const text = formatTable(block.table)
    expect(text).toBe(
      '| Name | Qty |\n| :--- | --: |\n| Tea  |   2 |\n| Milk |  10 |'
    )
    expect(findTables(text)[0]!.table).toEqual(block.table)
  })

  it('writes a title as a caption', () => {
    const text = formatTable({ ...newTable(1, 0), title: 'Stock' })
    expect(text.startsWith('Table: Stock\n')).toBe(true)
    expect(findTables(text)[0]!.table.title).toBe('Stock')
  })
})

describe('formatTable escaping', () => {
  it('escapes a pipe typed into a cell', () => {
    const t = { ...newTable(2, 1), header: ['a', 'b'], rows: [['x | y', 'z']] }
    const text = formatTable(t)
    expect(text).toContain('x \\| y')
    expect(findTables(text)[0]!.table.rows[0]).toEqual(['x \\| y', 'z'])
  })
})

describe('table edits', () => {
  const t = { ...newTable(2, 2), header: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }

  it('adds and removes rows', () => {
    expect(addRow(t, 1).rows).toEqual([['1', '2'], ['', ''], ['3', '4']])
    expect(addRow(t).rows.length).toBe(3)
    expect(removeRow(t, 0).rows).toEqual([['3', '4']])
  })

  it('adds and removes columns, keeping alignment in step', () => {
    const aligned = setAlign(t, 1, 'right')
    const wider = addColumn(aligned, 1)
    expect(wider.header).toEqual(['a', 'Column 3', 'b'])
    expect(wider.align).toEqual([null, null, 'right'])
    expect(wider.rows[0]).toEqual(['1', '', '2'])
    const narrower = removeColumn(aligned, 0)
    expect(narrower.header).toEqual(['b'])
    expect(narrower.align).toEqual(['right'])
    expect(removeColumn(narrower, 0)).toBe(narrower)
  })

  it('leaves the original alone', () => {
    addRow(t)
    removeColumn(t, 0)
    expect(t.rows.length).toBe(2)
    expect(t.header.length).toBe(2)
  })
})
