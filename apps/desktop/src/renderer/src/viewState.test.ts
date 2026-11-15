import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW } from '@writingapp/core'
import { ViewState } from './viewState.svelte'

let sent: unknown[]
let view: ViewState

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  view = new ViewState((change) => sent.push(change))
})
afterEach(() => vi.useRealTimers())

describe('ViewState', () => {
  it('takes the saved settings', () => {
    view.apply({
      ...DEFAULT_VIEW,
      sidebarCollapsed: true,
      sheetsCollapsed: true,
      outline: true,
      focusMode: true,
      typewriter: true,
      lineNumbers: true
    })
    expect([view.sidebarCollapsed, view.sheetsCollapsed, view.outlineOpen]).toEqual([
      true,
      true,
      true
    ])
    expect([view.focusMode, view.typewriter, view.lineNumbers]).toEqual([true, true, true])
  })

  it('asks for the opposite of the current setting, leaving the change to come back as settings', () => {
    view.toggleOutline()
    view.toggleSheets()
    view.toggleSidebar()
    expect(sent).toEqual([{ outline: true }, { sheetsCollapsed: true }, { sidebarCollapsed: true }])
    expect(view.outlineOpen).toBe(false)
  })

  it('hides the sidebar in distraction-free mode and back', () => {
    expect(view.sidebarHidden).toBe(false)
    expect(view.toggleZen()).toBe(true)
    expect(view.sidebarHidden).toBe(true)
    expect(view.toggleZen()).toBe(false)
    expect(view.sidebarHidden).toBe(false)
  })

  it('peeks only while the sidebar is hidden, and lets go after a moment', () => {
    view.peek()
    expect(view.sidebarPeek).toBe(false)
    view.sidebarCollapsed = true
    view.peek()
    expect(view.sidebarPeek).toBe(true)
    view.unpeek()
    vi.advanceTimersByTime(200)
    expect(view.sidebarPeek).toBe(true)
    vi.advanceTimersByTime(100)
    expect(view.sidebarPeek).toBe(false)
  })

  it('keeps the peek when the pointer comes back in time', () => {
    view.sidebarCollapsed = true
    view.peek()
    view.unpeek()
    vi.advanceTimersByTime(200)
    view.peek()
    vi.advanceTimersByTime(500)
    expect(view.sidebarPeek).toBe(true)
  })

  it('ends the peek when the settings show the sidebar for good', () => {
    view.sidebarCollapsed = true
    view.peek()
    view.apply({ ...DEFAULT_VIEW, sidebarCollapsed: false })
    expect(view.sidebarPeek).toBe(false)
  })

  it('keeps the settings it was given', () => {
    expect(view.settings).toBeNull()
    const saved = { ...DEFAULT_VIEW, colorTheme: 'night' }
    view.apply(saved)
    expect(view.settings).toBe(saved)
  })

  it('saves what was typed when autosave is turned back on, and only then', () => {
    const turnedOn = vi.fn()
    const v = new ViewState(() => {}, turnedOn)
    v.apply({ ...DEFAULT_VIEW, saveMode: 'auto' }) // the first settings: nothing was off
    v.apply({ ...DEFAULT_VIEW, saveMode: 'manual' })
    expect(turnedOn).not.toHaveBeenCalled()
    v.apply({ ...DEFAULT_VIEW, saveMode: 'auto' })
    expect(turnedOn).toHaveBeenCalledTimes(1)
    v.apply({ ...DEFAULT_VIEW, saveMode: 'auto' })
    expect(turnedOn).toHaveBeenCalledTimes(1)
  })

  it('puts the cursor in the text when distraction-free mode turns on, not off', () => {
    const zenOn = vi.fn()
    const v = new ViewState(() => {}, () => {}, zenOn)
    v.toggleZen()
    expect(zenOn).toHaveBeenCalledTimes(1)
    v.toggleZen()
    expect(zenOn).toHaveBeenCalledTimes(1)
  })
})
