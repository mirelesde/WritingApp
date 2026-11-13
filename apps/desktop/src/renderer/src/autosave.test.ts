import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver, type Autosaver, type SaveStatus } from './autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(overrides: { save?: (p: string, t: string) => Promise<void> } = {}): {
  autosaver: Autosaver
  writes: [string, string][]
  statuses: SaveStatus[]
} {
  const writes: [string, string][] = []
  const statuses: SaveStatus[] = []
  const save = overrides.save ?? (async (p: string, t: string) => void writes.push([p, t]))
  const autosaver = createAutosaver({
    save,
    onStatus: (s) => statuses.push(s),
    delay: 800,
    retryDelay: 5000
  })
  return { autosaver, writes, statuses }
}

describe('createAutosaver', () => {
  it('saves after a pause, once, with the latest text', async () => {
    const { autosaver, writes } = setup()
    autosaver.change('/a.md', 'h')
    await vi.advanceTimersByTimeAsync(500)
    autosaver.change('/a.md', 'he')
    await vi.advanceTimersByTimeAsync(500)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(400)
    expect(writes).toEqual([['/a.md', 'he']])
  })

  it('flush saves immediately and cancels the pending timer', async () => {
    const { autosaver, writes } = setup()
    autosaver.change('/a.md', 'text')
    await autosaver.flush()
    expect(writes).toEqual([['/a.md', 'text']])
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toHaveLength(1)
  })

  it('does nothing when there is nothing to save', async () => {
    const { autosaver, writes } = setup()
    await autosaver.flush()
    expect(writes).toEqual([])
  })

  it('starts the write synchronously when idle', () => {
    const { autosaver, writes } = setup()
    autosaver.change('/a.md', 'x')
    void autosaver.flush()
    expect(writes).toEqual([['/a.md', 'x']])
  })

  it('saves several sheets, each once', async () => {
    const { autosaver, writes } = setup()
    autosaver.change('/a.md', 'A')
    autosaver.change('/b.md', 'B')
    await autosaver.flush()
    expect(writes).toEqual([
      ['/a.md', 'A'],
      ['/b.md', 'B']
    ])
  })

  it('keeps writes in order and does not mark newer text saved', async () => {
    const writes: string[] = []
    let release: () => void = () => {}
    const { autosaver, statuses } = setup({
      save: (_p, t) =>
        new Promise<void>((resolve) => {
          writes.push(t)
          if (t === 'one') release = resolve
          else resolve()
        })
    })
    autosaver.change('/a.md', 'one')
    const first = autosaver.flush()
    autosaver.change('/a.md', 'two') // typed while 'one' is being written
    const second = autosaver.flush()
    expect(writes).toEqual(['one']) // 'two' waits its turn
    release()
    await Promise.all([first, second])
    expect(writes).toEqual(['one', 'two'])
    expect(statuses.at(-1)).toBe('saved')
  })

  it('leaves newer text unsaved when an older write finishes', async () => {
    let release: () => void = () => {}
    const { autosaver, statuses } = setup({
      save: () => new Promise<void>((resolve) => (release = resolve))
    })
    autosaver.change('/a.md', 'one')
    void autosaver.flush()
    autosaver.change('/a.md', 'two')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toBe('unsaved')
  })

  it('reports an error, keeps the text and retries', async () => {
    let attempts = 0
    const { autosaver, statuses } = setup({
      save: async () => {
        if (++attempts === 1) throw new Error('disk full')
      }
    })
    autosaver.change('/a.md', 'text')
    await autosaver.flush()
    expect(statuses.at(-1)).toBe('error')
    await vi.advanceTimersByTimeAsync(5000)
    expect(attempts).toBe(2)
    expect(statuses.at(-1)).toBe('saved')
  })

  it('reports status through a normal cycle', async () => {
    const { autosaver, statuses } = setup()
    autosaver.change('/a.md', 'x')
    await autosaver.flush()
    expect(statuses).toEqual(['unsaved', 'saving', 'saved'])
  })

  it('discard forgets unsaved text', async () => {
    const { autosaver, writes } = setup()
    autosaver.change('/a.md', 'x')
    autosaver.discard('/a.md')
    await vi.advanceTimersByTimeAsync(2000)
    expect(writes).toEqual([])
  })
})
