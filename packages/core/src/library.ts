import type { FileSystem } from './filesystem'
import { parseSidecar, reconcileFolder, SIDECAR_NAME } from './sidecar'
import { sheetPreview, sheetTitle } from './sheet'

export interface SheetNode {
  kind: 'sheet'
  /** File name, e.g. "opening.md". */
  name: string
  path: string
  title: string
  preview: string
  /** True if this sheet is glued to the next sibling. */
  glued: boolean
}

export interface GroupNode {
  kind: 'group'
  /** Folder name. */
  name: string
  path: string
  children: LibraryNode[]
}

export type LibraryNode = SheetNode | GroupNode

/**
 * Reads a library folder into a tree. The returned group is the library
 * root; its group children are the projects. Order and glue come from each
 * folder's sidecar, reconciled with what is really on disk.
 */
export async function loadLibrary(fs: FileSystem, root: string): Promise<GroupNode> {
  const path = root.length > 1 ? root.replace(/\/+$/, '') : root
  return loadGroup(fs, path, baseName(path))
}

async function loadGroup(fs: FileSystem, path: string, name: string): Promise<GroupNode> {
  const entries = await fs.list(path)
  const sidecarPath = joinPath(path, SIDECAR_NAME)
  const sidecarText = (await fs.exists(sidecarPath)) ? await fs.readText(sidecarPath) : undefined
  const { children, glued } = reconcileFolder(parseSidecar(sidecarText), entries)
  const gluedNames = new Set(glued)

  const nodes: LibraryNode[] = []
  for (const child of children) {
    const childPath = joinPath(path, child.name)
    if (child.kind === 'directory') {
      nodes.push(await loadGroup(fs, childPath, child.name))
    } else {
      const content = await fs.readText(childPath)
      nodes.push({
        kind: 'sheet',
        name: child.name,
        path: childPath,
        title: sheetTitle(content),
        preview: sheetPreview(content),
        glued: gluedNames.has(child.name),
      })
    }
  }
  return { kind: 'group', name, path, children: nodes }
}

function joinPath(dir: string, name: string): string {
  return dir === '/' ? '/' + name : dir + '/' + name
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
