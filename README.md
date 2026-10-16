# 网址管理器 (Site Manager)

基于 Electron + Vue 3 开发的多标签页桌面端网址管理工具。支持站点多标签页切换、拖拽排序、多账号 Cookie 隔离（Partition）、自定义站点持久化配置及日志记录。

---

## ✨ 标签管理能力

| 操作 | 方式 |
| --- | --- |
| 切换标签 | 单击标签 / `Ctrl + Tab`、`Ctrl + Shift + Tab` / `Ctrl + 1…9`（9 为最后一个） |
| 调整顺序 | 直接拖拽标签，落点处显示插入指示线 |
| 强制刷新页面 | 标签上的 ⟳ 按钮（忽略缓存） |
| 重载页面 | 右键菜单「重新加载」/ `Ctrl + R` / `F5` |
| 后退 / 前进 | 标签栏左侧的 ← → 按钮 / `Alt + ←`、`Alt + →` |
| 打开标签管理 | 右上角「标签管理」/ `Ctrl + T` |
| 新增 / 编辑站点 | 标签管理面板里的「＋ 新增站点」「编辑」 |
| 复制站点 | 标签管理面板里的「复制」，副本紧跟在源站点之后 |
| 删除站点 | 标签管理面板里的「删除」（带一次确认） |
| 配置是否显示 | 标签管理面板里的勾选框，取消勾选即从标签栏隐藏 |
| 隐藏当前标签 | 标签右键菜单「隐藏此标签」/ `Ctrl + W`（可逆，配置不丢） |
| 恢复上次删除 | 标签管理面板里的「恢复上次删除」/ `Ctrl + Shift + T`（最多 20 个） |

其他细节：

- **标签上不再有关闭按钮**：✕ 已换成强制刷新 ⟳，避免误点把站点删掉。删除只能在标签管理面板里完成，那里还会再确认一次。
- **「删除」和「隐藏」是两回事**：取消勾选「显示」只是把它从标签栏收起来，配置原样保留，随时能勾回来；删除才会真正从配置中移除（仍然可以恢复）。
- 标签显示**页面真实标题**与 favicon，标题未就绪时退回站点配置名称，加载中显示转圈动画。
- 标签栏溢出时，激活的标签会自动滚动到可见区域；在标签栏上滚轮可直接横向滚动。
- 页面里的 `target="_blank"` / `window.open` **不会**新建标签页，而是像单页应用一样在**当前标签内就地导航**；标签栏始终只包含你手动添加的标签。想回到上一页用 `Alt + ←` 或标签栏左侧的 ← 按钮。
- 上次激活的标签与标签顺序都会持久化，重启后原样恢复。

---

## 🛠️ 环境要求

* **Node.js**: `>= 16.0.0` (推荐 18.x 或 20.x)
* **npm**: `>= 8.0.0`
* **操作系统**: Windows 10/11 或 Linux (Ubuntu/Debian)

---

## 🚀 技术栈

* **核心框架**: Electron（`WebContentsView` 多视图 + 独立 Session 隔离）
* **前端框架**: Vue 3 + TypeScript
* **构建工具**: Vite + vite-plugin-electron
* **打包工具**: electron-builder

---

## 📂 项目目录功能说明

