import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'

let counter = 0

/** Writes through a temporary dotfile and renames it over `path`, so a crash never leaves half a file. */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}-${counter++}.tmp`)
  try {
    await fs.writeFile(temp, text, 'utf8')
    await fs.rename(temp, path)
  } catch (error) {
    await fs.rm(temp, { force: true })
    throw error
  }
}
