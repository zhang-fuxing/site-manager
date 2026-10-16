<template>
  <div class="app">
    <TabBar
      :sites="visibleSites"
      :active-id="activeId"
      :states="viewStates.states"
      :can-go-back="activeViewState?.canGoBack ?? false"
      :can-go-forward="activeViewState?.canGoForward ?? false"
      @select="onSelect"
      @refresh="onRefreshTab"
      @context="onContextMenu"
      @manage="openManager"
      @move="onMove"
      @back="onBack"
      @forward="onForward"
    />

    <!-- 有可见标签时这块区域会被原生网页视图盖住，只在没有可见标签时露出空状态 -->
    <EmptyState
      v-if="visibleSites.length === 0"
      :all-hidden="sites.length > 0"
      @add="onEmptyAction"
    />
    <main v-else class="app__canvas" />

    <!-- 管理面板先渲染，确认框在其后，保证删除确认叠在面板之上 -->
    <SiteManagerModal
      :open="showManager"
      :sites="sites"
      :active-id="activeId"
      :can-restore="tabs.hasClosed()"
      :initial-mode="managerMode"
      :initial-site-id="managerSiteId"
      @close="closeManager"
      @add="onCreateSite"
      @update="onUpdateSite"
      @remove="onRemoveSite"
      @duplicate="onDuplicateSite"
      @set-visible="onSetVisible"
      @restore="onRestore"
    />

    <ConfirmDialog
      :open="confirmRequest !== null"
      :title="confirmRequest?.title ?? ''"
      :message="confirmRequest?.message ?? ''"
      :hint="confirmRequest?.hint"
      :confirm-text="confirmRequest?.confirmText ?? '确定'"
      :danger="confirmRequest?.danger ?? false"
      @cancel="confirmRequest = null"
      @confirm="runConfirm"
    />

    <TabContextMenu
      v-if="contextMenu"
      :x="contextMenu?.x ?? 0"
      :y="contextMenu?.y ?? 0"
      :items="menuItems"
      @select="onMenuSelect"
      @dismiss="contextMenu = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TabBar from './components/TabBar.vue'
import EmptyState from './components/EmptyState.vue'
import SiteManagerModal from './components/SiteManagerModal.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import TabContextMenu from './components/TabContextMenu.vue'
import { useSites } from './composables/useSites'
import { createSiteId, useTabs } from './composables/useTabs'
import { useViewStates } from './composables/useViewStates'
import { useShortcuts } from './composables/useShortcuts'
import type { MenuItem, Site } from '../shared/types'

const sitesStore = useSites()
const { sites, visibleSites, activeId } = sitesStore
const viewStates = useViewStates()
const tabs = useTabs(sitesStore, viewStates)

type SitePayload = { name: string; url: string; partitionKey: string }

// ------------------------------------------------------------------ 弹层状态

const showManager = ref(false)
const managerMode = ref<'list' | 'create' | 'edit'>('list')
const managerSiteId = ref<string | null>(null)

const contextMenu = ref<{ site: Site; x: number; y: number } | null>(null)

interface ConfirmRequest {
  title: string
  message: string
  hint?: string
  confirmText: string
  danger: boolean
  run: () => void | Promise<void>
}

const confirmRequest = ref<ConfirmRequest | null>(null)

/**
 * 原生网页视图永远绘制在 Vue 界面之上，任何弹层出现时都得让主进程整体隐藏视图，
 * 否则弹层会被网页盖住。这里用「是否存在任意弹层」一次性驱动，避免多个弹层
 * 交替开关时反复隐藏/恢复造成闪烁。
 */
const overlayOpen = computed(
  () =>
    showManager.value || confirmRequest.value !== null || contextMenu.value !== null,
)

watch(overlayOpen, (open) => {
  void window.electronAPI.setOverlay(open)
})

// ------------------------------------------------------------------ 标签操作

/** 当前激活标签的视图状态，决定前进后退按钮是否可用 */
const activeViewState = computed(() =>
  activeId.value ? viewStates.get(activeId.value) : undefined,
)

function onBack(): void {
  if (activeId.value) void window.electronAPI.goBack(activeId.value)
}

function onForward(): void {
  if (activeId.value) void window.electronAPI.goForward(activeId.value)
}

function onSelect(id: string): void {
  void tabs.select(id)
}

function onMove(fromVisible: number, toVisible: number): void {
  void tabs.move(fromVisible, toVisible)
}

/** 标签上的按钮：强制刷新（忽略缓存） */
function onRefreshTab(site: Site): void {
  void tabs.reload(site.id, true)
}

