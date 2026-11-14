import { describe, expect, it } from 'vitest'
import { clampFontSize, clampLineSpacing, DEFAULT_VIEW, parseViewSettings, resolveView } from './viewSettings'

describe('parseViewSettings', () => {
  it('keeps valid fields', () => {
    expect(
      parseViewSettings({ theme: 'dark', font: 'mono', fontSize: 20, sidebarCollapsed: true, outline: true, focusMode: true, typewriter: true, lineNumbers: true })
    ).toEqual({
      theme: 'dark',
      font: 'mono',
      fontSize: 20,
      sidebarCollapsed: true,
      outline: true,
      focusMode: true,
      typewriter: true,
      lineNumbers: true,
    })
  })

  it('drops invalid fields and unknown keys', () => {
    expect(
      parseViewSettings({ theme: 'neon', font: 3, fontSize: 'big', sidebarCollapsed: 'yes', outline: 1, focusMode: 'on', typewriter: 0, lineNumbers: 'yes', x: 1 })
    ).toEqual({})
  })

  it('clamps the font size', () => {
    expect(parseViewSettings({ fontSize: 2 }).fontSize).toBe(12)
    expect(parseViewSettings({ fontSize: 999 }).fontSize).toBe(32)
    expect(clampFontSize(17.6)).toBe(18)
  })

  it('rejects things that are not objects', () => {
    expect(parseViewSettings(null)).toEqual({})
    expect(parseViewSettings('dark')).toEqual({})
    expect(parseViewSettings({ fontSize: NaN })).toEqual({})
  })
})

describe('resolveView', () => {
  it('fills in the defaults', () => {
    expect(resolveView()).toEqual(DEFAULT_VIEW)
    expect(resolveView({ theme: 'light' })).toEqual({ ...DEFAULT_VIEW, theme: 'light' })
  })
})

describe('writing comfort settings', () => {
  it('keeps valid choices and drops unknown ones', () => {
    expect(
      parseViewSettings({
        columnWidth: 'wide',
        paragraphSpacing: 'airy',
        currentLine: 'subtle',
        caretWidth: 'thick',
        focusScope: 'sentence',
        focusDim: 'strong',
        typewriterPosition: 'upper',
        textAlign: 'justify',
        scrollPastEnd: false,
        smartTypography: true,
        hideMarkers: true,
        lineSpacing: 2
      })
    ).toEqual({
      columnWidth: 'wide',
      paragraphSpacing: 'airy',
      currentLine: 'subtle',
      caretWidth: 'thick',
      focusScope: 'sentence',
      focusDim: 'strong',
      typewriterPosition: 'upper',
      textAlign: 'justify',
      scrollPastEnd: false,
      smartTypography: true,
      hideMarkers: true,
      lineSpacing: 2
    })
    expect(
      parseViewSettings({ columnWidth: 'huge', focusScope: 3, textAlign: 'right', scrollPastEnd: 'no' })
    ).toEqual({})
  })

  it('clamps and rounds the line spacing to steps of 0.05', () => {
    expect(clampLineSpacing(0.5)).toBe(1.3)
    expect(clampLineSpacing(9)).toBe(2.4)
    expect(clampLineSpacing(1.87)).toBe(1.85)
    expect(parseViewSettings({ lineSpacing: Infinity })).toEqual({})
  })
})
