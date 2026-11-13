import { describe, expect, it } from 'vitest'
import { isSheetInside, toPosix } from './paths'

describe('toPosix', () => {
  it('turns backslashes into slashes', () => {
    expect(toPosix('C:\\Users\\me\\Lib')).toBe('C:/Users/me/Lib')
    expect(toPosix('/already/fine')).toBe('/already/fine')
  })
})

describe('isSheetInside', () => {
  const root = '/Users/me/Lib'

  it('accepts markdown files inside the library', () => {
    expect(isSheetInside(root, '/Users/me/Lib/a.md')).toBe(true)
    expect(isSheetInside(root, '/Users/me/Lib/Novel/Part One/a.md')).toBe(true)
  })

  it('rejects other file types, the root itself and sibling folders', () => {
    expect(isSheetInside(root, '/Users/me/Lib/a.txt')).toBe(false)
    expect(isSheetInside(root, '/Users/me/Lib')).toBe(false)
    expect(isSheetInside(root, '/Users/me/Library/a.md')).toBe(false)
  })

  it('rejects traversal out of the library', () => {
    expect(isSheetInside(root, '/Users/me/Lib/../secret.md')).toBe(false)
    expect(isSheetInside(root, '/Users/me/Lib/a/../../x.md')).toBe(false)
  })

  it('works when the library is the filesystem root', () => {
    expect(isSheetInside('/', '/a.md')).toBe(true)
  })
})