function onContextMenu(site: Site, event: MouseEvent): void {
  contextMenu.value = { site, x: event.clientX, y: event.clientY }
}

// ------------------------------------------------------------------ 标签管理

function openManager(): void {
  managerMode.value = 'list'
  managerSiteId.value = null
  showManager.value = true
}

function openManagerForCreate(): void {
  managerMode.value = 'create'
  managerSiteId.value = null
  showManager.value = true
}

function openManagerForEdit(site: Site): void {
  managerMode.value = 'edit'
  managerSiteId.value = site.id
  showManager.value = true
}

function closeManager(): void {
  showManager.value = false
  managerMode.value = 'list'
  managerSiteId.value = null
}

function onEmptyAction(): void {
  if (sites.value.length === 0) openManagerForCreate()
  else openManager()
}

async function onCreateSite(payload: SitePayload): Promise<void> {
  await tabs.addAndSelect({
    id: createSiteId(),
    name: payload.name,
    url: payload.url,
    partitionKey: payload.partitionKey || undefined,
  })
}

async function onUpdateSite(id: string, payload: SitePayload): Promise<void> {
  await tabs.applyEdit(id, payload)
}

async function onDuplicateSite(site: Site): Promise<void> {
  await tabs.duplicate(site.id)
}

function onSetVisible(id: string, visible: boolean): void {
  void tabs.setVisible(id, visible)
}

async function onRestore(): Promise<void> {
  await tabs.reopenLast()
}

/**
 * 删除入口已经从标签上移到管理面板，误触概率大幅下降；
 * 这里仍然保留一次确认，因为删除会真正从配置里移除。
 */
function onRemoveSite(site: Site): void {
  confirmRequest.value = {
    title: '确认删除站点',
    message: `确定要删除「${site.name}」吗？`,
    hint: '删除后会从配置中移除；可用「恢复上次删除」或 Ctrl+Shift+T 找回。',
    confirmText: '删除',
    danger: true,
    run: () => tabs.removeMany([site.id]),
  }
}

async function runConfirm(): Promise<void> {
  const request = confirmRequest.value
  confirmRequest.value = null
  if (request) await request.run()
}

// ------------------------------------------------------------------ 标签右键菜单（只保留视图级操作）

const menuItems = computed<MenuItem[]>(() => {
  if (!contextMenu.value) return []
  return [
    { key: 'reload', label: '重新加载' },
    { key: 'hard-reload', label: '强制刷新（忽略缓存）' },
    { key: 'hide', label: '隐藏此标签', separatorBefore: true },
    { key: 'manage', label: '在标签管理中编辑' },
  ]
})

async function onMenuSelect(key: string): Promise<void> {
  const context = contextMenu.value
  contextMenu.value = null
  if (!context) return

  const { site } = context

  if (key === 'reload') {
    await tabs.reload(site.id)
    return
  }
  if (key === 'hard-reload') {
    await tabs.reload(site.id, true)
    return
  }
  if (key === 'hide') {
    await tabs.setVisible(site.id, false)
    return
  }
  if (key === 'manage') {
    openManagerForEdit(site)
  }
}

// ------------------------------------------------------------------ 快捷键

useShortcuts({
  addTab: openManagerForCreate,
  closeActive: () => {
    // 标签上的 ✕ 已经移除，Ctrl+W 改为「隐藏当前标签」这个可逆操作，
    // 删除只能在标签管理里完成。
    const id = activeId.value
    if (id) void tabs.setVisible(id, false)
  },
  nextTab: () => void tabs.cycle(1),
  prevTab: () => void tabs.cycle(-1),
  reopenClosed: () => void tabs.reopenLast(),
  jumpToTab: (position) => {
    // Ctrl+9 约定为最后一个标签，与浏览器一致
    if (position === 9) void tabs.jumpToLast()
    else void tabs.jumpTo(position - 1)
  },
  dismissOverlay: () => {
    if (contextMenu.value) {
      contextMenu.value = null
      return true
    }
    if (confirmRequest.value) {
      confirmRequest.value = null
      return true
    }
    if (showManager.value) {
      closeManager()
      return true
    }
    return false
  },
})

// ------------------------------------------------------------------ 生命周期

onMounted(async () => {
  await sitesStore.load()

  // 恢复上次激活的标签；被删掉或已被隐藏则退回第一个可见标签
  const restored = activeId.value ? sitesStore.findById(activeId.value) : undefined
  const target = restored && restored.visible !== false ? restored : visibleSites.value[0]

  if (target) await tabs.select(target.id)
  else await tabs.clearFocus()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app__canvas {
  flex: 1 1 auto;
  min-height: 0;
  background: var(--bg-canvas);
}
</style>
