import { describe, expect, it } from 'vitest'
import { findTables, formatTable, newTable, splitRow } from './table'

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
