<template>
  <div
    class="tab"
    :class="{ 'is-active': active, 'is-dragging': dragging, 'is-error': !!state?.error }"
    :title="tooltip"
    draggable="true"
    @click="emit('select')"
    @contextmenu.prevent="emit('context', $event)"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <span class="tab__favicon">
      <img v-if="faviconUrl" class="tab__icon" :src="faviconUrl" alt="" @error="iconFailed = true" />
      <span v-else class="tab__dot" />
    </span>

    <span class="tab__title">{{ label }}</span>

    <!-- 加载中显示转圈；空闲时是强制刷新按钮。关闭/删除已移到标签管理，避免误触 -->
    <span v-if="loading" class="tab__spinner" aria-hidden="true" />
    <button
      v-else
      type="button"
      class="tab__action"
      :class="{ 'is-error': !!state?.error }"
      :title="state?.error ? `加载失败：${state.error}\n点击重试` : '强制刷新（忽略缓存）'"
      draggable="false"
      @click.stop="emit('refresh')"
      @mousedown.stop
    >
      <svg v-if="!state?.error" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <polyline
          points="23 4 23 10 17 10"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span v-else class="tab__warn">!</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Site, ViewState } from '../../shared/types'

const props = defineProps<{
  site: Site
  active: boolean
  state?: ViewState
  /** 正在被拖拽，用于把源标签画淡 */
  dragging: boolean
}>()

const emit = defineEmits<{
  select: []
  refresh: []
  context: [event: MouseEvent]
  dragstart: [event: DragEvent]
  dragend: []
}>()

const iconFailed = ref(false)

// 页面跳转后 favicon 会变，失败标记要跟着重置，否则新图标永远不显示
watch(
  () => props.state?.favicon,
  () => {
    iconFailed.value = false
  },
)

const faviconUrl = computed(() => {
  const favicon = props.state?.favicon
  return favicon && !iconFailed.value ? favicon : ''
})

/** 优先显示页面真实标题，未就绪时退回站点配置名称 */
const label = computed(() => props.state?.title?.trim() || props.site.name)

const loading = computed(() => props.state?.loading ?? false)

const tooltip = computed(() => {
  const error = props.state?.error
  if (error) return `${props.site.name}\n加载失败：${error}`
  return `${props.site.name}\n${props.state?.url || props.site.url}`
})
</script>

<style scoped>
.tab {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-width: 96px;
  max-width: 208px;
  padding: 0 8px 0 10px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--bg-tab);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.tab:hover {
  background: var(--bg-tab-hover);
  color: var(--text-primary);
}

.tab.is-active {
  background: var(--bg-tab-active);
  color: #fff;
}

.tab.is-active:hover {
  background: var(--bg-tab-active-hover);
}

.tab.is-dragging {
  opacity: 0.45;
}

.tab.is-error .tab__title {
  text-decoration: underline dotted var(--danger);
}

/* 出错时不要播放「刷新」按钮的旋转动画，那个旋转表示的是刷新动作 */
.tab__action.is-error:hover {
  transform: none;
}

.tab__favicon {
  display: flex;
  flex: 0 0 14px;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.tab__icon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.tab__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}

.tab__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab__action {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, transform 0.25s ease;
}

.tab:hover .tab__action,
.tab.is-active .tab__action,
.tab__action.is-error {
  opacity: 0.75;
}

/* 加载失败的标签：错误标记常驻可见，别让用户还要悬停才发现出错了 */
.tab__action.is-error {
  opacity: 1;
  color: var(--danger);
}

.tab.is-active .tab__action.is-error {
  color: #ffd7d7;
}

.tab__warn {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.tab__action:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.22);
  transform: rotate(90deg);
}

.tab.is-active .tab__action:hover {
  background: rgba(0, 0, 0, 0.25);
}

.tab__spinner {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.8;
  animation: tab-spin 0.7s linear infinite;
}

@keyframes tab-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
