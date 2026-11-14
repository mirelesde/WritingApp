import type { DirEntry, FileSystem } from './filesystem'
import { sheetFileName, slugify } from './filename'
import { sheetTitle } from './sheet'
import { cleanKeywords } from './keywords'
import { baseName, joinPath, parentPath, trimSlashes } from './path'
import { GROUP_COLORS, parseSidecar, reconcileFolder, SIDECAR_NAME, type Sidecar } from './sidecar'
import { snapshotSidecar, type UndoAction } from './undo'

/*
 * Structural operations. Each one changes the disk and then rewrites the
 * sidecar of every folder it touched, with the full reconciled order so
 * the result is explicit from then on.
 *
 * Glue: removing or inserting a sheet breaks any glue run at that point
 * (the sheet before the gap loses its flag), so a glue flag never silently
 * attaches to a different neighbour.
 */

interface Folder {
  /** Visible child names in display order. */
  order: string[]
  /** Names of sheets glued to the next child. */
  glued: Set<string>
  /** Every entry actually on disk, visible or not. */
  entries: DirEntry[]
  /** The folder's colour name, if it has one. */
  color?: string
  /** Keywords by sheet name. */
  keywords: Map<string, string[]>
}

async function readFolder(fs: FileSystem, dir: string): Promise<Folder> {
  const entries = await fs.list(dir)
  const sidecarPath = joinPath(dir, SIDECAR_NAME)
  const text = (await fs.exists(sidecarPath)) ? await fs.readText(sidecarPath) : undefined
  const sidecar = parseSidecar(text)
  const { children, glued, keywords } = reconcileFolder(sidecar, entries)
  return {
    order: children.map((c) => c.name),
    glued: new Set(glued),
    entries,
    color: sidecar.color,
    keywords: new Map(Object.entries(keywords)),
  }
}

async function writeFolder(fs: FileSystem, dir: string, folder: Folder): Promise<void> {
  const sidecar: Sidecar = {
    version: 1,
    order: folder.order,
    glued: folder.order.filter((name) => folder.glued.has(name)),
    ...(folder.color ? { color: folder.color } : {}),
    ...(keywordRecord(folder) ? { keywords: keywordRecord(folder)! } : {}),
  }
  await fs.writeText(joinPath(dir, SIDECAR_NAME), JSON.stringify(sidecar, null, 2) + '\n')
}

/** The keywords of the folder's listed sheets as stored, or undefined if there are none. */
function keywordRecord(folder: Folder): Record<string, string[]> | undefined {
  const record: Record<string, string[]> = {}
  for (const name of folder.order) {
    const own = folder.keywords.get(name)
    if (own && own.length > 0) record[name] = own
  }
  return Object.keys(record).length > 0 ? record : undefined
}

/** Gives a sheet's keywords a new name to live under, or drops them when `to` is undefined. */
function renameKeywords(folder: Folder, from: string, to: string | undefined): void {
  const own = folder.keywords.get(from)
  folder.keywords.delete(from)
  if (own && to !== undefined) folder.keywords.set(to, own)
}

function removeName(folder: Folder, name: string): void {
  const i = folder.order.indexOf(name)
  if (i < 0) return
  folder.keywords.delete(name)
  if (i > 0) folder.glued.delete(folder.order[i - 1]!)
  folder.glued.delete(name)
  folder.order.splice(i, 1)
}

function insertName(folder: Folder, name: string, index: number | undefined): void {
  const i = clamp(index ?? folder.order.length, folder.order.length)
  if (i > 0) folder.glued.delete(folder.order[i - 1]!)
  folder.order.splice(i, 0, name)
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(Math.trunc(index), 0), length)
}

function takenNames(folder: Folder): Set<string> {
  return new Set(folder.entries.map((e) => e.name.toLowerCase()))
}

