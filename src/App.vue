<template>
  <div class="app-layout">
    <!-- 1. 顶部水平导航栏 -->
    <header class="navbar">
      <div class="nav-title">LINK</div>

      <!-- 水平滚动标签列表 -->
      <div class="tab-list">
        <div
          v-for="site in sites"
          :key="site.id"
          :class="['tab-item', { active: activeSiteId === site.id }]"
          @click="selectSite(site.id)"
        >
          <span class="tab-name">{{ site.name }}</span>
          <!-- 核心：添加 .stop 阻止冒泡，同时设置 type="button" 确保纯粹的按钮触发 -->
          <button type="button" 
          class="delete-btn" 
          @click.stop="confirmDeleteSite(site)"
          @mousedown.stop>✕</button>
        </div>
      </div>

      <!-- 右侧添加按钮 -->
      <button type="button" class="add-btn" @click="openModal()">➕ 添加网址</button>
    </header>

    <!-- 2. 下方内容占位区 -->
    <main class="content-placeholder"></main>

    <!-- 3. 添加网址模态框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h3>添加自定义网址</h3>
        <input v-model="form.name" placeholder="网站名称 (如: 百度)" />
        <input v-model="form.url" placeholder="网址 URL (包含 https://)" />
        <input v-model="form.partitionKey" placeholder="登录隔离组 (可选, 留空独立隔离)" />
        <div class="modal-actions">
          <button type="button" class="cancel" @click="closeModal">取消</button>
          <button type="button" class="confirm" @click="handleAddSite">确定</button>
        </div>
      </div>
    </div>

    <!-- 4. 新增：删除网址二级确认模态框 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="modal modal-danger">
        <h3>确认删除</h3>
        <p class="delete-tip">
          确定要删除网址 <strong>「{{ siteToDelete?.name }}」</strong> 吗？
        </p>
        <div class="modal-actions">
          <button type="button" class="cancel" @click="closeDeleteModal">取消</button>
          <button type="button" class="danger-btn" @click="handleExecuteDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Site {
  id: string
  name: string
  url: string
  partitionKey?: string
}

const showModal = ref(false)
const activeSiteId = ref<string | null>(null)
const sites = ref<Site[]>([])
// ----- 新增：删除确认弹窗状态变量 -----
const showDeleteModal = ref(false)
const siteToDelete = ref<Site | null>(null)

const form = ref({
  name: '',
  url: '',
  partitionKey: '',
})

// -------------------------------------------------------------
// 关键优化：控制 WebContentsView 的显示/隐藏，解决 Native View 遮挡 Vue 弹窗问题
// -------------------------------------------------------------
const openModal = async () => {
  // 打开弹窗前，通知 Electron 移除当前 View，防止原生视图盖住 Vue 弹窗
  if (activeSiteId.value && window.electronAPI?.switchSiteView) {
    await window.electronAPI.switchSiteView('') // 传入空 ID 即可暂时移除/隐藏 View
  }
  showModal.value = true
}

const closeModal = async () => {
  showModal.value = false
  // 关闭弹窗后，还原显示当前选中的 View
  if (activeSiteId.value && window.electronAPI?.switchSiteView) {
    await window.electronAPI.switchSiteView(activeSiteId.value)
  }
}

// ----- 新增：控制【删除确认】模态框的显示/隐藏 -----
const confirmDeleteSite = async (site: Site) => {
  siteToDelete.value = site
  // 同样需要隐藏底层 View，防止遮挡删除确认弹窗
  if (activeSiteId.value && window.electronAPI?.switchSiteView) {
    await window.electronAPI.switchSiteView('')
  }
  showDeleteModal.value = true
}

const closeDeleteModal = async () => {
  showDeleteModal.value = false
  siteToDelete.value = null
  // 恢复显示当前的 View
  if (activeSiteId.value && window.electronAPI?.switchSiteView) {
    await window.electronAPI.switchSiteView(activeSiteId.value)
  }
}

// 执行真正的删除逻辑
const handleExecuteDelete = async () => {
  if (!siteToDelete.value) return
  const id = siteToDelete.value.id

  console.log('[前端] 确认删除标签，ID:', id)

  const updatedSites = sites.value.filter((s) => s.id !== id)

  // 1. 通知主进程销毁 View
  try {
    if (window.electronAPI?.removeSiteView) {
      await window.electronAPI.removeSiteView(id)
    }
  } catch (err) {
    console.error('[前端] 销毁主进程 View 失败:', err)
  }

  // 2. 保存更新后的配置
  await saveSites(updatedSites)

  // 3. 智能焦点切换逻辑
  if (activeSiteId.value === id) {
    if (updatedSites.length > 0) {
      activeSiteId.value = updatedSites[0].id
    } else {
      activeSiteId.value = null
    }
  }

  // 4. 关闭弹窗并恢复底层视图（如果还有剩余站点，selectSite 会加载它；如果没有则空着）
  showDeleteModal.value = false
  const targetId = activeSiteId.value
  siteToDelete.value = null

  if (targetId) {
    await selectSite(targetId)
  } else {
    // 没站点了，清理 View
    if (window.electronAPI?.switchSiteView) {
      await window.electronAPI.switchSiteView('')
    }
  }
}

