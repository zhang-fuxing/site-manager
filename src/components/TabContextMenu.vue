<template>
  <div ref="menuEl" class="menu" :style="positionStyle" @contextmenu.prevent>
    <template v-for="item in items" :key="item.key">
      <div v-if="item.separatorBefore" class="menu__separator" />
      <button
        type="button"
        class="menu__item"
        :class="{ 'is-danger': item.danger }"
        :disabled="item.disabled"
        @click="emit('select', item.key)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MenuItem } from '../../shared/types'

const props = defineProps<{
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  select: [key: string]
  dismiss: []
}>()

const MENU_WIDTH = 176
const ITEM_HEIGHT = 30

const menuEl = ref<HTMLElement | null>(null)

/** 靠近窗口右下角时向内收，避免菜单被裁掉 */
const positionStyle = computed(() => {
  const height = props.items.length * ITEM_HEIGHT + 12
  const left = Math.max(8, Math.min(props.x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(props.y, window.innerHeight - height - 8))
  return { left: `${left}px`, top: `${top}px`, width: `${MENU_WIDTH}px` }
})

function onPointerDown(event: MouseEvent): void {
  // 点菜单内部交给按钮自己处理，点外部则关闭
  if (menuEl.value && !menuEl.value.contains(event.target as Node)) emit('dismiss')
}

function onDismiss(): void {
  emit('dismiss')
}

onMounted(() => {
  // 捕获阶段监听，先于任何按钮的 click 拿到事件
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('blur', onDismiss)
  window.addEventListener('resize', onDismiss)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('blur', onDismiss)
  window.removeEventListener('resize', onDismiss)
})
</script>

<style scoped>
.menu {
  position: fixed;
  z-index: 10000;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  background: #23253a;
  box-shadow: var(--shadow-menu);
}

.menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: rgba(255, 255, 255, 0.1);
}

.menu__item {
  display: block;
  width: 100%;
  padding: 0 10px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.menu__item:hover:not(:disabled) {
  background: var(--accent);
}

.menu__item:disabled {
  color: #5c6178;
  cursor: default;
}

.menu__item.is-danger:hover:not(:disabled) {
  background: var(--danger);
}
</style>
