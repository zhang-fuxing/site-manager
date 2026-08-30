const { contextBridge, ipcRenderer } = require('electron')
// 暴露 API 给渲染进程使用
contextBridge.exposeInMainWorld('electronAPI', {
  createSiteView: (site: { id: string; url: string; partitionKey?: string }) =>
    ipcRenderer.invoke('create-site-view', site),
  switchSiteView: (siteId: string) =>
    ipcRenderer.invoke('switch-site-view', siteId),
  removeSiteView: (siteId: string) =>
    ipcRenderer.invoke('remove-site-view', siteId),
  // 新增 electron-store 读写接口
  getStoredSites: () => ipcRenderer.invoke('get-stored-sites'),
  saveStoredSites: (sites: any[]) => ipcRenderer.invoke('save-stored-sites', sites),
})