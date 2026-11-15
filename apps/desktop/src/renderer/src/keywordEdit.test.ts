import { describe, expect, it, vi } from 'vitest'
import type { OpResult } from '../../preload/api'
import { KeywordEdit } from './keywordEdit.svelte'

const sheets = [
  { path: 'a', title: 'A', keywords: ['x'] },
  { path: 'b', title: 'B', keywords: [] }
]

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(selected: string[]) {
  const host = {
    sheets: () => sheets,
    selected: () => selected,
    warn: vi.fn(),
    runOp: vi.fn(async (op: () => Promise<OpResult>) => op()),
    change: vi.fn(async () => ({}) as OpResult)
  }
  return { host, edit: new KeywordEdit(host) }
}

describe('KeywordEdit', () => {
  it('opens for the selected sheets, with copies of their keywords', () => {
    const t = setup(['a'])
    t.edit.open()
    expect(t.edit.current).toEqual([{ path: 'a', title: 'A', keywords: ['x'] }])
    t.edit.current![0]!.keywords.push('y')
    expect(sheets[0]!.keywords).toEqual(['x'])
  })

  it('asks for a selection first', () => {
    const t = setup([])
    t.edit.open()
    expect(t.edit.current).toBeNull()
    expect(t.host.warn).toHaveBeenCalledWith('Select a sheet first.')
  })

  it('applies the change to the sheets it was opened for, and closes', async () => {
    const t = setup(['a', 'b'])
    t.edit.open()
    await t.edit.apply(['new'], ['x'])
    expect(t.host.change).toHaveBeenCalledWith(['a', 'b'], ['new'], ['x'])
    expect(t.edit.current).toBeNull()
  })

  it('closes without changing anything', () => {
    const t = setup(['a'])
    t.edit.open()
    t.edit.close()
    expect(t.edit.current).toBeNull()
    expect(t.host.change).not.toHaveBeenCalled()
  })
})
