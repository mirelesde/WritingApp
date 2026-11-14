import { describe, expect, it } from 'vitest'
import { addHeadingIds, expandContents, findMarkers, hasContentsMarker, headingSlugs } from './contents'

describe('table of contents', () => {
  it('finds (cnt) alone on a line, not in code or text', () => {
    expect(hasContentsMarker('# A\n\n(cnt)\n')).toBe(true)
    expect(hasContentsMarker('see (cnt) here')).toBe(false)
    expect(hasContentsMarker('```\n(cnt)\n```')).toBe(false)
    expect(findMarkers('x\n(cnt)')).toEqual([2])
  })

  it('lists the headings after the marker, nested by level', () => {
    const [out] = expandContents(['# Title\n\n(cnt)\n\n# One\n\n## Sub\n\n# Two'], false)
    expect(out).toBe('# Title\n\n- One\n  - Sub\n- Two\n\n# One\n\n## Sub\n\n# Two')
  })

  it('reads headings across sheets and links them for HTML', () => {
    const out = expandContents(['(cnt)', '# One', '## One'], true)
    expect(out[0]).toBe('- [One](#one)\n  - [One](#one-2)')
  })

  it('leaves texts alone without a marker, and drops the marker with no headings', () => {
    const same = ['# A']
    expect(expandContents(same, true)).toBe(same)
    expect(expandContents(['(cnt)'], true)).toEqual([''])
  })

  it('makes unique accented slugs', () => {
    expect(headingSlugs([{ level: 1, text: '¿Qué es?', offset: 0 }, { level: 1, text: 'Que es', offset: 9 }])).toEqual(['que-es', 'que-es-2'])
  })

  it('adds ids to rendered headings that match the outline', () => {
    expect(addHeadingIds('<h1>One</h1>\n<h2>Two &amp; <em>x</em></h2>', ['# One\n## Two & *x*'])).toBe(
      '<h1 id="one">One</h1>\n<h2 id="two-x">Two &amp; <em>x</em></h2>',
    )
  })
})
