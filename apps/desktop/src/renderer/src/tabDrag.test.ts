import { describe, expect, it, vi } from 'vitest'
import { TabsState } from './tabsState.svelte'
import { TabDrag, type TabDragHost } from './tabDrag'

const TAB = 'application/x-writingapp-tab'
const DIRTY = 'application/x-writingapp-unsaved'

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(paths = ['/L/a', '/L/b', '/L/c'], dirty: string[] = []) {
  const tabs = new TabsState()
  tabs.list = [...paths]
  const host = {
    hasChanges: (p: string) => dirty.includes(p),
    sheetExists: (p: string) => p.startsWith('/L/'),
    show: vi.fn(async () => undefined),
    close: vi.fn(),
    newWindow: vi.fn(async () => undefined),
    windowSize: () => ({ width: 1000, height: 700 })
  } satisfies TabDragHost
  return { tabs, host, drag: new TabDrag(tabs, host) }
}

const bar = (index: number, left: number, width: number): HTMLElement =>
  ({ dataset: { tab: String(index) }, getBoundingClientRect: () => ({ left, width }) }) as unknown as HTMLElement
const target = (tab: HTMLElement | null): HTMLElement => ({ closest: () => tab }) as unknown as HTMLElement

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function dt(types: string[], data: Record<string, string> = {}, dropEffect = 'none') {
  return {
    types,
    dropEffect,
    effectAllowed: '',
    setData: (k: string, v: string) => (data[k] = v),
    getData: (k: string) => data[k] ?? ''
  }
}
const ev = (over: object): DragEvent => ({ preventDefault: vi.fn(), clientX: 0, clientY: 0, screenX: 5, screenY: 6, ...over }) as unknown as DragEvent

describe('TabDrag', () => {
  it('marks a tab with unsaved changes as one only this window can take', () => {
    const { drag, tabs } = setup(undefined, ['/L/b'])
    const data: Record<string, string> = {}
    drag.start(1, ev({ dataTransfer: dt([], data) }))
    expect(data[TAB]).toBe('/L/b')
    expect(data[DIRTY]).toBe('1')
    expect(tabs.dragFrom).toBe(1)
  })

  it('shows where a drop would land: before or after the tab under the pointer', () => {
    const { drag, tabs } = setup()
    const t = target(bar(1, 100, 100))
    drag.over(ev({ target: t, clientX: 120, dataTransfer: dt([TAB]) }))
    expect(tabs.hint).toBe(1)
    drag.over(ev({ target: t, clientX: 180, dataTransfer: dt([TAB]) }))
    expect(tabs.hint).toBe(2)
    drag.over(ev({ target: target(null), dataTransfer: dt([TAB]) }))
    expect(tabs.hint).toBe(3)
  })

  it('ignores drags that are not tabs, and unsaved tabs from other windows', () => {
    const { drag, tabs } = setup()
    drag.over(ev({ target: target(null), dataTransfer: dt(['text/plain']) }))
    drag.over(ev({ target: target(null), dataTransfer: dt([TAB, DIRTY]) }))
    expect(tabs.hint).toBeNull()
  })

  it('reorders within the window', async () => {
    const { drag, tabs } = setup()
    drag.start(0, ev({ dataTransfer: dt([], {}) }))
    await drag.drop(ev({ target: target(null), dataTransfer: dt([TAB], { [TAB]: '/L/a' }) }))
    expect(tabs.list).toEqual(['/L/b', '/L/c', '/L/a'])
  })

  it('takes a tab brought from another window, if the sheet is in this library', async () => {
    const { drag, tabs, host } = setup()
    await drag.drop(ev({ target: target(bar(0, 0, 100)), clientX: 10, dataTransfer: dt([TAB], { [TAB]: '/L/z' }) }))
    expect(tabs.list[0]).toBe('/L/z')
    expect(host.show).toHaveBeenCalledWith(0)
    const other = setup()
    await other.drag.drop(ev({ target: target(null), dataTransfer: dt([TAB], { [TAB]: '/Elsewhere/q' }) }))
    expect(other.tabs.list).toHaveLength(3)
  })

  it('closes the tab when another window took it', () => {
    const { drag, host } = setup()
    drag.start(1, ev({ dataTransfer: dt([], {}) }))
    drag.end(ev({ clientX: 50, clientY: 50, dataTransfer: dt([], {}, 'move') }))
    expect(host.close).toHaveBeenCalledWith(1)
  })

  it('opens a window when dropped on the desktop, unless it has unsaved changes', () => {
    const a = setup()
    a.drag.start(1, ev({ dataTransfer: dt([], {}) }))
    a.drag.end(ev({ clientX: -20, clientY: 50, dataTransfer: dt([], {}) }))
    expect(a.host.newWindow).toHaveBeenCalledWith('/L/b', { x: 5, y: 6 })
    expect(a.host.close).toHaveBeenCalledWith(1)
    const b = setup(undefined, ['/L/b'])
    b.drag.start(1, ev({ dataTransfer: dt([], {}) }))
    b.drag.end(ev({ clientX: -20, clientY: 50, dataTransfer: dt([], {}) }))
    expect(b.host.newWindow).not.toHaveBeenCalled()
  })

  it('leaves a lone tab alone when dropped outside', () => {
    const { drag, host } = setup(['/L/a'])
    drag.start(0, ev({ dataTransfer: dt([], {}) }))
    drag.end(ev({ clientX: -20, clientY: 50, dataTransfer: dt([], {}) }))
    expect(host.newWindow).not.toHaveBeenCalled()
  })
})
