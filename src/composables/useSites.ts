import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { resolvePartitionMode } from '../../shared/site-partition'
import type { Site } from '../../shared/types'

/** 省略 visible 字段一律视为展示，这样旧配置不需要迁移 */
export function isSiteVisible(site: Site): boolean {
  return site.visible !== false
}

/** 脱掉 Vue 的响应式代理：IPC 只能传结构化克隆得了的普通对象 */
function toPlainSites(sites: Site[]): Site[] {
  return sites.map((site) => ({ ...site }))
}

export interface SitesStore {
  /** 全部站点，数组顺序即标签栏顺序（含未展示的） */
  sites: Ref<Site[]>
  /** 实际出现在标签栏里的站点 */
  visibleSites: ComputedRef<Site[]>
  activeId: Ref<string | null>
  /** 是否已完成首次磁盘读取 */
  ready: Ref<boolean>
  /** 首次读取失败时的提示，为空表示正常 */
  loadError: Ref<string>
  load: () => Promise<void>
  findById: (id: string) => Site | undefined
  indexOf: (id: string) => number
  add: (site: Site) => Promise<void>
  insertAt: (site: Site, index: number) => Promise<void>
  update: (id: string, patch: Partial<Omit<Site, 'id'>>) => Promise<void>
  removeMany: (ids: string[]) => Promise<Site[]>
  /** 拖拽排序：直接传入重排后的完整数组（隐藏站点相对位置也随之确定） */
  reorder: (next: Site[]) => Promise<void>
  /** 现有隔离组名（去重、排序），供表单「加入已有隔离组」使用 */
  groupNames: ComputedRef<string[]>
  /** 清理已无站点引用的会话数据，返回一句结果文案 */
  cleanupSessions: () => Promise<string>
}

/**
 * 站点集合与持久化。
 *
 * 只负责「有哪些站点、顺序如何、是否展示」，不涉及激活态与视图生命周期，
 * 那部分在 useTabs 里。
 */
export function useSites(): SitesStore {
  const sites = ref<Site[]>([])
  const activeId = ref<string | null>(null)
  const ready = ref(false)
  const loadError = ref('')

  const visibleSites = computed(() => sites.value.filter(isSiteVisible))

  async function save(): Promise<void> {
    await window.electronAPI.saveSites(toPlainSites(sites.value))
  }

  async function load(): Promise<void> {
    try {
      const state = await window.electronAPI.getState()
      sites.value = state.sites ?? []
      activeId.value = state.activeSiteId
      loadError.value = ''
    } catch (err) {
      // 读不到配置时不要装作「一个站点都没有」，否则用户会以为数据丢了
      loadError.value = err instanceof Error ? err.message : String(err)
      sites.value = []
      activeId.value = null
    } finally {
      ready.value = true
    }
  }

  function findById(id: string): Site | undefined {
    return sites.value.find((site) => site.id === id)
  }

  function indexOf(id: string): number {
    return sites.value.findIndex((site) => site.id === id)
  }

  async function add(site: Site): Promise<void> {
    sites.value = [...sites.value, site]
    await save()
  }

  async function insertAt(site: Site, index: number): Promise<void> {
    const next = [...sites.value]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, site)
    sites.value = next
    await save()
  }

  async function update(id: string, patch: Partial<Omit<Site, 'id'>>): Promise<void> {
    sites.value = sites.value.map((site) => {
      if (site.id !== id) return site
      const next = { ...site, ...patch }
      // 显式写 undefined 的字段（例如把 visible 恢复成默认）直接从对象上摘掉，
      // 否则 IPC 结构化克隆会把 undefined 传过去，落盘时又是一堆冗余键
      for (const key of Object.keys(next) as Array<keyof Site>) {
        if (next[key] === undefined) delete next[key]
      }
      return next
    })
    await save()
  }

  async function removeMany(ids: string[]): Promise<Site[]> {
    const target = new Set(ids)
    if (target.size === 0) return []
    const removed = sites.value.filter((site) => target.has(site.id))
    sites.value = sites.value.filter((site) => !target.has(site.id))
    await save()
    return removed
  }

  async function reorder(next: Site[]): Promise<void> {
    sites.value = next
    await save()
  }

  /** 现有隔离组名：与「独立会话」区分开，只统计真正共享会话的组 */
  const groupNames = computed(() => {
    const names = new Set<string>()
    for (const site of sites.value) {
      if (resolvePartitionMode(site) !== 'group') continue
      const key = site.partitionKey?.trim()
      if (key) names.add(key)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  })

  /**
   * 清理会话残留。
   *
   * 删掉的站点、改过隔离组的旧分区不会自己消失，里面还是完整的 Cookie，
   * 所以这里给用户一个显式入口，而不是让它们悄悄堆在 userData 里。
   */
  async function cleanupSessions(): Promise<string> {
    try {
      const result = await window.electronAPI.cleanupSessions()
      if (result.removed === 0) return '没有需要清理的会话数据。'
      return `已清理 ${result.removed} 份会话数据：${result.partitions.join('、')}`
    } catch (err) {
      return `清理失败：${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    sites,
    visibleSites,
    activeId,
    ready,
    loadError,
    load,
    findById,
    indexOf,
    add,
    insertAt,
    update,
    removeMany,
    reorder,
    groupNames,
    cleanupSessions,
  }
}
