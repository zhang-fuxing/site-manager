import type { ElectronAPI, ShortcutCommand, ViewState } from '../shared/types'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 暴露给渲染进程的桥接接口。
 *
 * 这里只做通道转发，不包含任何业务逻辑；
 * 通道命名与 electron/ipc.ts 中的 handle 一一对应。
 */
const api: ElectronAPI = {
  getState: () => ipcRenderer.invoke('state:get'),

  saveSites: (sites) => ipcRenderer.invoke('state:save-sites', sites),

  focusSite: (site) => ipcRenderer.invoke('view:focus', site),

  clearFocus: () => ipcRenderer.invoke('view:clear'),

  removeView: (id) => ipcRenderer.invoke('view:remove', id),

  reloadView: (id, ignoreCache) => ipcRenderer.invoke('view:reload', id, ignoreCache),

  goBack: (id) => ipcRenderer.invoke('view:back', id),

  goForward: (id) => ipcRenderer.invoke('view:forward', id),

  setOverlay: (open) => ipcRenderer.invoke('overlay:set', open),

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
