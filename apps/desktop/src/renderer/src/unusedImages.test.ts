import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnusedImages } from './unusedImages.svelte'

let api: { unusedImages: ReturnType<typeof vi.fn>; trashUnusedImages: ReturnType<typeof vi.fn> }
let host: { hasLibrary: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> }
let unused: UnusedImages
const pic = { name: 'a.png', size: 10 }

beforeEach(() => {
  vi.useFakeTimers()
  api = {
    unusedImages: vi.fn().mockResolvedValue([pic]),
    trashUnusedImages: vi.fn().mockResolvedValue(1)
  }
  host = { hasLibrary: vi.fn(() => true), info: vi.fn() }
  unused = new UnusedImages(api as never, host as never)
})
afterEach(() => vi.useRealTimers())

describe('UnusedImages', () => {
  it('checks a moment after the library changes, once for a burst of changes', async () => {
    unused.check()
    unused.check()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.unusedImages).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(api.unusedImages).toHaveBeenCalledOnce()
    expect(unused.list).toEqual([pic])
  })

  it('does not look when no library is open', async () => {
    host.hasLibrary.mockReturnValue(false)
    unused.check()
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.unusedImages).not.toHaveBeenCalled()
  })

  it('opens the dialog with the current list, and closes it', async () => {
    await unused.open()
    expect(unused.cleaning).toEqual([pic])
    unused.close()
    expect(unused.cleaning).toBeNull()
  })

  it('trashes the named pictures, looks again and says how many', async () => {
    await unused.open()
    api.unusedImages.mockResolvedValue([])
    await unused.clean(['a.png'])
    expect(api.trashUnusedImages).toHaveBeenCalledWith(['a.png'])
    expect(unused.cleaning).toBeNull()
    expect(unused.list).toEqual([])
    expect(host.info).toHaveBeenCalledWith('Moved 1 unused image to the trash')
    api.trashUnusedImages.mockResolvedValue(3)
    await unused.clean(['a', 'b', 'c'])
    expect(host.info).toHaveBeenLastCalledWith('Moved 3 unused images to the trash')
  })
})
