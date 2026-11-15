import { describe, expect, it } from 'vitest'
import { UnsavedPrompt } from './unsavedPrompt.svelte'

describe('UnsavedPrompt', () => {
  it('shows the question and resolves with the answer, then goes quiet', async () => {
    const prompt = new UnsavedPrompt()
    const pending = prompt.ask(['A', 'B'], 'tab')
    expect(prompt.current).toEqual({ names: ['A', 'B'], what: 'tab' })
    prompt.answer('discard')
    expect(await pending).toBe('discard')
    expect(prompt.current).toBeNull()
  })

  it('ignores an answer when nothing is asked', () => {
    expect(() => new UnsavedPrompt().answer('save')).not.toThrow()
  })
})
