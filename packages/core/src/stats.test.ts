import { describe, expect, it } from 'vitest'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { loadLibrary } from './library'
import { countWords, groupWordCount, textStats } from './stats'

describe('countWords', () => {
  it('counts words separated by any whitespace', () => {
    expect(countWords('one two\nthree\t four')).toBe(4)
  })

  it('is zero for empty or blank text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\n ')).toBe(0)
  })

  it('does not count Markdown markers on their own', () => {
    expect(countWords('# Title\n\n- item\n\n> quote\n\n---')).toBe(3)
  })

  it('leaves commented-out text out', () => {
    expect(countWords('one <!-- two three --> four')).toBe(2)
    expect(textStats('a <!-- hidden -->').characters).toBe(2)
  })

  it('counts numbers, hyphenated words and accented words', () => {
    expect(countWords('42 well-known café')).toBe(3)
  })
})

describe('textStats', () => {
  it('counts characters without line breaks', () => {
    expect(textStats('ab\ncd\r\nef').characters).toBe(6)
  })

  it('counts an emoji as one character', () => {
    expect(textStats('a😀b').characters).toBe(3)
  })

  it('rounds reading time, with a one minute floor for any text', () => {
    expect(textStats('').minutes).toBe(0)
    expect(textStats('hello world').minutes).toBe(1)
    expect(textStats('word '.repeat(460)).minutes).toBe(2)
  })
})

describe('groupWordCount', () => {
  it('adds up the sheets of a group and its sub-groups', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/proj/a.md': 'one two three',
      '/Lib/proj/sub/b.md': '# Four five',
    })
    const root = await loadLibrary(fs, '/Lib')
    expect(groupWordCount(root)).toBe(5)
    expect(groupWordCount(root.children[0] as never)).toBe(5)
  })
})

describe('images in counts', () => {
  it('does not count an image link as words', async () => {
    const { countWords } = await import('./stats')
    expect(countWords('one ![a cat](cat.png) two')).toBe(2)
  })
})
