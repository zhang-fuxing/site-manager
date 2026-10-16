import type {
  ElectronAPI,
  ShortcutCommand,
  Site,
  ViewState,
  WindowBounds,
} from '../shared/types'

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

/**
 * 暴露给渲染进程的桥接接口。
 *
 * 这里只做通道转发，不包含任何业务逻辑；
 * 通道命名与 electron/ipc.ts 中的 handle 一一对应。
 *
 * 注意 focusSite 传的是站点 id 而不是整个 Site 对象：站点的 url / 隔离组
 * 直接决定加载地址与 Session，不应该由渲染进程说了算。
 */
const api: ElectronAPI = {
  getState: () => ipcRenderer.invoke('state:get'),

  saveSites: (sites: Site[]) => ipcRenderer.invoke('state:save-sites', sites),

  focusSite: (id: string) => ipcRenderer.invoke('view:focus', id),

  clearFocus: () => ipcRenderer.invoke('view:clear'),

  removeView: (id: string) => ipcRenderer.invoke('view:remove', id),

  discardView: (id: string) => ipcRenderer.invoke('view:discard', id),

  reloadView: (id: string, ignoreCache?: boolean) =>
    ipcRenderer.invoke('view:reload', id, ignoreCache),

  goBack: (id: string) => ipcRenderer.invoke('view:back', id),

  goForward: (id: string) => ipcRenderer.invoke('view:forward', id),

  setOverlay: (open: boolean) => ipcRenderer.invoke('overlay:set', open),

  cleanupSessions: () => ipcRenderer.invoke('sessions:cleanup'),

  countOrphanSessions: () => ipcRenderer.invoke('sessions:count-orphans'),

  diagnoseSessions: () => ipcRenderer.invoke('sessions:diagnose'),

  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),

  saveWindowBounds: (bounds: WindowBounds) => ipcRenderer.invoke('window:save-bounds', bounds),

  // 返回取消订阅函数，方便组件卸载时清理监听
  onViewState: (callback: (state: ViewState) => void) => {
    const listener = (_event: unknown, state: ViewState) => callback(state)
    ipcRenderer.on('view:state', listener)
    return () => {
      ipcRenderer.removeListener('view:state', listener)
    }
  },

  onShortcutCommand: (callback: (command: ShortcutCommand) => void) => {
    const listener = (_event: unknown, command: ShortcutCommand) => callback(command)
    ipcRenderer.on('shortcut:command', listener)
    return () => {
      ipcRenderer.removeListener('shortcut:command', listener)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
