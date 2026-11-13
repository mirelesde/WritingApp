import type { DirEntry, FileSystem } from './filesystem'
import { sheetFileName } from './filename'
import { baseName, joinPath, parentPath, trimSlashes } from './path'
import { parseSidecar, reconcileFolder, SIDECAR_NAME, type Sidecar } from './sidecar'

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
}

async function readFolder(fs: FileSystem, dir: string): Promise<Folder> {
  const entries = await fs.list(dir)
  const sidecarPath = joinPath(dir, SIDECAR_NAME)
  const text = (await fs.exists(sidecarPath)) ? await fs.readText(sidecarPath) : undefined
  const { children, glued } = reconcileFolder(parseSidecar(text), entries)
  return { order: children.map((c) => c.name), glued: new Set(glued), entries }
}

async function writeFolder(fs: FileSystem, dir: string, folder: Folder): Promise<void> {
  const sidecar: Sidecar = {
    version: 1,
    order: folder.order,
    glued: folder.order.filter((name) => folder.glued.has(name)),
  }
  await fs.writeText(joinPath(dir, SIDECAR_NAME), JSON.stringify(sidecar, null, 2) + '\n')
}

function removeName(folder: Folder, name: string): void {
  const i = folder.order.indexOf(name)
  if (i < 0) return
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
 * Moves a sheet or group into `targetGroup` so it ends up at `index` among
 * that group's children (default: the end), and returns its new path. Within
 * the same group this is a reorder. A name clash in the target gets a numeric
 * suffix. Throws when moving a group into itself.
 */
export async function moveNode(
  fs: FileSystem,
  path: string,
  targetGroup: string,
  index?: number,
): Promise<string> {
  const from = trimSlashes(path)
  const target = trimSlashes(targetGroup)
  if (target === from || target.startsWith(from + '/')) {
    throw new Error('Cannot move a group into itself')
  }
  const sourceDir = parentPath(from)
  const name = baseName(from)
  const source = await readFolder(fs, sourceDir)
  const entry = source.entries.find((e) => e.name === name)
  if (!entry || !source.order.includes(name)) throw new Error(`Not part of the library: ${from}`)

  if (sourceDir === target) {
    const oldIndex = source.order.indexOf(name)
    removeName(source, name)
    const newIndex = clamp(index ?? source.order.length, source.order.length)
    if (newIndex === oldIndex) return from
    insertName(source, name, newIndex)
    await writeFolder(fs, sourceDir, source)
    return from
  }

  const dest = await readFolder(fs, target)
  const isSheet = entry.kind === 'file'
  const newName = uniqueName(name, isSheet ? '.md' : '', isSheet ? '-' : ' ', takenNames(dest))
  await fs.rename(from, joinPath(target, newName))
  removeName(source, name)
  insertName(dest, newName, index)
  await writeFolder(fs, sourceDir, source)
  await writeFolder(fs, target, dest)
  return joinPath(target, newName)
}

/** Moves a sheet or group to `index` within its own group. */
export async function reorderNode(fs: FileSystem, path: string, index: number): Promise<void> {
  await moveNode(fs, path, parentPath(trimSlashes(path)), index)
}
