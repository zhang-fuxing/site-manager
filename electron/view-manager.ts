import { BrowserWindow, WebContentsView, shell } from 'electron'
import type { WebContents } from 'electron'
import { logger } from './logger'
import type { Site, ViewState } from '../shared/types'

/**
 * 网页视图的起始纵向偏移。
 * 必须与渲染进程顶部标签栏高度保持一致，见 src/styles/base.css 的 --header-height。
 */
const HEADER_HEIGHT = 50

/** 加载被主动打断（例如站内跳转取消了上一次请求）不应该算失败 */
const ERR_ABORTED = -3

export interface ViewManagerHooks {
  /** 某个视图状态变化，用于推送给渲染进程 */
  onViewState: (state: ViewState) => void
  /** 新建视图后回调，便于主进程给这个 webContents 挂上快捷键处理 */
  onViewCreated: (contents: WebContents) => void
}

/**
 * 管理所有站点的原生网页视图。
 *
 * 设计要点：视图一旦创建就常驻在窗口视图树里，切换标签只改可见性，
 * 不再做「摘掉旧视图 / 挂上新视图」——那样会丢掉页面状态，
 * 且在弹层需要临时隐藏视图时无从恢复。页面保活与切换速度都更好。
 */
export class ViewManager {
  private readonly views = new Map<string, WebContentsView>()
  private readonly states = new Map<string, ViewState>()
  /** 站点配置的起始地址，与 state.url（可能已被站内跳转改写）分开记录 */
  private readonly configuredUrls = new Map<string, string>()
  private readonly hooks: ViewManagerHooks
  private win: BrowserWindow | null = null
  private activeId: string | null = null
  private overlayOpen = false

  constructor(hooks: ViewManagerHooks) {
    this.hooks = hooks
  }

  attach(win: BrowserWindow): void {
    this.win = win
    win.on('resize', () => this.layoutAll())
    win.on('closed', () => {
      this.win = null
      this.disposeAll()
    })
  }

