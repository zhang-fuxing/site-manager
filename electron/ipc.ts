import { ipcMain } from 'electron'
import { logger } from './logger'
import { readState, updateState } from './store'
import type { ViewManager } from './view-manager'
import type { Site } from '../shared/types'

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

  // 确保视图存在并激活，同时记住这个选择供下次启动恢复
  ipcMain.handle('view:focus', (_event, site: Site) => {
    if (!site || typeof site.id !== 'string') return false
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

  ipcMain.handle('view:remove', (_event, id: string) => views.remove(id))

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
}
