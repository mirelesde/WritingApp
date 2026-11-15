import { describe, expect, it, vi } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import type { OpResult } from '../../preload/api'
import { MoveFlow } from './moveFlow.svelte'

const group = (path: string, children: GroupNode[] = []): GroupNode =>
  ({ kind: 'group', path, name: path.slice(path.lastIndexOf('/') + 1), children }) as GroupNode
const root = group('/L', [group('/L/A'), group('/L/B')])

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: { inTree?: boolean; selected?: string[]; group?: string; tree?: GroupNode } = {}) {
  const restore = vi.fn()
  const host = {
    tree: () => over.tree ?? root,
    selectedGroup: () => over.group ?? '/L/A',
    groupLabel: () => 'A',
    selectedSheets: () => over.selected ?? ['/L/A/x'],
    treeFocused: () => over.inTree ?? false,
    rememberFocus: () => restore,
    runOp: vi.fn(async (op: () => Promise<OpResult>) => op()),
    move: vi.fn(async () => ({}) as OpResult),
    expand: vi.fn(),
    clearSheets: vi.fn(),
    warn: vi.fn()
  }
  return { host, restore, flow: new MoveFlow(host) }
}

describe('MoveFlow', () => {
  it('offers the other groups for the selected sheets', () => {
    const { flow } = setup()
    flow.open()
    expect(flow.current?.heading).toBe('Move 1 sheet to…')
    expect(flow.current?.targets.map((t) => t.path)).toContain('/L/B')
  })

  it('moves a group when the tree has focus, but never the library itself', () => {
    const t = setup({ inTree: true })
    t.flow.open()
    expect(t.flow.current?.heading).toBe('Move “A” to…')
    const top = setup({ inTree: true, group: '/L' })
    top.flow.open()
    expect(top.flow.current).toBeNull()
  })

  it('does nothing with no sheets selected, and says when there is nowhere to go', () => {
    const none = setup({ selected: [] })
    none.flow.open()
    expect(none.flow.current).toBeNull()
    const lonely = setup({ tree: group('/L', [group('/L/A')]), inTree: true })
    lonely.flow.open()
    expect(lonely.flow.current).toBeNull()
    expect(lonely.host.warn).toHaveBeenCalledWith('There is nowhere else to move this.')
  })

  it('moves to the chosen group, then expands it and clears the list', async () => {
    const t = setup()
    t.flow.open()
    await t.flow.pick('/L/B')
    expect(t.host.move).toHaveBeenCalledWith(['/L/A/x'], '/L/B')
    expect(t.host.expand).toHaveBeenCalledWith('/L/B')
    expect(t.host.clearSheets).toHaveBeenCalled()
    expect(t.flow.current).toBeNull()
    expect(t.restore).toHaveBeenCalled()
  })

  it('keeps the list when a group was moved, and does not expand after a failure', async () => {
    const g = setup({ inTree: true })
    g.flow.open()
    await g.flow.pick('/L/B')
    expect(g.host.clearSheets).not.toHaveBeenCalled()
    const bad = setup()
    bad.host.runOp.mockResolvedValueOnce(undefined as never)
    bad.flow.open()
    await bad.flow.pick('/L/B')
    expect(bad.host.expand).not.toHaveBeenCalled()
  })

  it('closes and gives the focus back', () => {
    const t = setup()
    t.flow.open()
    t.flow.close()
    expect([t.flow.current, t.restore.mock.calls.length]).toEqual([null, 1])
  })
})