/** `name`, or `name<sep>2`, `name<sep>3`... before `ext`, avoiding `taken`. */
function uniqueName(name: string, ext: string, sep: string, taken: Set<string>): string {
  const stem = ext !== '' && name.endsWith(ext) ? name.slice(0, -ext.length) : name
  let candidate = stem + ext
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}${sep}${n}${ext}`
  return candidate
}

function validateGroupName(raw: string): string {
  const name = raw.trim()
  if (name === '') throw new Error('A group needs a name')
  if (/[/\\:*?"<>|\0]/.test(name)) throw new Error(`Invalid group name: ${raw}`)
  if (name.startsWith('.')) throw new Error('A group name cannot start with a dot')
  return name
}

/**
 * Creates a sheet in a group and returns its path. The file name comes
 * from the content's first line. `index` is the position among the
 * group's children (default: the end).
 */
export async function createSheet(
  fs: FileSystem,
  groupPath: string,
  content = '',
  index?: number,
): Promise<string> {
  const dir = trimSlashes(groupPath)
  const folder = await readFolder(fs, dir)
  const name = sheetFileName(content, folder.entries.map((e) => e.name))
  await fs.writeText(joinPath(dir, name), content)
  insertName(folder, name, index)
  await writeFolder(fs, dir, folder)
  return joinPath(dir, name)
}

/**
 * Creates a group (or, at the library root, a project) and returns its
 * path. A name already in use gets " 2", " 3", ... added.
 */
export async function createGroup(
  fs: FileSystem,
  parent: string,
  name = 'Untitled Group',
  index?: number,
): Promise<string> {
  const dir = trimSlashes(parent)
  const folder = await readFolder(fs, dir)
  const finalName = uniqueName(validateGroupName(name), '', ' ', takenNames(folder))
  await fs.makeDir(joinPath(dir, finalName))
  insertName(folder, finalName, index)
  await writeFolder(fs, dir, folder)
  return joinPath(dir, finalName)
}

/**
 * Renames a group in place, keeping its position, and returns its new
 * path. Throws if a sibling already has the name.
 */
export async function renameGroup(fs: FileSystem, path: string, newName: string): Promise<string> {
  const from = trimSlashes(path)
  const dir = parentPath(from)
  const oldName = baseName(from)
  const name = validateGroupName(newName)
  const folder = await readFolder(fs, dir)
  if (!folder.entries.some((e) => e.name === oldName && e.kind === 'directory')) {
    throw new Error(`Not a group: ${from}`)
  }
  if (name === oldName) return from
  const clash = folder.entries.some(
    (e) => e.name !== oldName && e.name.toLowerCase() === name.toLowerCase(),
  )
  if (clash) throw new Error(`"${name}" already exists in this folder`)
  await fs.rename(from, joinPath(dir, name))
  folder.order[folder.order.indexOf(oldName)] = name
  await writeFolder(fs, dir, folder)
  return joinPath(dir, name)
}

/**
 * Renames a sheet's file to follow its title (the first line), keeping its
 * place in the group and any glue. Returns the sheet's path, new or not.
 * A name that already fits, with or without a "-2" style suffix, is left alone.
 */
export async function syncSheetName(fs: FileSystem, path: string): Promise<string> {
  const from = trimSlashes(path)
  const dir = parentPath(from)
  const oldName = baseName(from)
  if (!oldName.endsWith('.md') || !(await fs.exists(from))) return from
  const slug = slugify(sheetTitle(await fs.readText(from)))
  const stem = oldName.slice(0, -'.md'.length)
  const suffix = stem.startsWith(slug + '-') ? stem.slice(slug.length + 1) : ''
  if (stem === slug || /^\d+$/.test(suffix)) return from
  const folder = await readFolder(fs, dir)
  const others = folder.entries.map((e) => e.name).filter((n) => n !== oldName)
  const name = sheetFileName(await fs.readText(from), others)
  if (name === oldName) return from
  await fs.rename(from, joinPath(dir, name))
  const i = folder.order.indexOf(oldName)
  if (i >= 0) {
    folder.order[i] = name
    if (folder.glued.delete(oldName)) folder.glued.add(name)
    renameKeywords(folder, oldName, name)
  }
  await writeFolder(fs, dir, folder)
  return joinPath(dir, name)
}

/** Moves a sheet or group (with its contents) to the system trash. */
export async function deleteNode(fs: FileSystem, path: string): Promise<void> {
  const target = trimSlashes(path)
  const dir = parentPath(target)
  const folder = await readFolder(fs, dir)
  await fs.trash(target)
  removeName(folder, baseName(target))
  await writeFolder(fs, dir, folder)
}

/**
 * `deleteNode`, plus the steps that bring the text back. Only Markdown
 * files and sidecars come back; the originals also sit in the system trash.
 */
export async function deleteNodeUndoable(fs: FileSystem, path: string): Promise<UndoAction[]> {
  const target = trimSlashes(path)
  const dir = parentPath(target)
  const restore: UndoAction[] = []
  const collect = async (at: string, isDir: boolean): Promise<void> => {
    if (!isDir) {
      restore.push({ kind: 'write', path: at, text: await fs.readText(at) })
      return
    }
    restore.push({ kind: 'makeDir', path: at })
    for (const entry of await fs.list(at)) {
      const isSidecar = entry.name === SIDECAR_NAME
      if (entry.kind === 'directory' || isSidecar || entry.name.endsWith('.md')) {
        await collect(joinPath(at, entry.name), entry.kind === 'directory')
      }
    }
  }
  const folder = await fs.list(dir)
  const isDir = folder.some((e) => e.name === baseName(target) && e.kind === 'directory')
  await collect(target, isDir)
  const sidecar = await snapshotSidecar(fs, dir)
  await deleteNode(fs, target)
  return [...restore, sidecar]
}

/**
 * Moves a sheet or group into `targetGroup`, returning its new path. `index`
 * is its final position among that group's children (default: the end).
 * Within the same group this is a reorder. See `moveNodes`.
 */
export async function moveNode(
  fs: FileSystem,
  path: string,
  targetGroup: string,
  index?: number,
): Promise<string> {
  const [moved] = await moveNodes(fs, [path], targetGroup, index)
  return moved!
}

/**
 * Moves several sheets and groups, which must share one parent, into
 * `targetGroup` as a block that keeps their current relative order. `index`
 * is where the block starts among the target's remaining children, that
 * is, after the moved ones have been taken out (default: the end). Within
 * the same group this is a reorder. Returns the new paths in the order given.
 * A name clash in the target gets a numeric suffix. Throws, changing
 * nothing, when moving a group into itself or its own descendant.
 */
export async function moveNodes(
  fs: FileSystem,
  paths: string[],
  targetGroup: string,
  index?: number,
): Promise<string[]> {
  if (paths.length === 0) return []
  const froms = paths.map(trimSlashes)
  const target = trimSlashes(targetGroup)
  const sourceDir = parentPath(froms[0]!)
  for (const from of froms) {
    if (parentPath(from) !== sourceDir) throw new Error('Moved items must share one group')
    if (target === from || target.startsWith(from + '/')) {
      throw new Error('Cannot move a group into itself')
    }
  }
  const source = await readFolder(fs, sourceDir)
  for (const from of froms) {
    const name = baseName(from)
    if (!source.entries.some((e) => e.name === name) || !source.order.includes(name)) {
      throw new Error(`Not part of the library: ${from}`)
    }
  }
  // The block keeps the order the items currently have on screen.
  const ordered = [...froms].sort(
    (a, b) => source.order.indexOf(baseName(a)) - source.order.indexOf(baseName(b)),
  )

  if (sourceDir === target) {
    const before = [...source.order]
    const kept = new Map(source.keywords)
    for (const from of ordered) removeName(source, baseName(from))
    const start = clamp(index ?? source.order.length, source.order.length)
    ordered.forEach((from, i) => insertName(source, baseName(from), start + i))
    source.keywords = kept
    if (source.order.join('\0') !== before.join('\0')) await writeFolder(fs, sourceDir, source)
    return froms
  }

  const dest = await readFolder(fs, target)
  const taken = takenNames(dest)
  const newNames = new Map<string, string>()
  for (const from of ordered) {
    const name = baseName(from)
    const isSheet = source.entries.find((e) => e.name === name)!.kind === 'file'
    const newName = uniqueName(name, isSheet ? '.md' : '', isSheet ? '-' : ' ', taken)
    taken.add(newName.toLowerCase())
    newNames.set(from, newName)
  }
  for (const from of ordered) {
    await fs.rename(from, joinPath(target, newNames.get(from)!))
  }
  const carried = new Map(ordered.map((from) => [from, source.keywords.get(baseName(from))]))
  for (const from of ordered) removeName(source, baseName(from))
  const start = clamp(index ?? dest.order.length, dest.order.length)
  ordered.forEach((from, i) => insertName(dest, newNames.get(from)!, start + i))
  for (const from of ordered) {
    const own = carried.get(from)
    if (own) dest.keywords.set(newNames.get(from)!, own)
  }
  await writeFolder(fs, sourceDir, source)
  await writeFolder(fs, target, dest)
  return froms.map((from) => joinPath(target, newNames.get(from)!))
}

/**
 * `moveNodes`, plus the steps that put everything back: the items return to
 * where they were and both folders get their old order and glue back.
 */
export async function moveNodesUndoable(
  fs: FileSystem,
  paths: string[],
  targetGroup: string,
  index?: number,
): Promise<{ paths: string[]; undo: UndoAction[] }> {
  if (paths.length === 0) return { paths: [], undo: [] }
  const froms = paths.map(trimSlashes)
  const sourceDir = parentPath(froms[0]!)
  const target = trimSlashes(targetGroup)
  const sidecars = [await snapshotSidecar(fs, sourceDir)]
  if (target !== sourceDir) sidecars.push(await snapshotSidecar(fs, target))
  const moved = await moveNodes(fs, paths, targetGroup, index)
  const renames: UndoAction[] =
    target === sourceDir
      ? []
      : moved.map((to, i): UndoAction => ({ kind: 'rename', from: to, to: froms[i]! })).reverse()
  return { paths: moved, undo: [...renames, ...sidecars] }
}

/** Copies a sheet, or a group with every sheet and sub-group in it, to `to`. */
async function copyTree(fs: FileSystem, from: string, to: string, isDir: boolean): Promise<void> {
  if (!isDir) {
    await fs.writeText(to, await fs.readText(from))
    return
  }
  await fs.makeDir(to)
  for (const entry of await fs.list(from)) {
    const keep = entry.kind === 'directory' ? !entry.name.startsWith('.') : entry.name === SIDECAR_NAME || entry.name.endsWith('.md')
    if (keep) await copyTree(fs, joinPath(from, entry.name), joinPath(to, entry.name), entry.kind === 'directory')
  }
}

/**
 * Copies sheets and groups into `targetGroup` as a block, in the order they
 * stand in their own group, and returns the new paths in the order given.
 * `index` is where the block starts (default: the end). A name already in use
 * gets a numeric suffix, so copying into the same group makes a duplicate.
 * Throws, changing nothing, when a group would be copied into itself.
 */
export async function copyNodes(
  fs: FileSystem,
  paths: string[],
  targetGroup: string,
  index?: number,
): Promise<{ paths: string[]; undo: UndoAction[] }> {
  if (paths.length === 0) return { paths: [], undo: [] }
  const froms = paths.map(trimSlashes)
  const target = trimSlashes(targetGroup)
  for (const from of froms) {
    if (target === from || target.startsWith(from + '/')) throw new Error('Cannot copy a group into itself')
  }
  const dest = await readFolder(fs, target)
  const sidecar = await snapshotSidecar(fs, target)
  const taken = takenNames(dest)
  // Items from one group are copied in the order they stand there.
  const kinds = new Map<string, boolean>()
  let ordered = [...froms]
  for (const from of froms) {
    const folder = await readFolder(fs, parentPath(from))
    const entry = folder.entries.find((e) => e.name === baseName(from))
    if (!entry || !folder.order.includes(baseName(from))) throw new Error(`Not part of the library: ${from}`)
    kinds.set(from, entry.kind === 'directory')
  }
  if (new Set(froms.map(parentPath)).size === 1) {
    const source = await readFolder(fs, parentPath(froms[0]!))
    ordered = ordered.sort((a, b) => source.order.indexOf(baseName(a)) - source.order.indexOf(baseName(b)))
  }
  const created = new Map<string, string>()
  const written: string[] = []
  const sourceFolders = new Map<string, Folder>()
  const start = clamp(index ?? dest.order.length, dest.order.length)
  for (const [i, from] of ordered.entries()) {
    const name = baseName(from)
    const isDir = kinds.get(from)!
    const newName = uniqueName(name, isDir ? '' : '.md', isDir ? ' ' : '-', taken)
    taken.add(newName.toLowerCase())
    await copyTree(fs, from, joinPath(target, newName), isDir)
    written.push(joinPath(target, newName))
    created.set(from, newName)
    insertName(dest, newName, start + i)
    if (!isDir) {
      const dir = parentPath(from)
      if (!sourceFolders.has(dir)) sourceFolders.set(dir, await readFolder(fs, dir))
      const own = sourceFolders.get(dir)!.keywords.get(name)
      if (own) dest.keywords.set(newName, own)
    }
  }
  await writeFolder(fs, target, dest)
  return {
    paths: froms.map((from) => joinPath(target, created.get(from)!)),
    undo: [...written.map((path): UndoAction => ({ kind: 'trash', path })).reverse(), sidecar],
  }
}

/** Moves a sheet or group to `index` within its own group. */
export async function reorderNode(fs: FileSystem, path: string, index: number): Promise<void> {
  await moveNode(fs, path, parentPath(trimSlashes(path)), index)
}

// --- Split, merge and glue ---------------------------------------------------

/** What a sheet operation hands back: the way to reverse it, and what it made. */
export interface SheetChange {
  /** Reverses the change. Pass to `applyUndo`. */
  undo: UndoAction[]
  /** The sheet that was created (split) or that now holds the result (merge). */
  path?: string
}

/** Splits `text`, the content of the sheet at `path`, at `offset`. */
export async function splitSheet(
  fs: FileSystem,
  path: string,
  text: string,
  offset: number,
): Promise<SheetChange & { path: string }> {
  const from = trimSlashes(path)
  const dir = parentPath(from)
  const name = baseName(from)
  const head = text.slice(0, offset).replace(/\s+$/, '')
  const tail = text
    .slice(offset)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/^[ \t]+/, '')
  if (head === '' || tail.trim() === '') throw new Error('Nothing to split off')

  const folder = await readFolder(fs, dir)
  const at = folder.order.indexOf(name)
  if (at < 0) throw new Error(`Not part of the library: ${from}`)
  const sidecarBefore = await snapshotSidecar(fs, dir)

  const newName = sheetFileName(tail, folder.entries.map((e) => e.name))
  const created = joinPath(dir, newName)
  await fs.writeText(created, tail)
  await fs.writeText(from, head + '\n')

  // The new sheet inherits the original's link to whatever followed it.
  const wasGlued = folder.glued.has(name)
  folder.glued.delete(name)
  insertName(folder, newName, at + 1)
  if (wasGlued) folder.glued.add(newName)
  const own = folder.keywords.get(name)
  if (own) folder.keywords.set(newName, own)
  await writeFolder(fs, dir, folder)

  return {
    path: created,
    undo: [
      { kind: 'write', path: from, text },
      { kind: 'trash', path: created },
      sidecarBefore,
    ],
  }
}

/** Reads the sheets and checks that they are distinct siblings in the library. */
async function siblingSheets(fs: FileSystem, paths: string[]) {
  const froms = [...new Set(paths.map(trimSlashes))]
  if (froms.length === 0) throw new Error('Select a sheet first')
  const dir = parentPath(froms[0]!)
  if (froms.some((p) => parentPath(p) !== dir)) throw new Error('Sheets must be in the same group')
  const folder = await readFolder(fs, dir)
  const names = froms.map(baseName)
  for (const name of names) {
    const entry = folder.entries.find((e) => e.name === name)
    if (entry?.kind !== 'file' || !folder.order.includes(name)) {
      throw new Error(`Not a sheet in the library: ${joinPath(dir, name)}`)
    }
  }
  const indexes = names.map((n) => folder.order.indexOf(n)).sort((a, b) => a - b)
  return { dir, folder, indexes, names: indexes.map((i) => folder.order[i]!) }
}

/**
 * Merges sheets into the first of them (in display order), joining their
 * text with a blank line, and trashes the rest. The merged sheet keeps
 * the link to the next sheet that the last one had, if they were adjacent.
 */
export async function mergeSheets(
  fs: FileSystem,
  paths: string[],
): Promise<SheetChange & { path: string }> {
  const { dir, folder, indexes, names } = await siblingSheets(fs, paths)
  if (names.length < 2) throw new Error('Select at least two sheets to merge')
  const sidecarBefore = await snapshotSidecar(fs, dir)
  const files = names.map((name) => joinPath(dir, name))
  const texts = await Promise.all(files.map((f) => fs.readText(f)))

  const adjacent = indexes.every((n, i) => i === 0 || n === indexes[i - 1]! + 1)
  const lastGlued = folder.glued.has(names[names.length - 1]!)
  const merged =
    texts
      .map((t) => t.replace(/\s+$/, ''))
      .filter((t) => t !== '')
      .join('\n\n') + '\n'
  await fs.writeText(files[0]!, merged)
  for (const file of files.slice(1)) await fs.trash(file)
  const union = cleanKeywords(names.flatMap((name) => folder.keywords.get(name) ?? []))
  for (const name of names.slice(1)) removeName(folder, name)
  if (union.length > 0) folder.keywords.set(names[0]!, union)
  if (adjacent && lastGlued) folder.glued.add(names[0]!)
  await writeFolder(fs, dir, folder)

  return {
    path: files[0]!,
    undo: [
      ...files.slice(1).map((file, i): UndoAction => ({ kind: 'write', path: file, text: texts[i + 1]! })),
      { kind: 'write', path: files[0]!, text: texts[0]! },
      sidecarBefore,
    ],
  }
}

/**
 * Glues sheets to the sheet after them, so they read and export as one run.
 * With several selected, each is glued to the next selected one it sits next
 * to; with one selected, it is glued to the sheet that follows it.
 */
export async function glueSheets(fs: FileSystem, paths: string[]): Promise<SheetChange> {
  const { dir, folder, indexes } = await siblingSheets(fs, paths)
  const sidecarBefore = await snapshotSidecar(fs, dir)
  const pairs: number[] = []
  if (indexes.length === 1) {
    const next = folder.entries.find((e) => e.name === folder.order[indexes[0]! + 1])
    if (next?.kind === 'file') pairs.push(indexes[0]!)
  } else {
    for (const n of indexes) if (indexes.includes(n + 1)) pairs.push(n)
  }
  if (pairs.length === 0) throw new Error('Select sheets that sit next to each other')
  for (const n of pairs) folder.glued.add(folder.order[n]!)
  await writeFolder(fs, dir, folder)
  return { undo: [sidecarBefore] }
}

/** Detaches sheets from the runs they are in, on both sides. */
export async function unglueSheets(fs: FileSystem, paths: string[]): Promise<SheetChange> {
  const { dir, folder, indexes } = await siblingSheets(fs, paths)
  const sidecarBefore = await snapshotSidecar(fs, dir)
  let changed = false
  for (const n of indexes) {
    for (const flagged of [folder.order[n]!, folder.order[n - 1]]) {
      if (flagged !== undefined && folder.glued.delete(flagged)) changed = true
    }
  }
  if (!changed) throw new Error('These sheets are not glued')
  await writeFolder(fs, dir, folder)
  return { undo: [sidecarBefore] }
}

/** Gives a project or group a colour from GROUP_COLORS, or clears it with null. */
export async function setGroupColor(
  fs: FileSystem,
  path: string,
  color: string | null,
): Promise<SheetChange> {
  if (color !== null && !Object.hasOwn(GROUP_COLORS, color)) throw new Error('Unknown colour')
  const folder = await readFolder(fs, path)
  const sidecarBefore = await snapshotSidecar(fs, path)
  if (color === null) delete folder.color
  else folder.color = color
  await writeFolder(fs, path, folder)
  return { undo: [sidecarBefore] }
}

/**
 * Adds and removes keywords on sheets, which may be in different groups.
 * `remove` matches ignoring case. Returns how many sheets changed; throws if none did.
 */
export async function changeKeywords(
  fs: FileSystem,
  paths: string[],
  add: string[],
  remove: string[] = [],
): Promise<SheetChange & { changed: number }> {
  const adding = cleanKeywords(add)
  if (adding.length === 0 && remove.length === 0) throw new Error('No keywords to change')
  const byDir = new Map<string, string[]>()
  for (const path of new Set(paths.map(trimSlashes))) {
    const dir = parentPath(path)
    byDir.set(dir, [...(byDir.get(dir) ?? []), baseName(path)])
  }
  const undo: UndoAction[] = []
  let changed = 0
  for (const [dir, names] of byDir) {
    const folder = await readFolder(fs, dir)
    const before = await snapshotSidecar(fs, dir)
    let touched = false
    for (const name of names) {
      const entry = folder.entries.find((e) => e.name === name)
      if (entry?.kind !== 'file' || !folder.order.includes(name)) {
        throw new Error(`Not a sheet in the library: ${joinPath(dir, name)}`)
      }
      const old = folder.keywords.get(name) ?? []
      const next = cleanKeywords([...old.filter((k) => !remove.some((r) => r.toLowerCase() === k.toLowerCase())), ...adding])
      if (next.join('\0') === old.join('\0')) continue
      if (next.length > 0) folder.keywords.set(name, next)
      else folder.keywords.delete(name)
      changed++
      touched = true
    }
    if (touched) {
      await writeFolder(fs, dir, folder)
      undo.push(before)
    }
  }
  if (changed === 0) throw new Error('Those sheets already have these keywords')
  return { undo, changed }
}
