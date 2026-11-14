import type { DirEntry, FileSystem } from '../filesystem'

/** An in-memory FileSystem for tests. The root folder "/" always exists. */
export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, string>()
  private dirs = new Set<string>(['/'])
  /** Paths passed to trash(), in order, so tests can assert on them. */
  readonly trashed: string[] = []

  /** Seed from a map of path to text; parent folders are created. */
  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) {
      this.mkdirs(parent(path))
      this.files.set(path, text)
    }
  }

  async readText(path: string): Promise<string> {
    const text = this.files.get(path)
    if (text === undefined) throw new Error(`No such file: ${path}`)
    return text
  }

  async writeText(path: string, text: string): Promise<void> {
    if (!this.dirs.has(parent(path))) throw new Error(`No such folder: ${parent(path)}`)
    if (this.dirs.has(path)) throw new Error(`Is a folder: ${path}`)
    this.files.set(path, text)
  }

  // Bytes are kept in the same map as text, one character per byte, so folders,
  // renames and trashing treat every file alike.
  async readBinary(path: string): Promise<Uint8Array> {
    return Uint8Array.from(await this.readText(path), (c) => c.charCodeAt(0) & 0xff)
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    await this.writeText(path, String.fromCharCode(...data))
  }

  async copyFile(from: string, to: string): Promise<void> {
    if (await this.exists(to)) throw new Error(`Already exists: ${to}`)
    await this.writeText(to, await this.readText(from))
  }

  async list(path: string): Promise<DirEntry[]> {
    if (!this.dirs.has(path)) throw new Error(`No such folder: ${path}`)
    const entries: DirEntry[] = []
    for (const p of this.files.keys()) {
      if (parent(p) === path) entries.push({ name: base(p), kind: 'file' })
    }
    for (const p of this.dirs) {
      if (p !== '/' && parent(p) === path) entries.push({ name: base(p), kind: 'directory' })
    }
    return entries
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path)
  }

  async makeDir(path: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`Is a file: ${path}`)
    this.mkdirs(path)
  }

  async rename(from: string, to: string): Promise<void> {
    if (!(await this.exists(from))) throw new Error(`No such path: ${from}`)
    if (await this.exists(to)) throw new Error(`Already exists: ${to}`)
    if (!this.dirs.has(parent(to))) throw new Error(`No such folder: ${parent(to)}`)
    if (to.startsWith(from + '/')) throw new Error(`Cannot move into itself: ${from}`)
    const text = this.files.get(from)
    if (text !== undefined) {
      this.files.delete(from)
      this.files.set(to, text)
      return
    }
    const remap = (p: string) => to + p.slice(from.length)
    const inside = (p: string) => p === from || p.startsWith(from + '/')
    for (const [p, t] of [...this.files]) {
      if (inside(p)) {
        this.files.delete(p)
        this.files.set(remap(p), t)
      }
    }
    for (const p of [...this.dirs]) {
      if (inside(p)) {
        this.dirs.delete(p)
        this.dirs.add(remap(p))
      }
    }
  }

  async trash(path: string): Promise<void> {
    if (!(await this.exists(path))) throw new Error(`No such path: ${path}`)
    this.files.delete(path)
    for (const p of [...this.files.keys()]) if (p.startsWith(path + '/')) this.files.delete(p)
    for (const p of [...this.dirs]) if (p === path || p.startsWith(path + '/')) this.dirs.delete(p)
    this.trashed.push(path)
  }

  private mkdirs(path: string): void {
    let current = ''
    for (const part of path.split('/').filter(Boolean)) {
      current += '/' + part
      this.dirs.add(current)
    }
  }
}

function parent(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

function base(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
