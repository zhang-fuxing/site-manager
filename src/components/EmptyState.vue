<template>
  <main class="empty">
    <div class="empty__card">
      <h2 class="empty__title">{{ allHidden ? '所有站点都被隐藏了' : '还没有任何标签页' }}</h2>
      <p class="empty__text">
        {{
          allHidden
            ? '在标签管理里勾选「显示」，它们就会回到标签栏。'
            : '添加一个常用网址，它会作为标签页固定在这一栏里。'
        }}
      </p>
      <button type="button" class="empty__button" @click="emit('add')">
        {{ allHidden ? '打开标签管理' : '＋ 添加第一个网址' }}
      </button>

      <dl class="empty__keys">
        <div v-for="item in shortcuts" :key="item.keys" class="empty__key-row">
          <dt><kbd>{{ item.keys }}</kbd></dt>
          <dd>{{ item.label }}</dd>
        </div>
      </dl>
    </div>
  </main>
</template>

<script setup lang="ts">
defineProps<{
  /** 站点存在但全部被隐藏，文案与按钮需要区别对待 */
  allHidden?: boolean
}>()

const emit = defineEmits<{ add: [] }>()

const shortcuts = [
  { keys: 'Ctrl + T', label: '打开标签管理 / 新增站点' },
  { keys: 'Ctrl + W', label: '隐藏当前标签（可逆）' },
  { keys: 'Ctrl + Tab', label: '切换到下一个标签' },
  { keys: 'Ctrl + 1…9', label: '跳到第 N 个标签（9 为最后一个）' },
  { keys: 'Ctrl + R', label: '重新加载当前页面' },
  { keys: 'Alt + ← / →', label: '页面后退 / 前进' },
  { keys: 'Ctrl + Shift + T', label: '恢复刚删除的站点' },
  { keys: '拖拽 / 右键', label: '调整标签顺序 / 打开标签菜单' },
]
</script>

<style scoped>
.empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  background: var(--bg-canvas);
}

.empty__card {
  width: 380px;
  padding: 28px 32px;
  border: 1px solid #e3e5ec;
  border-radius: 12px;
  background: #fff;
  text-align: center;
  box-shadow: 0 10px 30px rgba(31, 35, 48, 0.06);
}

.empty__title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #1f2330;
}

.empty__text {
  margin: 0 0 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #6b7280;
}

.empty__button {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
}

.empty__button:hover {
  background: var(--accent-hover);
}

.empty__keys {
  display: grid;
  gap: 6px;
  margin: 22px 0 0;
  padding-top: 16px;
  border-top: 1px solid #eef0f5;
}

.empty__key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.empty__key-row dd {
  margin: 0;
}

kbd {
  padding: 2px 6px;
  border: 1px solid #dcdfe8;
  border-radius: 4px;
  background: #f6f7fa;
  font-family: inherit;
  font-size: 11px;
  color: #3d4252;
}
</style>
