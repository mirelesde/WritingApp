import { contextBridge, ipcRenderer } from 'electron'
import type { ViewSettings } from '@writingapp/core'
import type { Api, LibraryInfo, MenuCommand } from './api'

const api: Api = {
  journalPut: (path, text) => ipcRenderer.invoke('journal:put', path, text),
  journalClear: (path) => ipcRenderer.invoke('journal:clear', path),
  journalPending: () => ipcRenderer.invoke('journal:pending'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  readSheet: (path) => ipcRenderer.invoke('sheet:read', path),
  writeSheet: (path, text) => ipcRenderer.invoke('sheet:write', path, text),
  createSheet: (group, index) => ipcRenderer.invoke('op:createSheet', group, index),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (text) => ipcRenderer.invoke('templates:save', text),
  newFromTemplate: (group, template, index) =>
    ipcRenderer.invoke('op:newFromTemplate', group, template, index),
  dailyNote: (group) => ipcRenderer.invoke('op:dailyNote', group),
  createGroup: (parent, name) => ipcRenderer.invoke('op:createGroup', parent, name),
  renameGroup: (path, name) => ipcRenderer.invoke('op:renameGroup', path, name),
  syncSheetNames: (paths) => ipcRenderer.invoke('op:syncSheetNames', paths),
  move: (paths, target, index) => ipcRenderer.invoke('op:move', paths, target, index),
  copy: (paths, target, index, label) => ipcRenderer.invoke('op:copy', paths, target, index, label),
  split: (path, text, offset) => ipcRenderer.invoke('op:split', path, text, offset),
  merge: (paths) => ipcRenderer.invoke('op:merge', paths),
  setColor: (path, color) => ipcRenderer.invoke('op:setColor', path, color),
  glue: (paths) => ipcRenderer.invoke('op:glue', paths),
  unglue: (paths) => ipcRenderer.invoke('op:unglue', paths),
  deleteNodes: (paths) => ipcRenderer.invoke('op:delete', paths),
  undo: () => ipcRenderer.invoke('op:undo'),
  groupWords: (path) => ipcRenderer.invoke('stats:group', path),
  search: (query) => ipcRenderer.invoke('search:run', query),
  replaceAll: (query, replacement, only) =>
    ipcRenderer.invoke('op:replaceAll', query, replacement, only),
  previewExport: (paths) => ipcRenderer.invoke('export:preview', paths),
  saveExport: (paths) => ipcRenderer.invoke('export:save', paths),
  saveExportPdf: (paths, options) => ipcRenderer.invoke('export:savePdf', paths, options),
  getLastSheet: () => ipcRenderer.invoke('session:lastSheet'),
  setLastSheet: (path) => ipcRenderer.invoke('session:setLastSheet', path),
  getView: () => ipcRenderer.invoke('view:get'),
  setView: (patch) => ipcRenderer.invoke('view:set', patch),
  onViewChanged(callback) {
    const listener = (_event: unknown, view: ViewSettings): void => callback(view)
    ipcRenderer.on('view:changed', listener)
    return () => {
      ipcRenderer.removeListener('view:changed', listener)
    }
  },
  listThemes: () => ipcRenderer.invoke('themes:list'),
  openThemesFolder: () => ipcRenderer.invoke('themes:openFolder'),
  showNodeMenu: (kind, path, canPaste) => ipcRenderer.invoke('menu:node', kind, path, canPaste),
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
