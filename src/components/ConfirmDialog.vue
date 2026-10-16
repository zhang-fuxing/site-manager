<template>
  <div v-if="open" class="overlay" @mousedown.self="emit('cancel')">
    <div class="dialog dialog--compact" role="dialog" aria-modal="true">
      <h3 class="dialog__title">{{ title }}</h3>
      <p class="dialog__message">{{ message }}</p>
      <p v-if="hint" class="dialog__hint">{{ hint }}</p>

      <div class="dialog__actions">
        <button ref="cancelEl" type="button" class="btn" @click="emit('cancel')">取消</button>
        <button
          type="button"
          class="btn"
          :class="danger ? 'btn--danger' : 'btn--primary'"
          @click="emit('confirm')"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  hint?: string
  confirmText: string
  danger: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const cancelEl = ref<HTMLButtonElement | null>(null)

// 删除类操作用默认聚焦「取消」，避免回车误确认
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    cancelEl.value?.focus()
  },
)
</script>

<style scoped>
.dialog--compact {
  width: 340px;
}
</style>