```text
site-manager/
├── config/                    # [自动生成] 站点数据 (sites.json)
├── logs/                      # [自动生成] 应用运行日志 (main.log)
├── shared/
│   └── types.ts               # 主进程与渲染进程共用的类型定义（纯类型，编译后擦除）
├── electron/                  # 主进程
│   ├── main.ts                # 应用与窗口生命周期、应用菜单、调试端口开关
│   ├── ipc.ts                 # IPC 通道注册（视图编排 + 持久化写入）
│   ├── view-manager.ts        # WebContentsView 生命周期、显隐与边界调度
│   ├── shortcuts.ts           # 应用级快捷键捕获（主进程 before-input-event）
│   ├── store.ts               # 版本化状态持久化（含旧格式迁移、防抖写入）
│   ├── logger.ts              # 日志记录模块 (封装 electron-log)
│   └── preload.ts             # 预加载脚本 (contextBridge 暴露桥接 API)
├── src/                       # 渲染进程
│   ├── App.vue                # 外壳：标签栏 + 空状态 + 各类弹层
│   ├── main.ts                # 前端入口
│   ├── env.d.ts               # 全局类型声明 (扩展 window.electronAPI)
│   ├── styles/
│   │   ├── base.css           # 设计变量、基础重置
│   │   └── dialog.css         # 弹窗 / 按钮 / 表单基元
│   ├── composables/
│   │   ├── useSites.ts        # 站点集合与持久化
│   │   ├── useTabs.ts         # 标签语义：激活 / 关闭 / 恢复 / 排序
│   │   ├── useViewStates.ts   # 订阅视图状态（真实标题、加载态、favicon）
│   │   └── useShortcuts.ts    # 全局快捷键
│   └── components/
│       ├── TabBar.vue         # 标签栏：滚动、滚轮横滚、拖拽排序
│       ├── TabItem.vue        # 单个标签：favicon、真实标题、加载态、强制刷新按钮
│       ├── TabContextMenu.vue # 标签右键菜单（只放视图级操作）
│       ├── SiteManagerModal.vue # 标签管理面板：列表 + 显隐开关 + 增删改
│       ├── SiteForm.vue       # 站点表单（新增 / 编辑，嵌在管理面板内）
│       ├── ConfirmDialog.vue  # 通用确认弹窗
│       └── EmptyState.vue     # 无标签时的空状态与快捷键提示
├── build/                     # 打包资源（electron-builder 按约定自动取用）
│   ├── icon.ico               # Windows 应用图标，内含 16~256 多个尺寸
│   └── icon.png               # Linux 应用图标 (512×512)
├── dist/                      # Vue 前端编译产物
├── dist-electron/             # Electron 主进程 / Preload 编译产物
├── release/                   # electron-builder 打包输出目录
├── package.json               # 项目依赖配置及脚本
├── vite.config.ts             # Vite 及 Electron 插件配置
└── README.md                  # 项目文档
```

---

## 💻 本地开发与使用

1. 安装依赖

```bash
npm install
```

2. 启动开发环境

```bash
npm run dev
```

3. 类型检查

```bash
npm run typecheck
```

### 使用说明

* **切换网址**：点击顶部标签页即可切换，网页状态会保留（视图常驻，只切换可见性）。
* **管理站点**：点右上角「标签管理」（或 `Ctrl + T`），在那里新增、编辑、复制、删除站点，并勾选是否在标签栏显示。删除会再确认一次，误删可用面板里的「恢复上次删除」或 `Ctrl + Shift + T` 找回。
* **刷新页面**：标签上的 ⟳ 是强制刷新（忽略缓存）；普通重载用右键菜单或 `Ctrl + R` / `F5`。
* **登录隔离 (Partition)**：添加站点时填入相同的「隔离组 Key」，这些站点会共用 Cookie 与 LocalStorage，从而实现同网站多账号同时登录；留空则每个标签独立隔离。

---

## 📦 应用打包 (Build)

项目使用 electron-builder 进行打包，支持输出免安装绿化版程序。

打包资源放在 `build/` 目录，electron-builder 按约定自动取用，无需在配置里指定路径：

* Windows → `build/icon.ico`（内含 16 / 24 / 32 / 48 / 64 / 128 / 256 多尺寸，任务栏与资源管理器各档分辨率都有对应图）
* Linux → `build/icon.png`（512×512）

exe 里的「产品名称 / 发布者 / 版权」来自 `package.json` 的 `name`、`productName`、`description` 与 `author`。

1. 打包 Windows 程序 (64 位)

```bash
npm run pack:win
```

产物将生成在 `release/win-unpacked` 文件夹中，双击 `Site Manager.exe` 即可运行。

2. 打包 Linux 程序 (.AppImage / .deb)

```bash
npm run pack:linux
```

3. 清理构建产物

```bash
npm run clean
```

会清理历史编译产物（`dist`、`dist-electron`、`release`）以及运行产生的 `logs`、`config`。

---

## 📝 实现要点与注意事项

