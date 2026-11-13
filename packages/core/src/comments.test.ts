import { describe, expect, it } from 'vitest'
import { maskComments, stripComments } from './comments'

describe('stripComments', () => {
  it('removes an inline comment', () => {
    expect(stripComments('one <!-- two --> three')).toBe('one  three')
  })

  it('removes a comment that takes up whole lines, with the line breaks', () => {
    expect(stripComments('a\n<!-- gone\nacross lines -->\nb\n')).toBe('a\nb\n')
  })

  it('leaves text without comments alone', () => {
    expect(stripComments('plain *text*\n')).toBe('plain *text*\n')
  })

  it('keeps comments in fenced code blocks', () => {
    const text = 'x <!-- c -->\n```html\n<!-- code -->\n```\ny <!-- d -->\n'
    expect(stripComments(text)).toBe('x \n```html\n<!-- code -->\n```\ny \n')
  })

  it('handles several comments and an unclosed one', () => {
    expect(stripComments('<!-- a --> b <!-- c --> d')).toBe(' b  d')
    expect(stripComments('keep <!-- never closed')).toBe('keep <!-- never closed')
  })
})

describe('maskComments', () => {
  it('blanks comments without moving anything', () => {
    const text = 'a <!-- x\ny --> b\n'
    const masked = maskComments(text)
    expect(masked).toHaveLength(text.length)
    expect(masked).toBe('a       \n      b\n')
  })

  it('keeps comments in code blocks', () => {
    expect(maskComments('```\n<!-- c -->\n```\n')).toBe('```\n<!-- c -->\n```\n')
  })
})
