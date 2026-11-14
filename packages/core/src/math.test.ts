import { describe, expect, it } from 'vitest'
import { findMath, mathToHtml } from './math'

const tex = (s: string): string[] => findMath(s).map((m) => m.tex)

describe('findMath', () => {
  it('finds inline and display formulas', () => {
    expect(tex('Let $x^2$ be, and $$y=1$$ too.')).toEqual(['x^2', 'y=1'])
  })
  it('reads a block over several lines', () => {
    const text = 'a\n\n$$\n\\frac{1}{2}\n$$\n\nb $z$'
    const [block, inline] = findMath(text)
    expect(block).toMatchObject({ tex: '\\frac{1}{2}', block: true, display: true })
    expect(text.slice(block!.from, block!.to)).toBe('$$\n\\frac{1}{2}\n$$')
    expect(inline!.tex).toBe('z')
  })
  it('ignores prices, escaped dollars and code', () => {
    expect(tex('It costs $5 and $10 today.')).toEqual([])
    expect(tex('Pay \\$3 and \\$4')).toEqual([])
    expect(tex('`$x$` and\n```\n$y$\n$$\nz\n$$\n```\n')).toEqual([])
  })
  it('needs no space inside the dollars', () => {
    expect(tex('a $ x $ b')).toEqual([])
  })
})

describe('mathToHtml', () => {
  it('writes MathML', () => {
    expect(mathToHtml('x^2', false)).toContain('<math')
  })
  it('does not throw on bad TeX', () => {
    expect(() => mathToHtml('\\frac{', false)).not.toThrow()
  })
})

import { markdownToHtml } from './export'

describe('math in export', () => {
  it('renders inline and block formulas', () => {
    const html = markdownToHtml('Let $a_1 + b_2$ hold.\n\n$$\nx = \\frac{1}{2}\n$$\n\nCosts $5 and $10.')
    expect(html.match(/<math/g)?.length).toBe(2)
    expect(html).toContain('math-block')
    expect(html).toContain('$5 and $10')
    expect(html).not.toContain('<em>')
  })
})
