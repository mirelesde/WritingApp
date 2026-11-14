import { stripComments } from './comments'
import type { GroupNode } from './library'

/** Reading speed used for the reading-time estimate, in words per minute. */
export const WORDS_PER_MINUTE = 230

export interface TextStats {
  words: number
  /** Characters including spaces, not counting line breaks. */
  characters: number
  /** Whole minutes to read at an average pace; 0 for empty text. */
  minutes: number
}

/**
 * Counts what a writer would call words: runs of non-space characters that
 * contain a letter or a digit, so a lone `#`, `-`, `>` or `---` does not count.
 */
export function countWords(text: string): number {
  let count = 0
  for (const token of stripComments(text).split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count++
  }
  return count
}

export function textStats(text: string): TextStats {
  const words = countWords(text)
  text = stripComments(text)
  return {
    words,
    characters: [...text.replace(/[\r\n]/g, '')].length,
    minutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  }
}

/** Total words in every sheet of a group, including its sub-groups, as the loaded tree counted them. */
export function groupWordCount(group: GroupNode): number {
  let total = 0
  for (const child of group.children) total += child.kind === 'group' ? groupWordCount(child) : child.words
  return total
}
