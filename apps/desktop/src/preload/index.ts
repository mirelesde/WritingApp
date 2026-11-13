import { contextBridge, ipcRenderer } from 'electron'
import type { Api, LibraryInfo } from './api'

const api: Api = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  readSheet: (path) => ipcRenderer.invoke('sheet:read', path),
  writeSheet: (path, text) => ipcRenderer.invoke('sheet:write', path, text),
  onLibraryOpened(callback) {
    const listener = (_event: unknown, library: LibraryInfo): void => callback(library)
    ipcRenderer.on('library:opened', listener)
    return () => {
      ipcRenderer.removeListener('library:opened', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
