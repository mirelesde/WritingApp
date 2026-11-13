import { contextBridge, ipcRenderer } from 'electron'
import type { ViewSettings } from '@writingapp/core'
import type { Api, LibraryInfo, MenuCommand } from './api'

const api: Api = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  readSheet: (path) => ipcRenderer.invoke('sheet:read', path),
  writeSheet: (path, text) => ipcRenderer.invoke('sheet:write', path, text),
  createSheet: (group, index) => ipcRenderer.invoke('op:createSheet', group, index),
  createGroup: (parent, name) => ipcRenderer.invoke('op:createGroup', parent, name),
  renameGroup: (path, name) => ipcRenderer.invoke('op:renameGroup', path, name),
  move: (paths, target, index) => ipcRenderer.invoke('op:move', paths, target, index),
  split: (path, text, offset) => ipcRenderer.invoke('op:split', path, text, offset),
  merge: (paths) => ipcRenderer.invoke('op:merge', paths),
  glue: (paths) => ipcRenderer.invoke('op:glue', paths),
  unglue: (paths) => ipcRenderer.invoke('op:unglue', paths),
  deleteNodes: (paths) => ipcRenderer.invoke('op:delete', paths),
  undo: () => ipcRenderer.invoke('op:undo'),
  groupWords: (path) => ipcRenderer.invoke('stats:group', path),
  search: (query) => ipcRenderer.invoke('search:run', query),
  previewExport: (paths) => ipcRenderer.invoke('export:preview', paths),
  saveExport: (paths) => ipcRenderer.invoke('export:save', paths),
  saveExportPdf: (paths, options) => ipcRenderer.invoke('export:savePdf', paths, options),
  getView: () => ipcRenderer.invoke('view:get'),
  setView: (patch) => ipcRenderer.invoke('view:set', patch),
  onViewChanged(callback) {
    const listener = (_event: unknown, view: ViewSettings): void => callback(view)
    ipcRenderer.on('view:changed', listener)
    return () => {
      ipcRenderer.removeListener('view:changed', listener)
    }
  },
  onMenuCommand(callback) {
    const listener = (_event: unknown, command: MenuCommand): void => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => {
      ipcRenderer.removeListener('menu:command', listener)
    }
  },
  onLibraryChanged(callback) {
    const listener = (_event: unknown, library: LibraryInfo): void => callback(library)
    ipcRenderer.on('library:changed', listener)
    return () => {
      ipcRenderer.removeListener('library:changed', listener)
    }
  },
  onLibraryOpened(callback) {
    const listener = (_event: unknown, library: LibraryInfo): void => callback(library)
    ipcRenderer.on('library:opened', listener)
    return () => {
      ipcRenderer.removeListener('library:opened', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
