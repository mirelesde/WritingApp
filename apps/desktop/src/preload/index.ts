import { contextBridge, ipcRenderer } from 'electron'
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
  undo: () => ipcRenderer.invoke('op:undo'),
  previewExport: (paths) => ipcRenderer.invoke('export:preview', paths),
  saveExport: (paths) => ipcRenderer.invoke('export:save', paths),
  saveExportPdf: (paths, options) => ipcRenderer.invoke('export:savePdf', paths, options),
  onMenuCommand(callback) {
    const listener = (_event: unknown, command: MenuCommand): void => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => {
      ipcRenderer.removeListener('menu:command', listener)
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
