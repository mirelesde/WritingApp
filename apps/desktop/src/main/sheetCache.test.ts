import { describe, expect, it } from 'vitest'
import { parseSheetCache, serializeSheetCache } from './sheetCache'

const entry = { title: 'A', preview: 'p', words: 3, images: ['a.png'], links: ['B'], modified: 10, size: 20 }

describe('sheet cache file', () => {
  it('round-trips', () => {
    const cache = new Map([['/Lib/a.md', entry]])
    expect([...parseSheetCache(serializeSheetCache('/Lib', cache), '/Lib')]).toEqual([['/Lib/a.md', entry]])
  })

  it('ignores a cache saved for another library', () => {
    const text = serializeSheetCache('/Other', new Map([['/Other/a.md', entry]]))
    expect(parseSheetCache(text, '/Lib').size).toBe(0)
  })

  it('survives damage and bad entries', () => {
    expect(parseSheetCache('{not json', '/Lib').size).toBe(0)
    expect(parseSheetCache('[]', '/Lib').size).toBe(0)
    const text = JSON.stringify({
      version: 3,
      root: '/Lib',
      entries: [['/Lib/a.md', entry], ['/Lib/b.md', { title: 1 }], 'x'],
    })
    expect([...parseSheetCache(text, '/Lib').keys()]).toEqual(['/Lib/a.md'])
  })

  it('drops a cache from before pictures were indexed', () => {
    const text = JSON.stringify({ version: 1, root: '/Lib', entries: [['/Lib/a.md', entry]] })
    expect(parseSheetCache(text, '/Lib').size).toBe(0)
  })
})
