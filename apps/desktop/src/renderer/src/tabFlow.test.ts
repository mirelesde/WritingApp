import { describe, expect, it, vi } from 'vitest'
import { TabFlow } from './tabFlow'
import { TabsState } from './tabsState.svelte'

function setup(open: string[] = ['a', 'b', 'c'], ok = true): { tabs: TabsState; flow: TabFlow; shown: string[]; closeWindow: () => void; resolve: ReturnType<typeof vi.fn> } {
  const tabs = new TabsState()
  tabs.list = open
  tabs.active = 0
  const shown: string[] = []
  const resolve = vi.fn(async () => ok)
  const closeWindow = vi.fn()
  const flow = new TabFlow(tabs, {
    only: () => 'b',
    reveal: async (p) => void shown.push(p),
    runFor: (p) => [p],
    resolveUnsaved: resolve,
    closeWindow
  })
  return { tabs, flow, shown, closeWindow, resolve }
}

describe('TabFlow', () => {
  it('shows the sheet of the tab chosen', async () => {
    const { flow, shown, tabs } = setup()
    await flow.show(2)
    expect([shown, tabs.active]).toEqual([['c'], 2])
  })

  it('switches to a tab that already has the sheet', async () => {
    const { flow, shown, tabs } = setup()
    await flow.open('c')
    expect([shown, tabs.list.length]).toEqual([['c'], 3])
  })

  it('opens a new tab for the selected sheet', async () => {
    const { flow, tabs } = setup()
    flow.newTab()
    await vi.waitFor(() => expect(tabs.list).toHaveLength(4))
  })

  it('cycles to the next tab', async () => {
    const { flow, shown } = setup()
    flow.cycle(1)
    await vi.waitFor(() => expect(shown).toEqual(['b']))
  })

  it('asks before closing a tab, and keeps it when cancelled', async () => {
    const { flow, tabs, resolve } = setup(['a', 'b'], false)
    await flow.close(1)
    expect(resolve).toHaveBeenCalledWith(['b'], 'tab')
    expect(tabs.list).toEqual(['a', 'b'])
  })

  it('closes the tab, and shows the one left in front', async () => {
    const { flow, tabs, shown } = setup(['a', 'b'])
    await flow.close(1)
    expect([tabs.list, shown]).toEqual([['a'], []]) // a tab behind the front one: nothing to show
    const front = setup(['a', 'b'])
    await front.flow.close(0)
    await vi.waitFor(() => expect(front.shown).toEqual(['b']))
  })

  it('closes the window when closing the last tab', async () => {
    const { flow, closeWindow, resolve } = setup(['a'])
    await flow.close(0)
    expect(closeWindow).toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })
})
