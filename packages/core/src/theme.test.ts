import { describe, expect, it } from 'vitest'
import { parseColorTheme } from './theme'
import { parseViewSettings } from './viewSettings'

describe('parseColorTheme', () => {
  it('reads a theme and keeps only valid colours', () => {
    const t = parseColorTheme(
      'sepia',
      JSON.stringify({ name: ' Sepia ', mode: 'light', colors: { bg: '#F4ECD8', text: 'red', nope: '#000000' } })
    )
    expect(t).toEqual({ id: 'sepia', name: 'Sepia', mode: 'light', colors: { bg: '#f4ecd8' } })
  })
  it('falls back to the id for a name and ignores a bad mode', () => {
    expect(parseColorTheme('x', '{"mode":"blue","colors":{"accent":"#112233"}}')).toEqual({
      id: 'x',
      name: 'x',
      colors: { accent: '#112233' }
    })
  })
  it('rejects broken or empty files', () => {
    expect(parseColorTheme('x', 'not json')).toBeNull()
    expect(parseColorTheme('x', '{"colors":{"bg":"blue"}}')).toBeNull()
    expect(parseColorTheme('x', '[]')).toBeNull()
  })
})

describe('accent and theme settings', () => {
  it('accepts hex accents and theme ids only', () => {
    expect(parseViewSettings({ accent: '#ABCDEF' }).accent).toBe('#abcdef')
    expect(parseViewSettings({ accent: '' }).accent).toBe('')
    expect(parseViewSettings({ accent: 'red' }).accent).toBeUndefined()
    expect(parseViewSettings({ colorTheme: 'my theme-1' }).colorTheme).toBe('my theme-1')
    expect(parseViewSettings({ colorTheme: '../evil' }).colorTheme).toBeUndefined()
  })
})
