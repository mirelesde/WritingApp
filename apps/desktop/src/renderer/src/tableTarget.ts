import type { Table } from '@writingapp/core'

/** Where a table editor's result goes: replace `from`–`to` with the table, padded by `before`/`after`. */
export interface TableTarget {
  table: Table
  isNew: boolean
  from: number
  to: number
  before: string
  after: string
}
