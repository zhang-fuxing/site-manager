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
  /**
   * 会话归属：'isolated' 每个站点独立一套 Cookie / LocalStorage，
   * 'group' 与同组站点共用。省略时按有无 partitionKey 推断（见 shared/site-partition.ts）。
   */
  partitionMode?: 'isolated' | 'group'
  /**
   * 登录隔离组名。只有 partitionMode 为 'group' 时生效：
   * 组名相同的站点共用 Cookie / LocalStorage，用于同站点多账号并存。
   *
   * 注意组名会直接成为 Electron 的 persist: 分区名，所以必须是
   * /^[A-Za-z0-9_-]{1,32}$/（见 shared/site-partition.ts 的 isValidGroupKey）。
   */
  partitionKey?: string
  /** 是否在标签栏展示；省略或 true 表示展示，false 表示只在标签管理里保留 */
  visible?: boolean
}

/** config/sites.json 的落盘结构 */
export interface PersistedState {
  /** 落盘格式版本，用于兼容旧版裸数组（v1）与无分区字段的配置（v2） */
  version: number
  /** 数组顺序即标签栏顺序 */
  sites: Site[]
  /** 上次激活的标签，重启后恢复 */
  activeSiteId: string | null
  /**
   * 历史上被视图使用过的 persist 分区名（不含 persist: 前缀）。
   *
   * Electron 的 Session 数据落在 userData/Partitions 下，站点被删除或改隔离组之后
   * 那批目录会一直留着，且里面是完整的 Cookie / LocalStorage。
   * 记下这份清单，才能在「检查隔离组」里区分「还在用的会话」和「已经没人引用的残留」。
   */
  usedPartitions?: string[]
  /**
   * 数据已经清空、只剩空壳目录的分区名。
   *
   * Windows 上只要碰过某分区的 Session，Chromium 就会立刻持有它的目录句柄，
   * 清空数据之后目录本身仍然删不掉。把这类分区记下来，既不会在下次扫描时
   * 又被当成「残留」让用户反复清理，也能在下次启动（句柄已释放）时回收掉。
   */
  prunedPartitions?: string[]
}

/** 窗口尺寸与最大化状态，单独存放，与站点配置解耦 */
export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
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

/** 站点表单提交的内容，新增与编辑共用 */
export interface SiteFormPayload {
  name: string
  url: string
  /** 'isolated' 独立会话；'group' 与同组站点共用会话 */
  partitionMode: 'isolated' | 'group'
  /** partitionMode 为 'group' 时的组名 */
  partitionKey: string
}

/** 会话残留的诊断详情，用于定位「为什么没有可清理项」 */
export interface SessionDiagnostics {
  /** 应用数据目录，分区就在它下面的 Partitions/ */
  userData: string
  /** 当前站点正在引用的分区 */
  active: string[]
  /** 磁盘上真实存在的分区目录 */
  existing: string[]
  /** 配置里记录过、曾经使用过的分区 */
  remembered: string[]
  /** 上面两者的并集减去 active，即可以清理的部分 */
  orphans: string[]
}

/** 会话清理结果，用于给用户一个明确的反馈 */
export interface CleanupResult {
  /** 实际清掉的分区数 */
  removed: number
  /** 被清掉的分区名，便于日志与界面展示 */
  partitions: string[]
}

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
  /** 确保视图存在并激活，同时把激活项持久化；只传 id，站点配置由主进程查表 */
  focusSite: (id: string) => Promise<boolean>
  /** 取消激活，用于最后一个标签被关闭时 */
  clearFocus: () => Promise<boolean>
  /** 销毁单个视图（删除站点时调用） */
  removeView: (id: string) => Promise<boolean>
  /**
   * 只销毁视图、保留站点配置：隔离组变更时用来丢掉挂错 Session 的旧视图。
   * 与 removeView 的区别见 electron/ipc.ts。
   */
  discardView: (id: string) => Promise<boolean>
  /** 重新加载单个视图；ignoreCache 为 true 时强制刷新（忽略缓存） */
  reloadView: (id: string, ignoreCache?: boolean) => Promise<boolean>
  /** 页面历史后退 / 前进（站点新窗口请求会就地导航，需要它才能回退） */
  goBack: (id: string) => Promise<boolean>
  goForward: (id: string) => Promise<boolean>
  /** 原生网页视图始终盖在 Vue 之上，弹层打开时置 true 以整体隐藏 */
  setOverlay: (open: boolean) => Promise<void>
  /** 清理已经没有任何站点引用的会话残留（删掉的站点、改过隔离组的旧分区） */
  cleanupSessions: () => Promise<CleanupResult>
  /** 查询当前可清理的会话残留数量 */
  countOrphanSessions: () => Promise<number>
  /** 会话残留的诊断详情，用于定位「为什么没有可清理项」 */
  diagnoseSessions: () => Promise<SessionDiagnostics>
  /** 读取上次保存的窗口几何 */
  getWindowBounds: () => Promise<WindowBounds>
  /** 保存窗口几何（由主进程按白名单校验后再落盘） */
  saveWindowBounds: (bounds: WindowBounds) => Promise<boolean>
  /** 订阅视图状态变化，返回取消订阅函数 */
  onViewState: (callback: (state: ViewState) => void) => () => void
  /** 订阅主进程下发的快捷键指令，返回取消订阅函数 */
  onShortcutCommand: (callback: (command: ShortcutCommand) => void) => () => void
}
