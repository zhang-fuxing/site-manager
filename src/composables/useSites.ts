import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
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
  load: () => Promise<void>
  findById: (id: string) => Site | undefined
  indexOf: (id: string) => number
  add: (site: Site) => Promise<void>
  insertAt: (site: Site, index: number) => Promise<void>
  update: (id: string, patch: Partial<Omit<Site, 'id'>>) => Promise<void>
  removeMany: (ids: string[]) => Promise<Site[]>
  /** 拖拽排序：直接传入重排后的完整数组（隐藏站点相对位置也随之确定） */
  reorder: (next: Site[]) => Promise<void>
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

  const visibleSites = computed(() => sites.value.filter(isSiteVisible))

  async function save(): Promise<void> {
    await window.electronAPI.saveSites(toPlainSites(sites.value))
  }

  async function load(): Promise<void> {
    const state = await window.electronAPI.getState()
    sites.value = state.sites ?? []
    activeId.value = state.activeSiteId
    ready.value = true
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
    sites.value = sites.value.map((site) => (site.id === id ? { ...site, ...patch } : site))
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

  return {
    sites,
    visibleSites,
    activeId,
    ready,
    load,
    findById,
    indexOf,
    add,
    insertAt,
    update,
    removeMany,
    reorder,
  }
}
