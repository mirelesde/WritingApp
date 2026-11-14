import type { MarkdownConfig } from '@lezer/markdown'
import { Tag } from '@lezer/highlight'
import { tags } from '@lezer/highlight'

/** The tag for `==highlighted==` text, styled in the editor's highlight style. */
export const highlightTag = Tag.define()

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~¡‐-‧]/
const DELIMITER = { resolve: 'Highlight', mark: 'HighlightMark' }

/**
 * Markdown syntax `==text==` for the editor's parser, built like the
 * strikethrough rule of GitHub-flavoured Markdown: the opening marks need
 * text after them and the closing marks text before them.
 */
export const highlightSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: highlightTag },
    { name: 'HighlightMark', style: tags.processingInstruction }
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        // Exactly two equals signs: `===` is left alone (a setext heading underline, or plain text).
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61 || cx.char(pos - 1) === 61) return -1
        const before = cx.slice(pos - 1, pos)
        const after = cx.slice(pos + 2, pos + 3)
        const spaceBefore = /\s|^$/.test(before)
        const spaceAfter = /\s|^$/.test(after)
        const punctBefore = PUNCTUATION.test(before)
        const punctAfter = PUNCTUATION.test(after)
        return cx.addDelimiter(
          DELIMITER,
          pos,
          pos + 2,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter)
        )
      },
      after: 'Emphasis'
    }
  ]
}
