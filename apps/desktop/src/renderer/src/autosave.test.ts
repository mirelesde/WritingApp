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

describe('createAutosaver with autosave off', () => {
  it('waits for a flush instead of saving after a pause', async () => {
    const writes: [string, string][] = []
    const statuses: SaveStatus[] = []
    const autosaver = createAutosaver({
      save: async (p, t) => void writes.push([p, t]),
      onStatus: (s) => statuses.push(s),
      enabled: () => false,
      delay: 800
    })
    autosaver.change('/a.md', 'typed')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(writes).toEqual([])
    expect(statuses.at(-1)).toBe('unsaved')
    await autosaver.flush()
    expect(writes).toEqual([['/a.md', 'typed']])
    expect(statuses.at(-1)).toBe('saved')
  })

  it('still journals the text, and does not retry a failed save by itself', async () => {
    const put = vi.fn(async () => {})
    let attempts = 0
    const autosaver = createAutosaver({
      save: async () => {
        attempts++
        throw new Error('disk full')
      },
      journal: { put, clear: async () => {} },
      enabled: () => false,
      journalDelay: 250,
      retryDelay: 1000
    })
    autosaver.change('/a.md', 'mine')
    await vi.advanceTimersByTimeAsync(300)
    expect(put).toHaveBeenCalledWith('/a.md', 'mine')
    await autosaver.flush()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(attempts).toBe(1)
  })

  it('saves by itself again once turned back on', async () => {
    let on = false
    const writes: string[] = []
    const autosaver = createAutosaver({ save: async (_p, t) => void writes.push(t), enabled: () => on, delay: 800 })
    autosaver.change('/a.md', 'one')
    await vi.advanceTimersByTimeAsync(2000)
    expect(writes).toEqual([])
    on = true
    autosaver.change('/a.md', 'two')
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toEqual(['two'])
  })
})

describe('createAutosaver journal', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the shape is plain from the return
  function withJournal() {
    const puts: [string, string][] = []
    const clears: string[] = []
    const writes: [string, string][] = []
    const autosaver = createAutosaver({
      save: async (p, t) => void writes.push([p, t]),
      journal: {
        put: async (p, t) => void puts.push([p, t]),
        clear: async (p) => void clears.push(p)
      },
      delay: 800,
      journalDelay: 250
    })
    return { autosaver, puts, clears, writes }
  }

  it('journals the latest text soon after typing, and clears it once saved', async () => {
    const { autosaver, puts, clears, writes } = withJournal()
    autosaver.change('/a.md', 'h')
    autosaver.change('/a.md', 'he')
    await vi.advanceTimersByTimeAsync(300)
    expect(puts).toEqual([['/a.md', 'he']])
    expect(clears).toEqual([])
    await vi.advanceTimersByTimeAsync(600)
    expect(writes).toEqual([['/a.md', 'he']])
    expect(clears).toEqual(['/a.md'])
  })

  it('a flush journals the text first, then clears it once it is saved', async () => {
    const { autosaver, puts, clears, writes } = withJournal()
    autosaver.change('/a.md', 'quick')
    await autosaver.flush()
    await vi.advanceTimersByTimeAsync(300)
    expect(puts).toEqual([['/a.md', 'quick']])
    expect(writes).toEqual([['/a.md', 'quick']])
    expect(clears).toEqual(['/a.md'])
  })

  it('keeps the journal when a save fails', async () => {
    const puts: [string, string][] = []
    const clears: string[] = []
    const autosaver = createAutosaver({
      save: async () => {
        throw new Error('disk full')
      },
      journal: { put: async (p, t) => void puts.push([p, t]), clear: async (p) => void clears.push(p) },
      retryDelay: 100000
    })
    autosaver.change('/a.md', 'precious')
    await vi.advanceTimersByTimeAsync(1000)
    expect(puts).toEqual([['/a.md', 'precious']])
    expect(clears).toEqual([])
  })

  it('clears the journal when the text is discarded', async () => {
    const { autosaver, clears } = withJournal()
    autosaver.change('/a.md', 'mine')
    await vi.advanceTimersByTimeAsync(300)
    autosaver.discard('/a.md')
    expect(clears).toEqual(['/a.md'])
  })

  it('journals unsaved text at once when flushed, even if the save fails', async () => {
    const put = vi.fn(async () => {})
    const autosaver = createAutosaver({
      save: async () => {
        throw new Error('disk full')
      },
      journal: { put, clear: async () => {} },
      delay: 800,
      journalDelay: 250
    })
    autosaver.change('/a.md', 'typed a moment ago')
    await autosaver.flush()
    expect(put).toHaveBeenCalledWith('/a.md', 'typed a moment ago')
    autosaver.discard('/a.md')
  })
})
