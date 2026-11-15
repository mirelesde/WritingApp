import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConflictPair } from '@writingapp/core'
import { ConflictFlow } from './conflictFlow.svelte'

const pair = (n: string): ConflictPair => ({
  original: { name: `${n}.md`, path: `/L/${n}.md` },
  copy: { name: `${n} (conflicted copy).md`, path: `/L/${n} (conflicted copy).md` }
})

let pairs: ConflictPair[]
let texts: Record<string, string>
let host: Record<string, ReturnType<typeof vi.fn>>
let flow: ConflictFlow

beforeEach(() => {
  pairs = [pair('A'), pair('B')]
  texts = {}
  for (const p of pairs) {
    texts[p.original.path] = `original ${p.original.name}`
    texts[p.copy.path] = `copy ${p.copy.name}`
  }
  host = {
    pairs: vi.fn(() => pairs),
    flush: vi.fn().mockResolvedValue(undefined),
    writeText: vi.fn().mockResolvedValue(undefined),
    trashCopy: vi.fn().mockImplementation(async (path: string) => {
      pairs = pairs.filter((p) => p.copy.path !== path)
    }),
    info: vi.fn(),
    fail: vi.fn()
  }
  const api = { readSheet: vi.fn(async (path: string) => texts[path]!) }
  flow = new ConflictFlow(api as never, host as never)
})

describe('ConflictFlow', () => {
  it('reads both texts of the first pair after saving what is outstanding', async () => {
    await flow.open()
    expect(host.flush).toHaveBeenCalled()
    expect(flow.resolving?.original.text).toBe('original A.md')
    expect(flow.resolving?.copy.text).toBe('copy A (conflicted copy).md')
  })

  it('says so when there is nothing to resolve', async () => {
    pairs = []
    await flow.open()
    expect(flow.resolving).toBeNull()
    expect(host.info).toHaveBeenCalledWith('No sync conflicts in this library')
  })

  it('keeps the sheet as it is, trashes the copy and moves to the next pair', async () => {
    await flow.open()
    await flow.resolve('original A.md')
    expect(host.writeText).not.toHaveBeenCalled()
    expect(host.trashCopy).toHaveBeenCalledWith('/L/A (conflicted copy).md')
    expect(host.info).toHaveBeenCalledWith('Resolved the conflict in “A.md”')
    expect(flow.resolving?.original.name).toBe('B.md')
  })

  it('writes different text into the sheet first', async () => {
    await flow.open()
    await flow.resolve('merged')
    expect(host.writeText).toHaveBeenCalledWith('/L/A.md', 'merged')
  })

  it('closes after the last pair and says there are none left', async () => {
    pairs = [pair('A')]
    await flow.open()
    await flow.resolve('original A.md')
    expect(flow.resolving).toBeNull()
    expect(host.info).toHaveBeenLastCalledWith(
      'Cancel'.length ? 'No sync conflicts in this library' : ''
    )
  })

  it('skips a copy, counts it, and does not return to it', async () => {
    await flow.open()
    flow.skip()
    await vi.waitFor(() => expect(flow.resolving?.original.name).toBe('B.md'))
    expect(flow.skipped).toEqual(['/L/A (conflicted copy).md'])
    expect(flow.remaining.map((p) => p.original.name)).toEqual(['B.md'])
    flow.skip()
    await vi.waitFor(() => expect(flow.resolving).toBeNull())
    expect(host.info).not.toHaveBeenCalledWith('No sync conflicts in this library')
  })

  it('starts again from the first copy, skipped ones included', async () => {
    await flow.open()
    flow.skip()
    await vi.waitFor(() => expect(flow.resolving?.original.name).toBe('B.md'))
    flow.restart()
    await vi.waitFor(() => expect(flow.resolving?.original.name).toBe('A.md'))
    expect(flow.skipped).toEqual([])
  })

  it('reports a failure and carries on', async () => {
    host.trashCopy.mockRejectedValueOnce(new Error('locked'))
    await flow.open()
    await flow.resolve('original A.md')
    expect(host.fail).toHaveBeenCalledOnce()
    expect(host.info).not.toHaveBeenCalledWith('Resolved the conflict in “A.md”')
  })

  it('cancels', async () => {
    await flow.open()
    flow.cancel()
    expect(flow.resolving).toBeNull()
  })
})
