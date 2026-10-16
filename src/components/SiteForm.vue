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

    <fieldset class="field field--group">
      <legend class="field__label">登录隔离（Cookie / LocalStorage 是否共用）</legend>

      <label class="choice">
        <input v-model="form.mode" type="radio" value="isolated" />
        <span>
          <strong>独立会话</strong>
          <em>这个标签自己一套登录状态，不会和其他站点互相影响</em>
        </span>
      </label>

      <label class="choice" :class="{ 'is-disabled': !hasGroups }">
        <input v-model="form.mode" type="radio" value="group" :disabled="!hasGroups" />
        <span>
          <strong>加入已有隔离组</strong>
          <em v-if="hasGroups">已存在的组，选中即与组内站点共用登录状态</em>
          <em v-else>目前还没有任何隔离组</em>
        </span>
      </label>

      <label class="choice">
        <input v-model="form.mode" type="radio" value="custom" />
        <span>
          <strong>新建隔离组</strong>
          <em>给同一网站的两个标签填同一个组名，即可同时登录两个账号</em>
        </span>
      </label>
    </fieldset>

    <div v-if="form.mode === 'group'" class="field">
      <span class="field__label">选择隔离组</span>
      <div class="group-picker">
        <button
          v-for="name in groupNames"
          :key="name"
          type="button"
          class="group-chip"
          :class="{ 'is-on': form.group === name }"
          @click="form.group = name"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <label v-if="form.mode === 'custom'" class="field">
      <span class="field__label">隔离组名</span>
      <input
        v-model="form.customGroup"
        type="text"
        maxlength="32"
        placeholder="如：zhihu-work"
        @input="onCustomGroupInput"
      />
    </label>

    <p class="field__hint">{{ preview }}</p>
    <p v-if="error" class="field__error">{{ error }}</p>

    <div class="dialog__actions">
      <button type="button" class="btn" @click="emit('cancel')">取消</button>
      <button type="submit" class="btn btn--primary">{{ isEdit ? '保存' : '添加' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { normalizeGroupKey, resolvePartitionMode } from '../../shared/site-partition'
import type { Site, SiteFormPayload } from '../../shared/types'

const props = defineProps<{
  /** 传入站点表示编辑模式，否则为新增 */
  site?: Site | null
  /** 现有隔离组名，用于「加入已有隔离组」 */
  groupNames: string[]
}>()

const emit = defineEmits<{
  cancel: []
  submit: [payload: SiteFormPayload]
}>()

type Mode = 'isolated' | 'group' | 'custom'

const initialMode: Mode = props.site ? (resolvePartitionMode(props.site) === 'group' ? 'group' : 'isolated') : 'isolated'

const form = ref<{
  name: string
  url: string
  mode: Mode
  group: string
  customGroup: string
}>({
  name: props.site?.name ?? '',
  url: props.site?.url ?? '',
  mode: initialMode,
  group: props.site?.partitionKey ?? props.groupNames[0] ?? '',
  customGroup: '',
})
const error = ref('')
const nameEl = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => !!props.site)
const hasGroups = computed(() => props.groupNames.length > 0)

/** 编辑一个已不存在的组时，把它的组名补进可选项，避免选中项凭空消失 */
const groupNames = computed(() => {
  const names = [...props.groupNames]
  const current = props.site?.partitionKey?.trim()
  if (current && !names.includes(current)) names.unshift(current)
  return names
})

/** 组名最终会成为 persist: 分区名，输入时就把非法字符收敛掉 */
function onCustomGroupInput(): void {
  form.value.customGroup = normalizeGroupKey(form.value.customGroup)
}

const effectiveGroup = computed(() => {
  if (form.value.mode === 'group') return form.value.group.trim()
  if (form.value.mode === 'custom') return form.value.customGroup.trim()
  return ''
})

const preview = computed(() => {
  if (form.value.mode === 'isolated') {
    return '独立会话：这个标签的 Cookie 与 LocalStorage 只属于它自己。'
  }
  const group = effectiveGroup.value
  if (!group) return '请填写隔离组名。'
  if (group === 'AI') {
    return '提示：AI 组是旧版本的默认值，曾让多个不同站点共用同一套 Cookie。'
  }
  return `与隔离组「${group}」内的所有站点共用 Cookie 与 LocalStorage。`
})

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
  // 粘贴进来的地址去掉首尾空白；没写协议时按 https 处理
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  try {
    // 先校验合法性，避免把明显错误的地址写进配置
    void new URL(url)
  } catch {
    error.value = '网址格式不正确'
    return
  }

  const mode: 'isolated' | 'group' = effectiveGroup.value ? 'group' : 'isolated'
  if (form.value.mode !== 'isolated' && !effectiveGroup.value) {
    error.value = '请填写或选择一个隔离组名'
    return
  }

  emit('submit', { name, url, partitionMode: mode, partitionKey: effectiveGroup.value })
}
</script>

<style scoped>
.site-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}

.field--group {
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
}

.choice {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}

.choice:hover {
  background: #f5f6fa;
}

.choice.is-disabled {
  cursor: default;
  opacity: 0.5;
}

.choice input {
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.choice span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.choice strong {
  font-size: 12.5px;
  font-weight: 500;
  color: #1f2330;
}

.choice em {
  font-size: 11.5px;
  font-style: normal;
  line-height: 1.45;
  color: #8a90a3;
}

.group-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-chip {
  padding: 4px 10px;
  border: 1px solid #d5d8e2;
  border-radius: 999px;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.group-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.group-chip.is-on {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}

.field__hint--warn {
  color: #b45309;
}
</style>
