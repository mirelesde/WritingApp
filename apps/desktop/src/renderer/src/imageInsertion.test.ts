import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { imageInsertion } from './imageThumbs'

const doc = Text.of(['# Title', '', 'Some words here', ''])
const img = ['![](a.png)']

describe('imageInsertion', () => {
  it('puts a picture at the start of a heading on its own paragraph', () => {
    expect(imageInsertion(doc, img, 0, 0)).toBe('![](a.png)\n\n')
  })
  it('sets a picture in the middle of a line apart on both sides', () => {
    expect(imageInsertion(doc, img, 14, 14)).toBe('\n\n![](a.png)\n\n')
  })
  it('adds nothing around a picture on an empty line', () => {
    expect(imageInsertion(doc, img, 8, 8)).toBe('![](a.png)')
  })
  it('only separates the front when the picture ends the line', () => {
    expect(imageInsertion(doc, img, 7, 7)).toBe('\n\n![](a.png)')
  })
  it('keeps several pictures in separate paragraphs', () => {
    expect(imageInsertion(doc, ['![](a.png)', '![](b.png)'], 8, 8)).toBe('![](a.png)\n\n![](b.png)')
  })
})
