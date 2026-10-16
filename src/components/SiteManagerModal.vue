<template>
  <div v-if="open" class="overlay" @mousedown.self="emit('close')">
    <div class="manager" role="dialog" aria-modal="true">
      <header class="manager__head">
        <div>
          <h3 class="manager__title">{{ heading }}</h3>
          <p class="manager__subtitle">{{ hint }}</p>
        </div>
        <button type="button" class="manager__close" title="关闭" @click="emit('close')">✕</button>
      </header>

      <!-- 表单态：新增 / 编辑 -->
      <SiteForm v-if="mode === 'form'" :site="editing" @submit="onFormSubmit" @cancel="backToList" />

      <!-- 列表态 -->
      <template v-else>
        <div class="manager__list">
          <p v-if="sites.length === 0" class="manager__empty">还没有任何站点，先新增一个吧。</p>

          <div
            v-for="site in sites"
            :key="site.id"
            class="manager__row"
            :class="{ 'is-hidden': site.visible === false, 'is-active': site.id === activeId }"
          >
            <label
              class="manager__toggle"
              :title="site.visible === false ? '点击在标签栏显示' : '点击从标签栏隐藏'"
            >
              <input
                type="checkbox"
                :checked="site.visible !== false"
                @change="onToggle(site.id, $event)"
              />
            </label>

            <div class="manager__info">
              <span class="manager__name">{{ site.name }}</span>
              <span class="manager__url" :title="site.url">{{ site.url }}</span>
            </div>

            <span
              v-if="site.partitionKey"
              class="manager__group"
              :title="`登录隔离组：${site.partitionKey}`"
            >
              {{ site.partitionKey }}
            </span>
            <span v-else class="manager__group manager__group--none" title="无隔离组，独立会话">
              独立
            </span>

            <div class="manager__ops">
              <button type="button" class="manager__op" @click="startEdit(site)">编辑</button>
              <button type="button" class="manager__op" @click="emit('duplicate', site)">
                复制
              </button>
              <button
                type="button"
                class="manager__op manager__op--danger"
                @click="emit('remove', site)"
              >
                删除
              </button>
            </div>
          </div>
        </div>

        <footer class="manager__foot">
          <button type="button" class="btn btn--primary" @click="startCreate">＋ 新增站点</button>
          <button type="button" class="btn" :disabled="!canRestore" @click="emit('restore')">
            恢复上次删除
          </button>
          <span class="manager__count">
            共 {{ sites.length }} 个，标签栏显示 {{ visibleCount }} 个
          </span>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SiteForm from './SiteForm.vue'
import type { Site } from '../../shared/types'

const props = defineProps<{
  open: boolean
  /** 全部站点，包含未显示的 */
  sites: Site[]
  activeId: string | null
  canRestore: boolean
  /** 打开时直接进入哪个界面 */
  initialMode?: 'list' | 'create' | 'edit'
  initialSiteId?: string | null
}>()

const emit = defineEmits<{
  close: []
  add: [payload: { name: string; url: string; partitionKey: string }]
  update: [id: string, payload: { name: string; url: string; partitionKey: string }]
  remove: [site: Site]
  duplicate: [site: Site]
  setVisible: [id: string, visible: boolean]
  restore: []
}>()

const mode = ref<'list' | 'form'>('list')
const editing = ref<Site | null>(null)

const visibleCount = computed(() => props.sites.filter((site) => site.visible !== false).length)

const heading = computed(() => {
  if (mode.value !== 'form') return '标签管理'
  return editing.value ? '编辑站点' : '新增站点'
})

const hint = computed(() => {
  if (mode.value === 'form') return '修改后保存即刻生效；改动隔离组会切换到另一套登录会话。'
  return '只有勾选「显示」的站点才会出现在标签栏；删除会把它从配置中移除。'
})

// 每次打开都按调用方指定的界面重置，避免残留上一次的状态
watch(
  () => props.open,
  (open) => {
    if (!open) return

    if (props.initialMode === 'create') {
      editing.value = null
      mode.value = 'form'
      return
    }
    if (props.initialMode === 'edit' && props.initialSiteId) {
      editing.value = props.sites.find((site) => site.id === props.initialSiteId) ?? null
      mode.value = 'form'
      return
    }
    editing.value = null
    mode.value = 'list'
  },
  { immediate: true },
)

function startCreate(): void {
  editing.value = null
  mode.value = 'form'
}

function startEdit(site: Site): void {
  editing.value = site
  mode.value = 'form'
}

function backToList(): void {
  editing.value = null
  mode.value = 'list'
}

function onFormSubmit(payload: { name: string; url: string; partitionKey: string }): void {
  const target = editing.value
  backToList()
  if (target) emit('update', target.id, payload)
  else emit('add', payload)
}

function onToggle(id: string, event: Event): void {
  emit('setVisible', id, (event.target as HTMLInputElement).checked)
}
</script>

<style scoped>
.manager {
  display: flex;
  flex-direction: column;
  width: 620px;
  max-width: calc(100vw - 80px);
  max-height: calc(100vh - 120px);
  padding: 18px 20px 16px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 17, 26, 0.28);
}

.manager__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef0f5;
}

.manager__title {
  margin: 0;
  font-size: 15px;
  color: #1f2330;
}

.manager__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #8a90a3;
}

.manager__close {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #8a90a3;
  font-size: 13px;
  cursor: pointer;
}

.manager__close:hover {
  background: #f0f1f5;
  color: #1f2330;
}

.manager__list {
  flex: 1 1 auto;
  min-height: 0;
  margin: 4px -6px 0;
  padding: 4px 6px;
  overflow-y: auto;
}

.manager__empty {
  margin: 24px 0;
  font-size: 13px;
  color: #8a90a3;
  text-align: center;
}

.manager__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.manager__row:hover {
  background: #f7f8fb;
}

.manager__row.is-active {
  background: #eef0ff;
}

.manager__row.is-hidden .manager__name,
.manager__row.is-hidden .manager__url {
  opacity: 0.45;
}

.manager__toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.manager__toggle input {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--accent);
}

.manager__info {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.manager__name {
  font-size: 13px;
  color: #1f2330;
}

.manager__url {
  overflow: hidden;
  font-size: 11.5px;
  color: #8a90a3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager__group {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef0f5;
  font-size: 11px;
  color: #5c6178;
  white-space: nowrap;
}

.manager__group--none {
  background: transparent;
  color: #b6bac7;
}

.manager__ops {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}

.manager__op {
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #4b5563;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.manager__op:hover {
  background: #e8eaf2;
  color: #1f2330;
}

.manager__op--danger:hover {
  background: var(--danger);
  color: #fff;
}

.manager__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #eef0f5;
}

.manager__count {
  margin-left: auto;
  font-size: 11.5px;
  color: #8a90a3;
}
</style>
