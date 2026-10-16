import { ref } from 'vue'
import type { Site } from '../../shared/types'
import { isLegacyBuiltinGroup, resolvePersistPartition } from '../../shared/site-partition'
import type { SitesStore } from './useSites'
import type { ViewStateStore } from './useViewStates'

/** 「恢复删除的站点」最多记住多少个 */
const CLOSED_LIMIT = 20

interface RemovedSite {
  site: Site
  /** 删除前在完整列表中的位置，恢复时插回原处 */
  index: number
}

/** 生成站点 id，避免 Date.now() 在同一毫秒内产生重复 */
export function createSiteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface EditPayload {
  name: string
  url: string
  /** 'isolated' 独立会话；'group' 与同组站点共用会话 */
  partitionMode: 'isolated' | 'group'
  /** partitionMode 为 'group' 时的组名 */
  partitionKey: string
}

/** 表单 payload → 落盘的站点字段；选了共享隔离组但没填组名时退回独立会话 */
function toSiteFields(
  payload: EditPayload,
): Pick<Site, 'name' | 'url' | 'partitionMode' | 'partitionKey'> {
  const group = payload.partitionMode === 'group' ? payload.partitionKey.trim() : ''

  return group
    ? { name: payload.name, url: payload.url, partitionMode: 'group', partitionKey: group }
    : { name: payload.name, url: payload.url, partitionMode: 'isolated' }
}

export interface TabsStore {
  select: (id: string) => Promise<void>
  clearFocus: () => Promise<void>
  addAndSelect: (site: Site) => Promise<void>
  applyEdit: (id: string, payload: EditPayload) => Promise<void>
  duplicate: (id: string) => Promise<void>
  /** 删除站点（标签管理里的删除，比原来的 ✕ 更难误触） */
  removeMany: (ids: string[]) => Promise<void>
  /** 配置是否出现在标签栏 */
  setVisible: (id: string, visible: boolean) => Promise<void>
  reopenLast: () => Promise<boolean>
  hasClosed: () => boolean
  cycle: (step: number) => Promise<void>
  jumpTo: (index: number) => Promise<void>
  jumpToLast: () => Promise<void>
  reload: (id: string, ignoreCache?: boolean) => Promise<void>
  /** 拖拽排序，下标基于「可见标签」序列 */
  move: (fromVisible: number, toVisible: number) => Promise<void>
  /**
   * 把仍在使用旧版默认隔离组的站点拆成独立会话。
   * 返回被拆分的站点数。
   */
  splitLegacyGroups: () => Promise<number>
}

/** 取站点地址的 host，用于判断隔离组里装的是不是不同的网站 */
function siteHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 标签语义：激活、增删改、显隐、排序。
 *
 * 所有与「可见标签序列」相关的操作（切换、跳转、排序、删除后的焦点接管）
 * 都只在这个子集上进行，隐藏的站点不会参与。
 */
