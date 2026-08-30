import { app, BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

// 引入自定义日志与数据存储模块
import { logger } from './logger'
import { readSitesFromFile, writeSitesToFile, Site } from './store'

// 解决 ESM 环境下 __dirname 变量缺失问题
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 视图布局配置
const HEADER_HEIGHT = 50

let mainWindow: BrowserWindow | null = null
const viewsMap = new Map<string, WebContentsView>()
let currentActiveId: string | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 开发环境下加载 Vite 页面，生产环境下加载打包产物
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 窗口改变大小时自动调整视图边界
  mainWindow.on('resize', () => {
    if (currentActiveId && viewsMap.has(currentActiveId)) {
      updateViewBounds(viewsMap.get(currentActiveId)!)
    }
  })
}

// 动态调整 WebContentsView 的尺寸与位置
function updateViewBounds(view: WebContentsView) {
  if (!mainWindow) return
  const [width, height] = mainWindow.getContentSize()
  view.setBounds({
    x: 0,
    y: HEADER_HEIGHT,
    width: width,
    height: Math.max(0, height - HEADER_HEIGHT),
  })
}

// ---------------- IPC 事件监听器 ----------------

// 1. 创建新的站点 View
ipcMain.handle('create-site-view', async (_, site: Site) => {
  const { id, url, partitionKey } = site
  logger.info('[主进程] 收到创建站点请求，siteId:', id, 'url:', url, 'partitionKey:', partitionKey)
  if (viewsMap.has(id)) return { success: true }

  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:${partitionKey || id}`,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 拦截外链并在系统默认浏览器打开
  view.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  view.webContents.loadURL(url)
  viewsMap.set(id, view)
  return { success: true }
})

// 2. 切换当前显示的站点 View
ipcMain.handle('switch-site-view', async (_, siteId: string) => {
  if (!mainWindow) return

  // 移除旧视图
  if (currentActiveId && viewsMap.has(currentActiveId)) {
    const oldView = viewsMap.get(currentActiveId)!
    mainWindow.contentView.removeChildView(oldView)
  }

  // 加载新视图
  if (viewsMap.has(siteId)) {
    const newView = viewsMap.get(siteId)!
    mainWindow.contentView.addChildView(newView)
    updateViewBounds(newView)
    currentActiveId = siteId
  }
})

// 3. 移除/销毁指定站点 View
ipcMain.handle('remove-site-view', async (_, siteId: string) => {
  logger.info('[主进程] 收到删除请求，siteId:', siteId)

  if (!mainWindow) {
    logger.error('[主进程] 错误: mainWindow 为空')
    return { success: false, reason: 'window_null' }
  }

  if (viewsMap.has(siteId)) {
    logger.info('[主进程] 命中 viewsMap，准备移除 View:', siteId)
    const view = viewsMap.get(siteId)!

    if (currentActiveId === siteId) {
      logger.info('[主进程] 正在移除当前激活的 View 视图')
      mainWindow.contentView.removeChildView(view)
      currentActiveId = null
    }

    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.destroy()
        logger.info('[主进程] webContents.destroy() 成功')
      }
    } catch (e) {
      logger.error('[主进程] 销毁网页视图异常:', e)
    }

    viewsMap.delete(siteId)
    logger.info('[主进程] 成功从 viewsMap 中删除:', siteId)
    return { success: true }
  } else {
    logger.warn('[主进程] 警告: viewsMap 中未找到该 siteId:', siteId)
    return { success: false, reason: 'not_found' }
  }
})

// 4. 获取站点列表
ipcMain.handle('get-stored-sites', () => {
  const sites = readSitesFromFile()
  logger.info('[主进程] 读取本地站点配置，数据量:', sites.length)
  return sites
})

// 5. 保存站点列表
ipcMain.handle('save-stored-sites', (_, newSites: Site[]) => {
  logger.info('[主进程] 收到更新站点配置请求')
  return writeSitesToFile(newSites)
})

// ---------------- 应用生命周期 ----------------

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})