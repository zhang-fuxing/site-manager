/**
 * 主进程与渲染进程共用的类型定义。
 *
 * 本文件只包含类型，调用方一律用 `import type` 引入，
 * 编译后会被完全擦除，不会产生任何运行时代码或跨进程依赖。
 */

/** 一个被管理的站点，同时对应界面上的一个标签页 */
export interface Site {
  id: string
  /** 用户配置的名称；页面标题尚未就绪时作为标签兜底文案 */
  name: string
  url: string
  /** 登录隔离组 Key：相同的 Key 共用 Cookie / LocalStorage，留空则按标签独立隔离 */
  partitionKey?: string
  /** 是否在标签栏展示；省略或 true 表示展示，false 表示只在标签管理里保留 */
  visible?: boolean
}

/** config/sites.json 的落盘结构 */
export interface PersistedState {
  /** 落盘格式版本，用于兼容旧版裸数组 */
  version: number
  /** 数组顺序即标签栏顺序 */
  sites: Site[]
  /** 上次激活的标签，重启后恢复 */
  activeSiteId: string | null
}

/** 主进程推送的单个网页视图运行状态 */
export interface ViewState {
  id: string
  /** 站点配置名称 */
  name: string
  /** 页面真实标题，尚未就绪时为空串 */
  title: string
  /** 当前实际地址，可能因站内跳转而与配置的起始地址不同 */
  url: string
  loading: boolean
  favicon: string
  /** 加载失败时的提示文案，正常时为空串 */
  error: string
  /** 页面历史里是否还能后退 / 前进，决定前进后退按钮的可用性 */
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * 主进程下发的标签操作指令。
 *
 * 快捷键统一在主进程的 before-input-event 里捕获（见 electron/shortcuts.ts），
 * 因为用户点进网页后焦点在原生视图上，渲染进程的 keydown 收不到。
 */
export type ShortcutCommand =
  | { kind: 'add-tab' }
  | { kind: 'close-active' }
  | { kind: 'next-tab' }
  | { kind: 'prev-tab' }
  | { kind: 'reopen-closed' }
  | { kind: 'jump-to'; position: number }
  | { kind: 'dismiss' }

/** 标签右键菜单项 */
export interface MenuItem {
  key: string
  label: string
  disabled?: boolean
  danger?: boolean
  /** 在该项之前绘制一条分隔线 */
  separatorBefore?: boolean
}

/** `window.electronAPI` 暴露给渲染进程的桥接接口 */
export interface ElectronAPI {
  /** 读取落盘的站点列表与上次激活的标签 */
  getState: () => Promise<PersistedState>
  /** 覆盖保存站点顺序，拖拽排序后调用 */
  saveSites: (sites: Site[]) => Promise<boolean>
  /** 确保视图存在并激活，同时把激活项持久化 */
  focusSite: (site: Site) => Promise<boolean>
  /** 取消激活，用于最后一个标签被关闭时 */
  clearFocus: () => Promise<boolean>
  /** 销毁单个视图 */
  removeView: (id: string) => Promise<boolean>
  /** 重新加载单个视图；ignoreCache 为 true 时强制刷新（忽略缓存） */
  reloadView: (id: string, ignoreCache?: boolean) => Promise<boolean>
  /** 页面历史后退 / 前进（站点新窗口请求会就地导航，需要它才能回退） */
  goBack: (id: string) => Promise<boolean>
  goForward: (id: string) => Promise<boolean>
  /** 原生网页视图始终盖在 Vue 之上，弹层打开时置 true 以整体隐藏 */
  setOverlay: (open: boolean) => Promise<void>
  /** 订阅视图状态变化，返回取消订阅函数 */
  onViewState: (callback: (state: ViewState) => void) => () => void
  /** 订阅主进程下发的快捷键指令，返回取消订阅函数 */
  onShortcutCommand: (callback: (command: ShortcutCommand) => void) => () => void
}