// 持久化存储数据
const saveSites = async (newSites: Site[]) => {
  sites.value = newSites
  
  if (window.electronAPI?.saveStoredSites) {
    // 关键修复：深拷贝脱敏，去掉 Vue 的 Proxy 响应式包装
    const rawData = JSON.parse(JSON.stringify(newSites))
    await window.electronAPI.saveStoredSites(rawData)
  }
}

// 页面加载时读取配置
onMounted(async () => {
  try {
    if (window.electronAPI?.getStoredSites) {
      const loadedSites = await window.electronAPI.getStoredSites()
      sites.value = loadedSites || []
      console.log('读取存储配置成功:', sites.value)
      
      if (sites.value.length > 0) {
        await selectSite(sites.value[0].id)
      }
    }
  } catch (err) {
    console.error('读取存储配置失败:', err)
  }
})

// 选中并切换网页
const selectSite = async (id: string) => {
  const site = sites.value.find((s) => s.id === id)
  if (!site) return

  activeSiteId.value = id
  if (window.electronAPI) {
    await window.electronAPI.createSiteView({
      id: site.id,
      url: site.url,
      partitionKey: site.partitionKey,
    })
    await window.electronAPI.switchSiteView(site.id)
  }
}

// 添加新网址
const handleAddSite = async () => {
  if (!form.value.name || !form.value.url) return

  let formattedUrl = form.value.url
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'https://' + formattedUrl
  }

  const newSite: Site = {
    id: Date.now().toString(),
    name: form.value.name,
    url: formattedUrl,
    partitionKey: form.value.partitionKey || undefined,
  }

  // 1. 补上 await 确保数据落盘写入 json
  await saveSites([...sites.value, newSite])
  await closeModal()
  form.value = { name: '', url: '', partitionKey: '' }
  // 2. 自动选中并加载新添加的标签
  await selectSite(newSite.id)
}

</script>
<style>
/* 保持原样式即可 */
* { box-sizing: border-box; margin: 0; padding: 0; }
body, html, #app { height: 100%; font-family: sans-serif; overflow: hidden; }

.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.navbar {
  height: 50px;
  background-color: #1e1e2d;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid #2b2b40;
  gap: 16px;

  /* 新增：提升导航栏层级，确保点击事件能正常触发 */
  position: relative;
  z-index: 100;
}

.nav-title {
  font-size: 15px;
  font-weight: bold;
  white-space: nowrap;
}

.tab-list {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow-x: auto;
  height: 100%;
}

.tab-list::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #2b2b40;
  padding: 6px 12px;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
  transition: background 0.2s;
  user-select: none;
}

.tab-item:hover { background-color: #383852; }
.tab-item.active { background-color: #4f46e5; color: white; }

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 50%;
  /* 新增：确保按钮响应指针事件 */
  pointer-events: auto;
}
.delete-btn:hover { color: #fff; background-color: #ff4d4f; }

.add-btn {
  padding: 6px 12px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
}

.content-placeholder {
  flex: 1;
  background-color: #f5f5f5;
}

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.modal {
  background: white; padding: 20px; border-radius: 8px; width: 320px;
  display: flex; flex-direction: column; gap: 12px;
}
.modal input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
/* 弹窗底部按钮容器布局 */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

/* 统一按钮基础样式 */
.modal-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

/* 取消按钮样式 */
.modal-actions button.cancel {
  background-color: #f3f4f6;
  color: #4b5563;
  border: 1px solid #d1d5db;
}

.modal-actions button.cancel:hover {
  background-color: #e5e7eb;
  color: #1f2937;
  border-color: #9ca3af;
}

.modal-actions button.confirm { background: #4f46e5; color: white; border: none; padding: 6px 12px; border-radius: 4px; }
.modal-actions button.confirm:hover {
  background-color: #4338ca;
}

/* 删除提示文字样式 */
.delete-tip {
  font-size: 14px;
  color: #4b5563;
  margin: 8px 0;
  line-height: 1.5;
}

.delete-tip strong {
  color: #111827;
}

/* 危险操作（确认删除）按钮样式 */
.modal-actions button.danger-btn {
  background-color: #ef4444;
  color: white;
  border: 1px solid transparent;
}

.modal-actions button.danger-btn:hover {
  background-color: #dc2626;
}
</style>