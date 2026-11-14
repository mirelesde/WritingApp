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
  importFiles: (group, index) => ipcRenderer.invoke('import:files', group, index),
  chooseImages: () => ipcRenderer.invoke('image:choose'),
  saveImage: (name, data) => ipcRenderer.invoke('image:save', name, data),
  unusedImages: () => ipcRenderer.invoke('image:unused'),
  trashUnusedImages: (names) => ipcRenderer.invoke('image:trashUnused', names),
  copy: (paths, target, index, label) => ipcRenderer.invoke('op:copy', paths, target, index, label),
  split: (path, text, offset) => ipcRenderer.invoke('op:split', path, text, offset),
  merge: (paths) => ipcRenderer.invoke('op:merge', paths),
  setColor: (path, color) => ipcRenderer.invoke('op:setColor', path, color),
  changeKeywords: (paths, add, remove) => ipcRenderer.invoke('op:keywords', paths, add, remove),
  glue: (paths) => ipcRenderer.invoke('op:glue', paths),
  unglue: (paths) => ipcRenderer.invoke('op:unglue', paths),
  deleteNodes: (paths) => ipcRenderer.invoke('op:delete', paths),
  undo: () => ipcRenderer.invoke('op:undo'),
  groupWords: (path) => ipcRenderer.invoke('stats:group', path),
  search: (query, options) => ipcRenderer.invoke('search:run', query, options),
  replaceAll: (query, replacement, only, options) =>
    ipcRenderer.invoke('op:replaceAll', query, replacement, only, options),
  previewExport: (paths) => ipcRenderer.invoke('export:preview', paths),
  saveExport: (paths, pictures, css) => ipcRenderer.invoke('export:save', paths, pictures, css),
  saveExportMarkdown: (paths) => ipcRenderer.invoke('export:saveMarkdown', paths),
  saveExportDocx: (paths, options) => ipcRenderer.invoke('export:saveDocx', paths, options),
  saveExportPdf: (paths, options, css) => ipcRenderer.invoke('export:savePdf', paths, options, css),
  chooseEpubCover: () => ipcRenderer.invoke('export:chooseCover'),
  saveExportEpub: (paths, options, css) => ipcRenderer.invoke('export:saveEpub', paths, options, css),
  exportStyles: () => ipcRenderer.invoke('exportStyles:list'),
  saveExportStyle: (name, description, css, id) =>
    ipcRenderer.invoke('exportStyles:save', name, description, css, id),
  deleteExportStyle: (id) => ipcRenderer.invoke('exportStyles:delete', id),
  openExportStylesFolder: () => ipcRenderer.invoke('exportStyles:openFolder'),
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
  onEditMenu(callback) {
    const listener = (_event: unknown, info: Parameters<typeof callback>[0]): void => callback(info)
    ipcRenderer.on('context:edit', listener)
    return () => {
      ipcRenderer.removeListener('context:edit', listener)
    }
  },
  editCommand: (command) => ipcRenderer.invoke('context:editCommand', command),
  replaceMisspelling: (word) => ipcRenderer.invoke('context:replaceMisspelling', word),
  addToDictionary: (word) => ipcRenderer.invoke('context:addToDictionary', word),
  revealPath: (path) => ipcRenderer.invoke('context:reveal', path),
  copyPath: (path) => ipcRenderer.invoke('context:copyPath', path),
  newWindow: (sheet, at) => ipcRenderer.invoke('window:new', sheet, at),
  initialSheet: () => ipcRenderer.invoke('window:initialSheet'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
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
