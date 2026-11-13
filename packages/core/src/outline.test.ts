import { describe, expect, it } from 'vitest'
import { extractHeadings } from './outline'

describe('extractHeadings', () => {
  it('finds headings with their level and offset', () => {
    const text = '# One\n\ntext\n\n## Two\n'
    expect(extractHeadings(text)).toEqual([
      { level: 1, text: 'One', offset: 0 },
      { level: 2, text: 'Two', offset: 13 },
    ])
    expect(text.slice(13, 18)).toBe('## Tw')
  })

  it('needs a space after the hashes and at most six of them', () => {
    expect(extractHeadings('#nope\n####### seven\n###### six\n').map((h) => h.text)).toEqual(['six'])
  })

  it('drops closing hashes and inline Markdown', () => {
    expect(extractHeadings('## A *bold* [link](http://x) `code` ##\n')[0]!.text).toBe('A bold link code')
  })

  it('ignores headings in code blocks and comments', () => {
    const text = '```\n# not a heading\n```\n<!-- # hidden -->\n# Real\n'
    expect(extractHeadings(text).map((h) => h.text)).toEqual(['Real'])
  })

  it('skips empty headings and handles Windows line endings', () => {
    expect(extractHeadings('# \r\n# Title\r\n').map((h) => h.text)).toEqual(['Title'])
  })
})