  /** 确保站点视图已存在；站点地址被编辑过时自动重新加载 */
  ensure(site: Site): boolean {
    const existing = this.views.get(site.id)
    if (existing) return this.refresh(site, existing)
    if (!this.win) return false

    const view = new WebContentsView({
      webPreferences: {
        // 同一隔离组共用 Session，实现同站点多账号并存
        partition: `persist:${site.partitionKey || site.id}`,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    this.views.set(site.id, view)
    this.configuredUrls.set(site.id, site.url)
    this.states.set(site.id, {
      id: site.id,
      name: site.name,
      title: '',
      url: site.url,
      loading: true,
      favicon: '',
      error: '',
      canGoBack: false,
      canGoForward: false,
    })

    this.wire(site, view)
    this.hooks.onViewCreated(view.webContents)
    this.win.contentView.addChildView(view)
    this.layout(view)
    this.applyVisibility()
    this.load(view, site.url)

    logger.info('[ViewManager] 创建视图:', site.id, site.url)
    return true
  }

  /** 激活某个标签；传入不存在的 id 时只是让它在下一次 ensure 后生效 */
  setActive(id: string | null): void {
    this.activeId = id
    this.applyVisibility()
  }

  getActiveId(): string | null {
    return this.activeId
  }

  /**
   * 原生视图永远绘制在 BrowserWindow 内容之上，弹层无法盖住它，
   * 所以用 setVisible 整体隐藏，而不是把视图从视图树里摘掉。
   */
  setOverlay(open: boolean): void {
    if (this.overlayOpen === open) return
    this.overlayOpen = open
    this.applyVisibility()
  }

  layoutAll(): void {
    for (const view of this.views.values()) this.layout(view)
  }

  /** ignoreCache 为 true 时强制刷新（忽略缓存），对应标签上的刷新按钮 */
  reload(id: string, ignoreCache = false): boolean {
    const view = this.views.get(id)
    if (!view || view.webContents.isDestroyed()) return false
    if (ignoreCache) view.webContents.reloadIgnoringCache()
    else view.webContents.reload()
    return true
  }

  goBack(id: string): boolean {
    return this.travel(id, 'back')
  }

  goForward(id: string): boolean {
    return this.travel(id, 'forward')
  }

  remove(id: string): boolean {
    const view = this.views.get(id)
    this.views.delete(id)
    this.states.delete(id)
    this.configuredUrls.delete(id)
    if (this.activeId === id) this.activeId = null
    if (!view) return false

    try {
      if (this.win && !this.win.isDestroyed()) this.win.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    } catch (err) {
      logger.error('[ViewManager] 销毁视图异常:', err)
    }
    logger.info('[ViewManager] 已销毁视图:', id)
    return true
  }

  disposeAll(): void {
    for (const id of [...this.views.keys()]) this.remove(id)
  }

  // ---------------------------------------------------------------- 内部实现

  private travel(id: string, direction: 'back' | 'forward'): boolean {
    const view = this.views.get(id)
    if (!view || view.webContents.isDestroyed()) return false

    const history = view.webContents.navigationHistory
    const canTravel = direction === 'back' ? history.canGoBack() : history.canGoForward()
    if (!canTravel) return false

    if (direction === 'back') history.goBack()
    else history.goForward()
    return true
  }

  private refresh(site: Site, view: WebContentsView): boolean {
    const state = this.states.get(site.id)
    if (state) state.name = site.name

    if (this.configuredUrls.get(site.id) !== site.url) {
      this.configuredUrls.set(site.id, site.url)
      if (state) {
        state.url = site.url
        state.title = ''
        state.error = ''
      }
      logger.info('[ViewManager] 站点地址已变更，重新加载:', site.id, site.url)
      this.load(view, site.url)
    }

    this.patch(site.id, {}, view.webContents)
    return true
  }

  private load(view: WebContentsView, url: string): void {
    if (view.webContents.isDestroyed()) return
    void view.webContents.loadURL(url).catch((err: unknown) => {
      logger.error('[ViewManager] 发起加载失败:', url, err)
    })
  }

  private applyVisibility(): void {
    for (const [id, view] of this.views) {
      view.setVisible(!this.overlayOpen && id === this.activeId)
    }
  }

  private layout(view: WebContentsView): void {
    if (!this.win) return
    const [width, height] = this.win.getContentSize()
    view.setBounds({
      x: 0,
      y: HEADER_HEIGHT,
      width,
      height: Math.max(0, height - HEADER_HEIGHT),
    })
  }

  private wire(site: Site, view: WebContentsView): void {
    const wc = view.webContents
    const id = site.id

    wc.on('page-title-updated', (_event, title) => this.patch(id, { title }))
    wc.on('page-favicon-updated', (_event, favicons) =>
      this.patch(id, { favicon: favicons[0] ?? '' }),
    )
    wc.on('did-start-loading', () => this.patch(id, { loading: true, error: '' }))
    wc.on('did-stop-loading', () => this.patch(id, { loading: false }, wc))
    wc.on('did-navigate', () => this.patch(id, {}, wc))
    wc.on('did-navigate-in-page', () => this.patch(id, {}, wc))

    wc.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED) return
      logger.warn('[ViewManager] 页面加载失败:', failedUrl, code, description)
      this.patch(id, { loading: false, error: `${description}（${code}）` })
    })

    wc.setWindowOpenHandler(({ url }) => {
      // 站点自己发起的「开新标签 / 开新窗口」一律在当前标签内就地导航：
      // 标签栏只保留用户手动添加的标签，浏览体验更接近单页应用。
      if (/^https?:/i.test(url)) {
        // 必须等拒绝逻辑返回后再发起导航，否则会和这次的窗口请求打架
        setImmediate(() => {
          if (!wc.isDestroyed()) this.load(view, url)
        })
      } else {
        // mailto: / tel: 之类没有页面可渲染，交给系统处理
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })
  }

  /**
   * 合并写入状态并广播。
   * 传入 webContents 时顺带刷新真实地址与前进后退可用性。
   */
  private patch(id: string, partial: Partial<ViewState>, wc?: WebContents): void {
    const state = this.states.get(id)
    if (!state) return

    Object.assign(state, partial)

    if (wc && !wc.isDestroyed()) {
      state.url = wc.getURL() || state.url
      state.canGoBack = wc.navigationHistory.canGoBack()
      state.canGoForward = wc.navigationHistory.canGoForward()
    }

    this.hooks.onViewState({ ...state })
  }
}
