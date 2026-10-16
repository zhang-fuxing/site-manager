import { app, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'path'

import { logger } from './logger'
import { registerIpc } from './ipc'
import { attachShortcuts } from './shortcuts'
import type { ShortcutContext } from './shortcuts'
import { flushState, readState, sweepPrunedPartitions } from './store'
import { ViewManager } from './view-manager'
import { readWindowBounds, trackWindowBounds } from './window-state'

/**
 * 主进程打包成 CommonJS（见 vite.config.ts），所以 __dirname 直接可用，
 * 不需要再走 import.meta.url。下面这条声明是为了让类型检查器认这个 Node 全局。
 */
declare const __dirname: string

let mainWindow: BrowserWindow | null = null

// 开发调试用：设置 SITE_MANAGER_DEBUG_PORT 后开启远程调试端口，
// 便于用 Chrome DevTools Protocol 驱动界面做自动化自检，默认不开启。
const debugPort = process.env.SITE_MANAGER_DEBUG_PORT
if (debugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
  logger.info('[主进程] 已开启远程调试端口:', debugPort)
}

/**
 * 单实例锁。
 *
 * 配置写入是「全量覆盖 + 内存缓存」，两个实例同时跑必然会互相覆盖站点列表；
 * 更麻烦的是它们共用同一个 userData，Chromium 的缓存/存储目录并不支持多进程并发访问。
 * 所以第二次启动只负责把已有窗口激活，不再新建实例。
 *
 * 必须在 app ready 之前调用，否则拿不到锁。
 */
if (!app.requestSingleInstanceLock()) {
  logger.info('[主进程] 已有实例在运行，本次启动退出')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.info('[主进程] 收到第二次启动请求，尝试激活已有窗口')

    // 窗口还没建好（例如启动瞬间又被拉起一次），交给正常的启动流程
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (app.isReady() && BrowserWindow.getAllWindows().length === 0) createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void start()
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
  getActiveContents: () => viewManager.getActiveContents(),
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
  const template: MenuItemConstructorOptions[] = []

  // macOS 下没有应用菜单会让 Cmd+H / Cmd+Q 等常规操作全部失效
  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' })
  }

  template.push(
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
        // 这个菜单项作用于外壳界面；网页自身的开发者工具用 Ctrl+Shift+I / F12
        { role: 'toggleDevTools', label: '界面开发者工具' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  // 恢复上次的窗口尺寸与位置（越界或字段非法时自动回退到默认值）
  const bounds = readWindowBounds()

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    // 与标签栏同色，避免窗口出现时闪白
    backgroundColor: '#1b1c28',
    autoHideMenuBar: true,
    // 先不显示，等页面首帧渲染完再 show，避免看到白屏闪烁
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (bounds.maximized) mainWindow.maximize()

  trackWindowBounds(mainWindow)
  viewManager.attach(mainWindow)
  attachShortcuts(mainWindow.webContents, shortcutContext)

  mainWindow.once('ready-to-show', () => mainWindow?.show())

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

async function start(): Promise<void> {
  await app.whenReady()

  // 上次运行中已清空数据、只留空壳的会话目录，此时还没打开任何分区，能安全删掉
  sweepPrunedPartitions()

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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 退出前把还在防抖中的配置写入立即落盘
app.on('before-quit', () => {
  viewManager.disposeAll()
  flushState()
})
