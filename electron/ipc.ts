import { BrowserWindow, ipcMain } from 'electron'
import { logger } from './logger'
import { clearOrphanSessions, countOrphanSessions, diagnosticOrphans, readState, updateState } from './store'
import { readWindowBounds, saveWindowBounds } from './window-state'
import type { ViewManager } from './view-manager'
import type { Site, WindowBounds } from '../shared/types'

/**
 * 注册渲染进程可调用的 IPC 处理器。
 *
 * 视图编排与持久化的写入都收敛在这里，main.ts 只负责窗口与应用生命周期。
 * 注意：必须在 app ready 之后、且只注册一次，重复注册同名 handler 会直接抛错。
 */
export function registerIpc(views: ViewManager): void {
  // 读取站点列表与上次激活的标签
  ipcMain.handle('state:get', () => readState())

  // 覆盖保存站点顺序（拖拽排序、增删改后调用）
  ipcMain.handle('state:save-sites', (_event, sites: Site[]) => {
    if (!Array.isArray(sites)) return false
    updateState({ sites })
    logger.info('[IPC] 保存站点列表，数量:', sites.length)
    return true
  })

  /**
   * 确保视图存在并激活，同时记住这个选择供下次启动恢复。
   *
   * 这里只接受站点 id，站点的真实配置从主进程自己的状态里取：
   * 渲染进程传来的对象是不可信输入（url / partitionKey 会直接决定加载地址和 Session），
   * 走 id 查表就不存在被绕过的余地。
   */
  ipcMain.handle('view:focus', (_event, id: string) => {
    if (typeof id !== 'string') return false
    const site = readState().sites.find((item) => item.id === id)
    if (!site) return false

    views.ensure(site)
    views.setActive(site.id)
    updateState({ activeSiteId: site.id })
    return true
  })

  // 没有激活的标签时把视图全部隐藏
  ipcMain.handle('view:clear', () => {
    views.setActive(null)
    updateState({ activeSiteId: null })
    return true
  })

  ipcMain.handle('view:remove', (_event, id: string) => {
    const removed = views.remove(id)
    // 视图被销毁后主进程里就不该再有激活项，顺手把落盘状态对齐
    if (removed && views.getActiveId() === id) views.setActive(null)
    if (removed && readState().activeSiteId === id) updateState({ activeSiteId: null })
    return removed
  })

  /**
   * 只销毁视图，不动站点配置。
   *
   * 隔离组被改过时旧视图挂的是旧 Session，必须先丢掉再由下一次 ensure 重建；
   * 此刻站点还在配置里，所以 activeSiteId **不能**像删除那样被清空——
   * 否则用户改完隔离组、重启应用后就丢了「上次激活的标签」。
   */
  ipcMain.handle('view:discard', (_event, id: string) => views.remove(id))

  ipcMain.handle('view:reload', (_event, id: string, ignoreCache?: boolean) =>
    views.reload(id, Boolean(ignoreCache)),
  )

  // 站点自己开新窗口的请求会就地导航（见 view-manager），因此必须能回退
  ipcMain.handle('view:back', (_event, id: string) => views.goBack(id))

  ipcMain.handle('view:forward', (_event, id: string) => views.goForward(id))

  // 弹层（模态框、右键菜单）打开时隐藏所有原生视图
  ipcMain.handle('overlay:set', (_event, open: boolean) => {
    views.setOverlay(Boolean(open))
  })

  /** 清理已经没有任何站点引用的会话残留（删掉的站点、改过隔离组的旧分区） */
  ipcMain.handle('sessions:cleanup', () => {
    // 清理前先把视图里已经不在配置中的站点销毁，避免清掉正在使用的分区
    const known = new Set(readState().sites.map((site) => site.id))
    for (const id of views.listIds()) {
      if (!known.has(id)) views.remove(id)
    }
    return clearOrphanSessions()
  })

  ipcMain.handle('sessions:count-orphans', () => countOrphanSessions())

  /** 会话清理的诊断详情，见 store.ts 的 diagnosticOrphans */
  ipcMain.handle('sessions:diagnose', () => diagnosticOrphans())

  // ------------------------------------------------------------------ 窗口
  ipcMain.handle('window:get-bounds', () => readWindowBounds())

  ipcMain.handle('window:save-bounds', (event, bounds: WindowBounds) => {
    saveWindowBounds(bounds, BrowserWindow.fromWebContents(event.sender))
    return true
  })
}
