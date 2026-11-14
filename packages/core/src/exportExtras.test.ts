import { describe, expect, it } from 'vitest'
import { htmlDocument } from './export'
import { setsPageSize, withTitlePage } from './exportExtras'

describe('withTitlePage', () => {
  it('puts a title page first, escaped, without making a heading', () => {
    const html = withTitlePage(htmlDocument('T', '<h1>One</h1>'), 'A & B', 'Me <x>')
    expect(html.indexOf('class="title-page"')).toBeLessThan(html.indexOf('<h1>One</h1>'))
    expect(html).toContain('A &amp; B')
    expect(html).toContain('Me &lt;x&gt;')
    expect(html).not.toMatch(/<h1[^>]*>A/)
  })
  it('leaves out an empty author', () => {
    expect(withTitlePage('<body>x</body>', 'T', ' ')).not.toContain('book-author"')
  })
})

describe('setsPageSize', () => {
  it('sees @page size, not other @page rules', () => {
    expect(setsPageSize('<style>@page { size: 6in 9in; margin: 1in }</style>')).toBe(true)
    expect(setsPageSize('<style>@page { margin: 1in }</style>')).toBe(false)
  })
})
