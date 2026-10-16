<template>
  <div class="app">
    <TabBar
      :sites="visibleSites"
      :active-id="activeId"
      :states="viewStates.states"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
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
      v-if="visibleSites.length === 0 && !sitesStore.loadError.value"
      :all-hidden="sites.length > 0"
      @add="onEmptyAction"
    />
    <main v-else class="app__canvas">
      <p v-if="sitesStore.loadError.value" class="app__error">
        读取配置失败：{{ sitesStore.loadError.value }}
        <button type="button" class="app__retry" @click="reload">重试</button>
      </p>
    </main>

    <!-- 管理面板先渲染，确认框在其后，保证删除确认叠在面板之上 -->
    <SiteManagerModal
      :open="showManager"
      :sites="sites"
      :active-id="activeId"
      :can-restore="tabs.hasClosed()"
      :group-names="sitesStore.groupNames.value"
      :orphan-count="orphanCount"
      :cleanup-busy="cleanupBusy"
      :cleanup-result="cleanupResult"
      :diagnostics="sessionDiagnostics"
      :initial-mode="managerMode"
      :initial-site-id="managerSiteId"
      @close="closeManager"
      @add="onCreateSite"
      @update="onUpdateSite"
      @remove="onRemoveSite"
      @duplicate="onDuplicateSite"
      @set-visible="onSetVisible"
      @restore="onRestore"
      @split-legacy="onSplitLegacy"
      @cleanup="onCleanupSessions"
      @inspect="onInspectSessions"
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
import type { MenuItem, Site, SiteFormPayload } from '../shared/types'

const sitesStore = useSites()
const { sites, visibleSites, activeId } = sitesStore
const viewStates = useViewStates()
const tabs = useTabs(sitesStore, viewStates)

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
const canGoBack = computed(() => activeViewState.value?.canGoBack ?? false)
const canGoForward = computed(() => activeViewState.value?.canGoForward ?? false)

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

/** 可清理的会话残留数量，打开管理面板时刷新 */
const orphanCount = ref(0)
const cleanupBusy = ref(false)
const cleanupResult = ref('')
const sessionDiagnostics = ref('')

async function refreshOrphanCount(): Promise<void> {
  try {
    orphanCount.value = await window.electronAPI.countOrphanSessions()
  } catch {
    orphanCount.value = 0
  }
}

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

// 面板打开时统计一次残留；列表变化（删站点、改隔离组）后也要跟着更新
watch([showManager, sites], () => {
  if (showManager.value) void refreshOrphanCount()
})

function onEmptyAction(): void {
  if (sites.value.length === 0) openManagerForCreate()
  else openManager()
}

async function onCreateSite(payload: SiteFormPayload): Promise<void> {
  await tabs.addAndSelect({
    id: createSiteId(),
    name: payload.name,
    url: payload.url,
    ...(payload.partitionMode === 'group' && payload.partitionKey
      ? { partitionMode: 'group' as const, partitionKey: payload.partitionKey }
      : { partitionMode: 'isolated' as const }),
  })
  await refreshOrphanCount()
}

async function onUpdateSite(id: string, payload: SiteFormPayload): Promise<void> {
  await tabs.applyEdit(id, payload)
  await refreshOrphanCount()
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

/** 把旧版本默认的「AI」隔离组拆成各自独立的会话 */
async function onSplitLegacy(): Promise<void> {
  cleanupBusy.value = true
  try {
    const count = await tabs.splitLegacyGroups()
    cleanupResult.value =
      count > 0
        ? `已把 ${count} 个站点拆成独立会话，它们需要重新登录一次。`
        : '这个隔离组里只有一个网站，属于正常的多账号用法，未做改动。'
    await refreshOrphanCount()
  } finally {
    cleanupBusy.value = false
  }
}

async function onCleanupSessions(): Promise<void> {
  cleanupBusy.value = true
  cleanupResult.value = ''
  sessionDiagnostics.value = ''
  try {
    cleanupResult.value = await sitesStore.cleanupSessions()
  } finally {
    cleanupBusy.value = false
    await refreshOrphanCount()
  }
}

/**
 * 把会话扫描的中间结果摊开给用户看。
 *
 * 「没有可清理的会话」和「扫描没找到目录」在界面上是同一个结果，
 * 出问题时无从下手；这里把「真实存在的目录 / 当前引用 / 记录过的」都列出来，
 * 一眼就能看出差异在哪。
 */
async function onInspectSessions(): Promise<void> {
  try {
    const diag = await window.electronAPI.diagnoseSessions()
    sessionDiagnostics.value = [
      `数据目录：${diag.userData}`,
      `正在使用（${diag.active.length}）：${diag.active.join('、') || '无'}`,
      `磁盘上存在（${diag.existing.length}）：${diag.existing.join('、') || '无'}`,
      `历史记录（${diag.remembered.length}）：${diag.remembered.join('、') || '无'}`,
      `可清理（${diag.orphans.length}）：${diag.orphans.join('、') || '无'}`,
    ].join('\n')
  } catch (err) {
    sessionDiagnostics.value = `读取会话详情失败：${err instanceof Error ? err.message : String(err)}`
  }
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

/**
 * 读取配置失败时的自愈入口：重新拉一次配置并恢复上次激活的标签。
 * 失败通常来自配置文件被占用或权限问题，重试往往就能过去，
 * 比让用户以为「站点全没了」要好得多。
 */
async function reload(): Promise<void> {
  await sitesStore.load()
  if (sitesStore.loadError.value) return

  const restored = activeId.value ? sitesStore.findById(activeId.value) : undefined
  const target = restored && restored.visible !== false ? restored : visibleSites.value[0]
  if (target) await tabs.select(target.id)
  else await tabs.clearFocus()
}

onMounted(async () => {
  await sitesStore.load()
  if (sitesStore.loadError.value) return

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
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 0;
  background: var(--bg-canvas);
}

.app__error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 12px 16px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: #fef2f2;
  font-size: 12.5px;
  color: #b91c1c;
}

.app__retry {
  padding: 4px 10px;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-sm);
  background: #fff;
  color: #b91c1c;
  font-size: 12px;
  cursor: pointer;
}

.app__retry:hover {
  background: #fee2e2;
}
</style>