### 层级遮挡：用 `setVisible` 而不是摘除视图

原生 `WebContentsView` 永远绘制在 `BrowserWindow` 自身内容之上，Vue 弹层无法盖住它。因此任一弹层（模态框、右键菜单）打开时，主进程会调用 `view.setVisible(false)` 把网页视图整体隐藏，关闭后再恢复。

相比把视图从视图树里 `removeChildView` 再挂回去，`setVisible` 不会打断页面、不触发重新加载，也不存在「恢复时找不到激活项」的问题。

### 视图常驻，切换只改可见性

标签的网页视图在首次激活时创建，之后常驻内存，切换标签仅切换可见性，因此来回切换不会丢失页面状态。视图按需懒创建（不会在启动时把 N 个站点全部加载），所以未激活过的标签显示的是配置名称而非页面标题。

### 配置格式与迁移

`config/sites.json` 会持久化站点顺序与上次激活的标签：

```json
{
  "version": 2,
  "sites": [{ "id": "1", "name": "DeepSeek", "url": "https://chat.deepseek.com/", "partitionKey": "AI" }],
  "activeSiteId": "1"
}
```

旧版本写入的是「只有站点列表的裸数组」，启动时会自动识别并转换为 v2 格式。写入做了 250ms 防抖，拖拽排序、快速切标签不会频繁落盘。

### 站点数据与「是否显示」

`config/sites.json` 里每个站点可以带一个 `visible` 字段：**省略或 `true` 表示在标签栏显示，`false` 表示只在标签管理里保留**。取消勾选写 `false`，重新勾选则把该字段整个删掉，所以旧配置和正常状态下的文件都不会出现冗余字段，也就不需要为这个功能做数据迁移。

打开时若上次激活的站点已被删除或已被隐藏，会自动退回第一个可见标签。

### 快捷键与系统菜单

应用菜单刻意不包含 `window` / `view` 相关角色，避免 `Ctrl + W`（关窗）、`Ctrl + R`（重载界面）这些默认加速键与标签级快捷键冲突；剪贴板与缩放角色保留，保证输入框里复制粘贴正常。开发者工具可用 `F12` 或菜单打开。

快捷键在**主进程**用 `before-input-event` 捕获（`electron/shortcuts.ts`），同时挂在窗口自身的 webContents 与每一个网页视图的 webContents 上。这点很关键：用户点进网页后焦点在原生视图里，渲染进程的 `keydown` 根本收不到事件——只在标签栏那一侧监听，会出现「点了网页之后 Ctrl + T 就没反应」。其中只涉及视图的操作（重载、后退、前进）由主进程直接执行，其余以指令形式下发给渲染进程。

### 链接与标签的关系

站点自行发起的开新窗口请求（`target="_blank"`、`window.open`）一律拒绝新建窗口，改为在**当前标签内就地导航**，因此标签栏只包含手动添加的标签。代价是新页面会替换掉当前页面，所以标签栏左侧提供了前进/后退按钮，并绑定 `Alt + ←` / `Alt + →`。`mailto:` 之类无法在页面里渲染的协议仍交给系统处理。

> 如果你更希望这类链接交给系统默认浏览器打开，改 `electron/view-manager.ts` 里 `setWindowOpenHandler` 的处理分支即可（一行）。

### 顶部高度必须两处一致

标签栏高度由 `src/styles/base.css` 的 `--header-height` 决定，网页视图的起始偏移由 `electron/view-manager.ts` 的 `HEADER_HEIGHT` 决定，两者必须保持同为 `50px`，否则网页会与标签栏错位。

### 调试端口

设置环境变量 `SITE_MANAGER_DEBUG_PORT` 后启动，会开启 Chrome DevTools Protocol 远程调试端口，便于自动化自检：

```bash
SITE_MANAGER_DEBUG_PORT=9222 npm run dev
```

默认不开启。

### 免安装绿化支持

项目已配置 `PORTABLE_EXECUTABLE_DIR` 环境变量兼容，无论是打包为绿色文件夹还是单文件（Portable），配置 (`config/`) 及日志 (`logs/`) 都会生成在 `.exe` 当前所在文件夹下。
