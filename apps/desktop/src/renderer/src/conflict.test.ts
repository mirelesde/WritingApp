import { describe, expect, it } from 'vitest'
import { createSaveGuard, SaveConflict } from './conflict'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the shape is plain from the return
function setup(files: Record<string, string>) {
  const guard = createSaveGuard({
    read: async (p) => {
      if (!(p in files)) throw new Error('missing')
      return files[p]!
    },
    write: async (p, t) => void (files[p] = t)
  })
  return { guard, files }
}

describe('createSaveGuard', () => {
  it('saves when the disk is as last seen', async () => {
    const { guard, files } = setup({ '/a': 'one' })
    guard.trust('/a', 'one')
    await guard.save('/a', 'two')
    expect(files['/a']).toBe('two')
    await guard.save('/a', 'three') // baseline moved with the save
    expect(files['/a']).toBe('three')
  })
  it('refuses to overwrite a file something else changed', async () => {
    const { guard, files } = setup({ '/a': 'one' })
    guard.trust('/a', 'one')
    files['/a'] = 'theirs'
    await expect(guard.save('/a', 'mine')).rejects.toMatchObject({ disk: 'theirs' })
    await expect(guard.save('/a', 'mine')).rejects.toBeInstanceOf(SaveConflict)
    expect(files['/a']).toBe('theirs')
  })
  it('saves once the disk version has been accepted as the baseline', async () => {
    const { guard, files } = setup({ '/a': 'one' })
    guard.trust('/a', 'one')
    files['/a'] = 'theirs'
    guard.trust('/a', 'theirs')
    await guard.save('/a', 'mine')
    expect(files['/a']).toBe('mine')
  })
  it('is no conflict when the disk already holds my text, or the file is unknown or gone', async () => {
    const { guard, files } = setup({ '/a': 'one', '/u': 'x' })
    guard.trust('/a', 'one')
    files['/a'] = 'same'
    await guard.save('/a', 'same')
    await guard.save('/u', 'y') // never loaded: nothing to compare with
    expect(files['/u']).toBe('y')
    guard.trust('/gone', 'x')
    await guard.save('/gone', 'y')
    expect(files['/gone']).toBe('y')
  })
  it('remembers the baseline', () => {
    const { guard } = setup({})
    guard.trust('/a', 'one')
    expect(guard.baseline('/a')).toBe('one')
    expect(guard.baseline('/b')).toBeUndefined()
  })
})
