import { describe, expect, it } from 'vitest'
import { currentHeading, headingTarget } from './headingJump'

const doc = '# One\ntext\n## Two\nmore\n```\n# not a heading\n```\n# Three\n'
const two = doc.indexOf('## Two')
const three = doc.indexOf('# Three')

describe('jumping between headings', () => {
  it('goes to the next heading', () => {
    expect(headingTarget(doc, 0, 1)).toBe(two)
    expect(headingTarget(doc, two, 1)).toBe(three)
    expect(headingTarget(doc, doc.indexOf('more'), 1)).toBe(three)
  })

  it('skips headings inside code', () => {
    expect(headingTarget(doc, doc.indexOf('more'), 1)).not.toBe(doc.indexOf('# not'))
  })

  it('goes to the previous heading, from its own line or from the text below', () => {
    expect(headingTarget(doc, three, -1)).toBe(two)
    expect(headingTarget(doc, doc.indexOf('more'), -1)).toBe(two)
    expect(headingTarget(doc, two + 3, -1)).toBe(0)
  })

  it('has nowhere to go at the ends', () => {
    expect(headingTarget(doc, three + 2, 1)).toBeNull()
    expect(headingTarget(doc, 0, -1)).toBeNull()
  })

  it('finds the section the cursor is in', () => {
    expect(currentHeading(doc, 0)).toBe(0)
    expect(currentHeading(doc, doc.indexOf('more'))).toBe(1)
    expect(currentHeading(doc, doc.length)).toBe(2)
    expect(currentHeading('intro\n# A', 2)).toBe(-1)
  })
})
