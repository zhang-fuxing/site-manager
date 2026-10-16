<template>
  <form class="site-form" @submit.prevent="onSubmit">
    <label class="field">
      <span class="field__label">网站名称</span>
      <input ref="nameEl" v-model="form.name" type="text" placeholder="如：百度" />
    </label>

    <label class="field">
      <span class="field__label">网址 URL</span>
      <input v-model="form.url" type="text" placeholder="https://www.example.com" />
    </label>

    <label class="field">
      <span class="field__label">登录隔离组</span>
      <input v-model="form.partitionKey" type="text" placeholder="可选，留空则本标签独立隔离" />
    </label>

    <p class="field__hint">
      隔离组相同的标签共用 Cookie 与 LocalStorage，可实现同站点多账号同时登录。
    </p>
    <p v-if="error" class="field__error">{{ error }}</p>

    <div class="dialog__actions">
      <button type="button" class="btn" @click="emit('cancel')">取消</button>
      <button type="submit" class="btn btn--primary">{{ isEdit ? '保存' : '添加' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Site } from '../../shared/types'

const props = defineProps<{
  /** 传入站点表示编辑模式，否则为新增 */
  site?: Site | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [payload: { name: string; url: string; partitionKey: string }]
}>()

const form = ref({
  name: props.site?.name ?? '',
  url: props.site?.url ?? '',
  partitionKey: props.site?.partitionKey ?? '',
})
const error = ref('')
const nameEl = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => !!props.site)

// 组件由 v-if 挂载，直接聚焦即可
onMounted(() => {
  nameEl.value?.focus()
  nameEl.value?.select()
})

function onSubmit(): void {
  const name = form.value.name.trim()
  let url = form.value.url.trim()

  if (!name) {
    error.value = '请填写网站名称'
    return
  }
  if (!url) {
    error.value = '请填写网址 URL'
    return
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  try {
    // 先校验合法性，避免把明显错误的地址写进配置
    void new URL(url)
  } catch {
    error.value = '网址格式不正确'
    return
  }

  emit('submit', { name, url, partitionKey: form.value.partitionKey.trim() })
}
</script>

<style scoped>
.site-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}
</style>
