import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, isRichPaste } from './htmlToMarkdown'

const md = htmlToMarkdown

describe('htmlToMarkdown', () => {
  it('converts headings, paragraphs and emphasis', () => {
    expect(md('<h2>Title</h2><p>One <b>bold</b> and <em>soft</em> and <del>gone</del>.</p><p>Two</p>')).toBe(
      '## Title\n\nOne **bold** and *soft* and ~~gone~~.\n\nTwo',
    )
  })

  it('keeps spaces outside the markers', () => {
    expect(md('<p>a<strong> bold </strong>b</p>')).toBe('a **bold** b')
  })

  it('converts links, code and images', () => {
    expect(md('<p><a href="https://x.org/a b">site</a> <code>x*y</code> <img src="https://x.org/p.png" alt="pic"></p>')).toBe(
      '[site](https://x.org/a%20b) `x*y` ![pic](https://x.org/p.png)',
    )
  })

  it('converts nested lists', () => {
    expect(md('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol start="3"><li>c</li><li>d</li></ol>')).toBe(
      '- one\n  - inner\n- two\n\n3. c\n4. d',
    )
  })

  it('converts quotes, rules, code blocks and tables', () => {
    expect(md('<blockquote><p>Said</p></blockquote><hr><pre>a\n  b</pre>')).toBe('> Said\n\n---\n\n```\na\n  b\n```')
    expect(md('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x|y</td></tr></table>')).toBe(
      '| A | B |\n| --- | --- |\n| 1 | x\\|y |',
    )
  })

  it('reads word-processor styles and ignores wrappers', () => {
    expect(
      md(
        '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">Bold</span> <span style="font-style:italic">it</span> plain</p></b>',
      ),
    ).toBe('**Bold** *it* plain')
  })

  it('escapes Markdown characters in plain text and drops scripts', () => {
    expect(md('<p>2 * 3 = 6 &amp; _x_</p><script>alert(1)</script>')).toBe('2 \\* 3 = 6 & \\_x\\_')
  })

  it('takes only the fragment', () => {
    expect(md('<html><body><!--StartFragment--><p>in</p><!--EndFragment--></body></html>')).toBe('in')
  })

  it('knows when a paste has nothing rich in it', () => {
    expect(isRichPaste('hello world', 'hello  world')).toBe(false)
    expect(isRichPaste('**hello** world', 'hello world')).toBe(true)
  })
})
