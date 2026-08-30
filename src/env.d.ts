interface Window {
  electronAPI: {
    createSiteView: (site: { id: string; url: string; partitionKey?: string }) => Promise<{ success: boolean }>
    switchSiteView: (siteId: string) => Promise<void>
    removeSiteView: (siteId: string) => Promise<void>
    getStoredSites: () => Promise<Array<{ id: string; name: string; url: string; partitionKey?: string }>>
    saveStoredSites: (sites: any[]) => Promise<boolean>
  }
}