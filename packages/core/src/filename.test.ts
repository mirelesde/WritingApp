import { describe, expect, it } from 'vitest'
import { readableName, sheetFileName, slugify, stemFitsTitle } from './filename'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('The Station')).toBe('the-station')
  })

  it('collapses punctuation and trims hyphens', () => {
    expect(slugify('  --Hello,   World!?  ')).toBe('hello-world')
  })

  it('strips accents but keeps other scripts', () => {
    expect(slugify('Café Müller')).toBe('cafe-muller')
    expect(slugify('夜の駅')).toBe('夜の駅')
  })

  it('removes path separators and other unsafe characters', () => {
    expect(slugify('a/b\\c:d*e?"<>|')).toBe('a-b-c-d-e')
    expect(slugify('../../etc')).toBe('etc')
  })

  it('falls back to untitled when nothing usable remains', () => {
    expect(slugify('')).toBe('untitled')
    expect(slugify('???')).toBe('untitled')
  })

  it('truncates long text at a word boundary', () => {
    const slug = slugify('the quick brown fox jumps over the lazy dog and keeps running far away')
    expect(slug.length).toBeLessThanOrEqual(50)
    expect(slug).toBe('the-quick-brown-fox-jumps-over-the-lazy-dog-and')
  })

  it('truncates a single very long word hard, without a trailing hyphen', () => {
    expect(slugify('x'.repeat(200))).toBe('x'.repeat(50))
  })

  it('avoids names Windows reserves', () => {
    expect(slugify('CON')).toBe('con-1')
    expect(slugify('com3')).toBe('com3-1')
    expect(slugify('console')).toBe('console')
  })
})

describe('sheetFileName', () => {
  it('uses the sheet title, ignoring a heading marker', () => {
    expect(sheetFileName('# The Station\n\nText', [])).toBe('The Station.md')
  })

  it('uses untitled for empty content', () => {
    expect(sheetFileName('', [])).toBe('Untitled.md')
    expect(sheetFileName('\n  \n', [])).toBe('Untitled.md')
  })

  it('adds a numeric suffix on collision', () => {
    expect(sheetFileName('Notes', ['Notes.md'])).toBe('Notes 2.md')
    expect(sheetFileName('Notes', ['Notes.md', 'Notes 2.md'])).toBe('Notes 3.md')
  })

  it('fills the first free number', () => {
    expect(sheetFileName('Notes', ['Notes.md', 'Notes 3.md'])).toBe('Notes 2.md')
  })

  it('treats collisions case-insensitively', () => {
    expect(sheetFileName('Notes', ['NOTES.md'])).toBe('Notes 2.md')
  })

  it('is not confused by unrelated names or a same-named group', () => {
    expect(sheetFileName('Notes', ['notes', 'other.md'])).toBe('Notes.md')
  })

  it('accepts any iterable', () => {
    expect(sheetFileName('A', new Set(['a.md']))).toBe('A 2.md')
  })
})

describe('readableName', () => {
  it('keeps case, spaces and punctuation that files allow', () => {
    expect(readableName("Chapter 1: Why? It's 'odd'")).toBe("Chapter 1 Why It's 'odd'")
    expect(readableName('Año nuevo — 日本語')).toBe('Año nuevo — 日本語')
  })
  it('drops what file systems refuse', () => {
    expect(readableName('a/b\\c*d"e<f>g|h')).toBe('abcdefgh')
    expect(readableName('tab\there\nnow')).toBe('tab here now')
  })
  it('trims trailing dots and spaces, and leading dots', () => {
    expect(readableName('Wait...  ')).toBe('Wait')
    expect(readableName('.hidden')).toBe('hidden')
  })
  it('avoids reserved names and falls back when empty', () => {
    expect(readableName('CON')).toBe('CON 1')
    expect(readableName('???')).toBe('Untitled')
    expect(readableName('')).toBe('Untitled')
  })
  it('cuts long names at a word', () => {
    const name = readableName('word '.repeat(40))
    expect(name.length).toBeLessThanOrEqual(80)
    expect(name.endsWith(' ')).toBe(false)
  })
})

describe('stemFitsTitle', () => {
  it('accepts the readable and the old form, numbered or not', () => {
    expect(stemFitsTitle('The Station', 'The Station')).toBe(true)
    expect(stemFitsTitle('the station', 'The Station')).toBe(true)
    expect(stemFitsTitle('The Station 3', 'The Station')).toBe(true)
    expect(stemFitsTitle('the-station', 'The Station')).toBe(true)
    expect(stemFitsTitle('the-station-2', 'The Station')).toBe(true)
    expect(stemFitsTitle('untitled', 'The Station')).toBe(false)
    expect(stemFitsTitle('The Station Two', 'The Station')).toBe(false)
  })
})
