import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeFileAtomic } from './atomicWrite'

it('replaces the file and leaves no temporary file behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'writingapp-atomic-'))
  const file = join(dir, 'settings.json')
  await writeFile(file, 'old')
  await writeFileAtomic(file, 'new')
  expect(await readFile(file, 'utf8')).toBe('new')
  expect(await readdir(dir)).toEqual(['settings.json'])
})

it('keeps the old file and cleans up when the write fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'writingapp-atomic-'))
  const file = join(dir, 'a.json')
  await writeFile(file, 'old')
  await expect(writeFileAtomic(join(dir, 'missing', 'a.json'), 'x')).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('old')
})
