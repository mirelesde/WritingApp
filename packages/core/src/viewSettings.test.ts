import { describe, expect, it } from 'vitest'
import { editorFontStack, clampFontSize, clampLineSpacing, DEFAULT_VIEW, parseViewSettings, resolveView } from './viewSettings'

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

describe('open sheets in', () => {
  it('defaults to the same tab, and keeps only a known choice', () => {
    expect(resolveView().openSheetIn).toBe('same')
    expect(parseViewSettings({ openSheetIn: 'window' })).toEqual({ openSheetIn: 'window' })
    expect(parseViewSettings({ openSheetIn: 'elsewhere' })).toEqual({})
  })
})

describe('group counts', () => {
  it('are shown by default, and keep only a boolean', () => {
    expect(resolveView().groupCounts).toBe(true)
    expect(parseViewSettings({ groupCounts: false })).toEqual({ groupCounts: false })
    expect(parseViewSettings({ groupCounts: 'no' })).toEqual({})
  })
})

describe('saving settings', () => {
  it('default to saving automatically with the indicator shown', () => {
    expect(resolveView().saveMode).toBe('auto')
    expect(resolveView().saveIndicator).toBe(true)
  })
  it('keep a valid mode and a boolean indicator, and drop anything else', () => {
    expect(parseViewSettings({ saveMode: 'switch', saveIndicator: false })).toEqual({ saveMode: 'switch', saveIndicator: false })
    expect(parseViewSettings({ saveMode: 'sometimes', saveIndicator: 0 })).toEqual({})
  })
  it('reads the old autosave-off setting as saving on switch', () => {
    expect(parseViewSettings({ autosave: false })).toEqual({ saveMode: 'switch' })
    expect(parseViewSettings({ autosave: true })).toEqual({})
    expect(parseViewSettings({ autosave: false, saveMode: 'auto' })).toEqual({ saveMode: 'auto' })
  })
})

describe('interface font', () => {
  it('defaults to Onest and accepts only the bundled fonts', () => {
    expect(resolveView().uiFont).toBe('onest')
    expect(parseViewSettings({ uiFont: 'public-sans' })).toEqual({ uiFont: 'public-sans' })
    expect(parseViewSettings({ uiFont: 'comic-sans' })).toEqual({})
  })
})

describe('editor font', () => {
  it('takes an installed font by name, and builds a stack from it', () => {
    const view = resolveView({ font: 'custom', fontCustom: 'Avenir Next' })
    expect(editorFontStack(view).startsWith("'Avenir Next', ")).toBe(true)
    expect(parseViewSettings({ fontCustom: 'Avenir Next' })).toEqual({ fontCustom: 'Avenir Next' })
  })
  it('refuses names that could break out of the stack', () => {
    expect(parseViewSettings({ fontCustom: "x'; color: red" })).toEqual({})
    expect(editorFontStack({ font: 'custom', fontCustom: '' })).toBe(editorFontStack({ font: 'sans', fontCustom: '' }))
  })
})
