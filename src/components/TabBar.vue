<template>
  <header class="tab-bar">
    <div class="tab-bar__brand">LINK</div>

    <!-- 页面历史：站点自行开新窗口的请求会就地导航，所以需要能回退 -->
    <div class="tab-bar__nav">
      <button
        type="button"
        class="tab-bar__nav-btn"
        :disabled="!canGoBack"
        title="后退 (Alt + ←)"
        @click="emit('back')"
      >
        ←
      </button>
      <button
        type="button"
        class="tab-bar__nav-btn"
        :disabled="!canGoForward"
        title="前进 (Alt + →)"
        @click="emit('forward')"
      >
        →
      </button>
    </div>

    <!-- 标签区：横向滚动、滚轮横滚、原生拖拽排序 -->
    <div
      ref="stripEl"
      class="tab-bar__strip"
      @wheel.prevent="onWheel"
      @dragover.prevent="onStripDragOver"
      @drop.prevent="onDrop"
    >
      <template v-for="(site, index) in sites" :key="site.id">
        <span v-if="dropIndex === index" class="tab-bar__drop" aria-hidden="true" />
        <TabItem
          :site="site"
          :active="site.id === activeId"
          :state="states.get(site.id)"
          :dragging="dragIndex === index"
          @select="emit('select', site.id)"
          @refresh="emit('refresh', site)"
          @context="emit('context', site, $event)"
          @dragstart="onDragStart(index, $event)"
          @dragend="onDragEnd"
          @dragover.prevent.stop="onItemDragOver(index, $event)"
        />
      </template>
      <span v-if="dropIndex === sites.length" class="tab-bar__drop" aria-hidden="true" />
    </div>

    <button
      type="button"
      class="tab-bar__manage"
      title="新增 / 删除 / 修改站点与是否显示 (Ctrl+T)"
      @click="emit('manage')"
    >
      标签管理
    </button>
  </header>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import TabItem from './TabItem.vue'
import type { Site, ViewState } from '../../shared/types'

const props = defineProps<{
  /** 只包含需要展示的站点 */
  sites: Site[]
  activeId: string | null
  states: Map<string, ViewState>
  canGoBack: boolean
  canGoForward: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  refresh: [site: Site]
  context: [site: Site, event: MouseEvent]
  manage: []
  move: [fromVisible: number, toVisible: number]
  back: []
  forward: []
}>()

const stripEl = ref<HTMLElement | null>(null)

/** 被拖拽标签在可见序列里的下标 */
const dragIndex = ref<number | null>(null)
/** 插入位置：0..sites.length，用于画落点竖线 */
const dropIndex = ref<number | null>(null)

function resetDrag(): void {
  dragIndex.value = null
  dropIndex.value = null
}

function onDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index
  dropIndex.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // 显式写入数据，部分平台缺少 data 时不会真正开始拖拽
    event.dataTransfer.setData('text/plain', String(index))
  }
}

/** 落在某个标签上：按指针位置与中线的关系决定插到它前面还是后面 */
function onItemDragOver(index: number, event: DragEvent): void {
  if (dragIndex.value === null) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const dropAfter = event.clientX > rect.left + rect.width / 2
  dropIndex.value = dropAfter ? index + 1 : index
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

/** 落在标签之间的空白处（事件目标是标签区本身，标签上的已被 stop） */
function onStripDragOver(event: DragEvent): void {
  const strip = stripEl.value
  if (dragIndex.value === null || !strip || event.target !== strip) return

  const tabs = [...strip.querySelectorAll<HTMLElement>('.tab')]
  if (tabs.length === 0) {
    dropIndex.value = 0
    return
  }

  const first = tabs[0].getBoundingClientRect()
  const last = tabs[tabs.length - 1].getBoundingClientRect()
  if (event.clientX < first.left) dropIndex.value = 0
  else if (event.clientX > last.right) dropIndex.value = tabs.length
}

function onDrop(): void {
  const from = dragIndex.value
  const insertAt = dropIndex.value
  resetDrag()
  if (from === null || insertAt === null) return
  emit('move', from, insertAt)
}

function onDragEnd(): void {
  resetDrag()
}

/** 标签多到溢出时，让当前激活的标签始终可见 */
watch(
  () => props.activeId,
  async () => {
    await nextTick()
    const active = stripEl.value?.querySelector<HTMLElement>('.tab.is-active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)

/** 纵向滚轮转成横向滚动，鼠标不用去够滚动条 */
function onWheel(event: WheelEvent): void {
  const strip = stripEl.value
  if (!strip) return
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  strip.scrollLeft += delta
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  flex: 0 0 var(--header-height);
  align-items: stretch;
  gap: 10px;
  height: var(--header-height);
  padding: 0 10px;
  border-bottom: 1px solid var(--bg-header-border);
  background: var(--bg-header);
  /* 抬高层级，保证标签与按钮的点击不被下面的占位区影响 */
  position: relative;
  z-index: 100;
}

.tab-bar__brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-primary);
}

.tab-bar__nav {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.tab-bar__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.tab-bar__nav-btn:hover:not(:disabled) {
  background: var(--bg-tab-hover);
  color: var(--text-primary);
}

.tab-bar__nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.tab-bar__strip {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /* 滚动条会顶掉标签高度，这里隐藏，靠滚轮/拖拽滚动 */
  scrollbar-width: none;
}

.tab-bar__strip::-webkit-scrollbar {
  display: none;
}

.tab-bar__drop {
  flex: 0 0 2px;
  align-self: center;
  height: 60%;
  border-radius: 2px;
  background: #8b87f5;
}

.tab-bar__manage {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.tab-bar__manage:hover {
  background: var(--accent-hover);
}
</style>
