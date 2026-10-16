import { app, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

import { logger } from './logger'
import { registerIpc } from './ipc'
import { attachShortcuts } from './shortcuts'
import type { ShortcutContext } from './shortcuts'
import { flushState, readState } from './store'
import { ViewManager } from './view-manager'

// 解决 ESM 环境下 __dirname 变量缺失问题
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

// 开发调试用：设置 SITE_MANAGER_DEBUG_PORT 后开启远程调试端口，
// 便于用 Chrome DevTools Protocol 驱动界面做自动化自检，默认不开启。
const debugPort = process.env.SITE_MANAGER_DEBUG_PORT
if (debugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
  logger.info('[主进程] 已开启远程调试端口:', debugPort)
}

function sendToWindow(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/**
 * 视图状态直接推给渲染进程；onViewCreated 让每个网页视图的 webContents
 * 也纳入快捷键捕获范围——否则用户点进网页后快捷键就全部失效。
 */
const viewManager = new ViewManager({
  onViewState: (state) => sendToWindow('view:state', state),
  onViewCreated: (contents) => attachShortcuts(contents, shortcutContext),
})

// 这里的回调都是延迟执行的（视图创建、按键发生时才调用），
// 所以可以放心引用下面才声明的 shortcutContext。
const shortcutContext: ShortcutContext = {
  getActiveId: () => viewManager.getActiveId(),
  reloadActive: () => {
    const id = viewManager.getActiveId()
    if (id) viewManager.reload(id)
  },
  goBack: () => {
    const id = viewManager.getActiveId()
    if (id) viewManager.goBack(id)
  },
  goForward: () => {
    const id = viewManager.getActiveId()
    if (id) viewManager.goForward(id)
  },
  dispatch: (command) => sendToWindow('shortcut:command', command),
}

/**
 * 只提供剪贴板与缩放/全屏菜单。
 *
 * 刻意不放 window / view 相关角色：它们的默认加速键（Ctrl+W 关窗、Ctrl+R 重载界面）
 * 会和标签级快捷键冲突，那些键位交给 electron/shortcuts.ts 处理。
 */
function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    // 与标签栏同色，避免窗口出现时闪白
    backgroundColor: '#1b1c28',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  viewManager.attach(mainWindow)
  attachShortcuts(mainWindow.webContents, shortcutContext)

  // 开发环境下加载 Vite 页面，生产环境下加载打包产物
  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 同一个窗口实例只注册一次 IPC，避免 createWindow 重入时重复注册
app.whenReady().then(() => {
  installApplicationMenu()
  registerIpc(viewManager)

  const state = readState()
  logger.info(
    '[主进程] 启动完成，站点数量:',
    state.sites.length,
    '上次激活:',
    state.activeSiteId ?? '（无）',
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 退出前把还在防抖中的配置写入立即落盘
app.on('before-quit', () => {
  viewManager.disposeAll()
  flushState()
})