export function useTabs(store: SitesStore, viewStates: ViewStateStore): TabsStore {
  // 用 ref 而不是普通数组：hasClosed() 要在右键菜单的禁用态里参与响应式追踪
  const removedStack = ref<RemovedSite[]>([])

  function rememberRemoved(site: Site, index: number): void {
    removedStack.value.push({ site: { ...site }, index })
    if (removedStack.value.length > CLOSED_LIMIT) removedStack.value.shift()
  }

  async function select(id: string): Promise<void> {
    const site = store.findById(id)
    if (!site) return
    // 只把 id 交给主进程：站点的 url / 隔离组属于服务端（主进程）数据，不能由渲染进程指定
    await window.electronAPI.focusSite(id)
    store.activeId.value = id
  }

  async function clearFocus(): Promise<void> {
    store.activeId.value = null
    await window.electronAPI.clearFocus()
  }

  /**
   * 当前标签消失（被删除或被隐藏）后接管焦点：
   * 优先右邻，其次左邻，都没有就清空。
   * index 为它消失前在「可见序列」里的下标。
   */
  async function focusAfterGap(index: number): Promise<void> {
    const visible = store.visibleSites.value
    if (visible.length === 0) {
      await clearFocus()
      return
    }
    const target = visible[index] ?? visible[index - 1] ?? visible[0]
    if (target) await select(target.id)
    else await clearFocus()
  }

  async function addAndSelect(site: Site): Promise<void> {
    await store.add(site)
    await select(site.id)
  }

  async function applyEdit(id: string, payload: EditPayload): Promise<void> {
    const previous = store.findById(id)
    if (!previous) return

    const fields = toSiteFields(payload)
    const nextPartition = resolvePersistPartition({ ...previous, ...fields })
    const previousPartition = resolvePersistPartition(previous)

    await store.update(id, fields)

    // 隔离组变了意味着要换一套 Session，而 Session 只能在创建视图时指定，
    // 所以必须先销毁旧视图，再让 ensure 用新分区重建
    if (nextPartition !== previousPartition) {
      await window.electronAPI.discardView(id)
      viewStates.drop(id)
    }

    // 地址变化（或刚被销毁重建）由主进程在 ensure 时处理
    if (store.activeId.value === id) await select(id)
  }

  async function duplicate(id: string): Promise<void> {
    const site = store.findById(id)
    if (!site) return
    // 副本沿用同一个隔离组：两张标签共用登录态，这正是「同站点多账号」的用法
    const copy: Site = { ...site, id: createSiteId(), name: `${site.name} 副本` }
    await store.insertAt(copy, store.indexOf(id) + 1)
    if (site.visible !== false) await select(copy.id)
  }

  async function removeMany(ids: string[]): Promise<void> {
    const target = new Set(ids)
    if (target.size === 0) return

    const active = store.activeId.value
    const activeRemoved = active !== null && target.has(active)
    const anchorIndex = active ? store.visibleSites.value.findIndex((s) => s.id === active) : 0

    for (const site of store.sites.value) {
      if (target.has(site.id)) rememberRemoved(site, store.indexOf(site.id))
    }

    const removed = await store.removeMany([...target])
    for (const site of removed) {
      viewStates.drop(site.id)
      await window.electronAPI.removeView(site.id)
    }

    if (activeRemoved) await focusAfterGap(anchorIndex < 0 ? 0 : anchorIndex)
  }

  async function setVisible(id: string, visible: boolean): Promise<void> {
    const site = store.findById(id)
    if (!site) return

    const wasActive = store.activeId.value === id
    const anchorIndex = store.visibleSites.value.findIndex((s) => s.id === id)

    // 置为 undefined 而不是 true，序列化时该字段会被直接省略，配置保持干净
    await store.update(id, { visible: visible ? undefined : false })

    if (visible) return

    // 隐藏只是从标签栏收起来，视图保留：
    // 用户随时会再勾回来，而销毁意味着正在生成的回答、没提交的表单全部丢失。
    // 真正占着不用的视图会在删除站点或清理会话时释放。
    if (wasActive) await focusAfterGap(anchorIndex < 0 ? 0 : anchorIndex)
  }

  async function reopenLast(): Promise<boolean> {
    const entry = removedStack.value.pop()
    if (!entry) return false
    // id 已被占用时继续往前找，避免插入重复站点
    if (store.findById(entry.site.id)) return reopenLast()
    await store.insertAt(entry.site, entry.index)
    if (entry.site.visible !== false) await select(entry.site.id)
    return true
  }

  function hasClosed(): boolean {
    return removedStack.value.length > 0
  }

  async function cycle(step: number): Promise<void> {
    const visible = store.visibleSites.value
    const size = visible.length
    if (size === 0) return

    const current = store.activeId.value
      ? visible.findIndex((s) => s.id === store.activeId.value)
      : -1
    const next = current < 0 ? (step > 0 ? 0 : size - 1) : (current + step + size) % size

    const target = visible[next]
    if (target) await select(target.id)
  }

  async function jumpTo(index: number): Promise<void> {
    const visible = store.visibleSites.value
    const target = visible[Math.min(Math.max(index, 0), visible.length - 1)]
    if (target) await select(target.id)
  }

  async function jumpToLast(): Promise<void> {
    const visible = store.visibleSites.value
    const target = visible[visible.length - 1]
    if (target) await select(target.id)
  }

  async function reload(id: string, ignoreCache = false): Promise<void> {
    await window.electronAPI.reloadView(id, ignoreCache)
  }

  async function move(fromVisible: number, toVisible: number): Promise<void> {    // TabBar 给出的插入位就在原位时无需处理
    if (toVisible === fromVisible || toVisible === fromVisible + 1) return

    const visible = store.visibleSites.value
    const moving = visible[fromVisible]
    if (!moving) return

    const next = [...store.sites.value]
    const fromFull = next.findIndex((site) => site.id === moving.id)
    if (fromFull < 0) return
    next.splice(fromFull, 1)

    // 插到该可见站点之前；toVisible 越界表示放到最后
    const anchor = visible[toVisible]
    const anchorFull = anchor ? next.findIndex((site) => site.id === anchor.id) : -1
    next.splice(anchorFull < 0 ? next.length : anchorFull, 0, moving)

    await store.reorder(next)
  }

  /**
   * 拆掉旧版默认隔离组。
   *
   * 早期版本给 6 个不同的 AI 站点都写了 partitionKey: 'AI'，等于让它们共用一个
   * Cookie Jar。判断依据是「组内出现了多个**不同**的站点地址」：
   * 同一网站的两个标签共用组是「多账号」的正常用法，那种情况不动它。
   */
  async function splitLegacyGroups(): Promise<number> {
    const legacy = store.sites.value.filter((site) => isLegacyBuiltinGroup(site))
    if (legacy.length === 0) return 0

    const hosts = new Set(legacy.map((site) => siteHost(site.url)))
    if (hosts.size <= 1) return 0

    for (const site of legacy) {
      await store.update(site.id, { partitionMode: 'isolated', partitionKey: undefined })

      // 旧视图挂在旧分区上，必须销毁重建，否则界面显示的和实际会话会对不上
      await window.electronAPI.discardView(site.id)
      viewStates.drop(site.id)
    }

    const active = store.activeId.value
    if (active && legacy.some((site) => site.id === active)) await select(active)
    return legacy.length
  }

  return {
    select,
    clearFocus,
    addAndSelect,
    applyEdit,
    duplicate,
    removeMany,
    setVisible,
    reopenLast,
    hasClosed,
    cycle,
    jumpTo,
    jumpToLast,
    reload,
    move,
    splitLegacyGroups,
  }
}
