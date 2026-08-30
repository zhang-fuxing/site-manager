//#region electron/preload.ts
var { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
	createSiteView: (site) => ipcRenderer.invoke("create-site-view", site),
	switchSiteView: (siteId) => ipcRenderer.invoke("switch-site-view", siteId),
	removeSiteView: (siteId) => ipcRenderer.invoke("remove-site-view", siteId),
	getStoredSites: () => ipcRenderer.invoke("get-stored-sites"),
	saveStoredSites: (sites) => ipcRenderer.invoke("save-stored-sites", sites)
});
//#endregion
