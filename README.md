# 网址管理器 (Site Manager)

基于 Electron + Vue 3 开发的多标签页桌面端网址管理工具。支持站点多标签页切换、拖拽排序、多账号登录隔离（隔离组 / 独立会话）、自定义站点持久化配置及日志记录。

---

## ✨ 标签管理能力

| 操作 | 方式 |
| --- | --- |
| 切换标签 | 单击标签 / `Ctrl + Tab`、`Ctrl + Shift + Tab` / `Ctrl + 1…9`（9 为最后一个） |
| 调整顺序 | 直接拖拽标签，落点处显示插入指示线 |
| 强制刷新页面 | 标签上的 ⟳ 按钮（忽略缓存） |
| 重载页面 | 右键菜单「重新加载」/ `Ctrl + R` / `F5` |
| 后退 / 前进 | 标签栏左侧的 ← → 按钮 / `Alt + ←`、`Alt + →` |
| 打开标签管理 | 右上角「标签管理」/ `Ctrl + T`（进入新增站点表单） |
| 新增 / 编辑站点 | 标签管理面板里的「＋ 新增站点」「编辑」 |
| 复制站点 | 标签管理面板里的「复制」，副本紧跟在源站点之后 |
| 删除站点 | 标签管理面板里的「删除」（带一次确认） |
| 配置是否显示 | 标签管理面板里的勾选框，取消勾选即从标签栏隐藏 |
| 隐藏当前标签 | 标签右键菜单「隐藏此标签」/ `Ctrl + W`（可逆，配置不丢） |
| 恢复上次删除 | 标签管理面板里的「恢复上次删除」/ `Ctrl + Shift + T`（最多 20 个） |
| 网页开发者工具 | `F12` / `Ctrl + Shift + I`（开在当前网页上；焦点在外壳时开界面自身的） |
| 查看会话残留 | 标签管理面板底部的「清理会话残留（N）」与「查看会话详情」 |

其他细节：

- **标签上不再有关闭按钮**：✕ 已换成强制刷新 ⟳，避免误点把站点删掉。删除只能在标签管理面板里完成，那里还会再确认一次。
- **「删除」和「隐藏」是两回事**：取消勾选「显示」只是把它从标签栏收起来，配置原样保留，随时能勾回来；删除才会真正从配置中移除（仍然可以恢复）。
- 标签显示**页面真实标题**与 favicon，标题未就绪时退回站点配置名称，加载中显示转圈动画。
- 加载失败的标签会常驻一个红色 `!`，点它即可重试；渲染进程崩溃（页面自身 OOM 等）也会转成这个可重试的状态，而不是留一片白屏。
- 标签栏溢出时，激活的标签会自动滚动到可见区域；在标签栏上滚轮可直接横向滚动。
- 页面里的 `target="_blank"` / `window.open` **不会**新建标签页，而是像单页应用一样在**当前标签内就地导航**；标签栏始终只包含你手动添加的标签。想回到上一页用 `Alt + ←` 或标签栏左侧的 ← 按钮。
- 上次激活的标签、标签顺序与**窗口尺寸/位置**都会持久化，重启后原样恢复（外接显示器拔掉导致坐标越界时会自动回到默认位置）。
- 应用同一时刻只允许运行一个实例：重复启动只会把已有窗口激活，避免两个进程同时覆盖站点配置。

---

## 🔐 登录隔离：独立会话 vs 隔离组

每个站点在添加/编辑时都要选一种会话归属，它决定这个标签用哪套 Cookie 与 LocalStorage：

| 模式 | 说明 | 适用场景 |
| --- | --- | --- |
| **独立会话**（默认） | 分区名 `persist:isolated-<站点id>`，与任何其他站点都不共享 | 绝大多数情况。不同网站之间共享会话只有风险、没有收益 |
| **隔离组** | 分区名 `persist:<组名>`，**组名相同的站点共用**一套 Cookie / LocalStorage | 同一网站要同时登录两个账号：加两个标签、填同一个组名 |

要点：

- 隔离组名只允许 `A-Z B-Z 0-9 _ -`，最长 32 字符（它会直接成为 Electron 的 persist 分区名）。表单里输入非法字符会自动收敛，不会静默出错。
- **不同网站不要放进同一个组**：它们会共用同一个 Cookie Jar。旧版本把 6 个 AI 站点默认写成了同一个 `AI` 组，标签管理面板检测到这类历史配置时会给出提示，并提供「拆成独立会话」一键修正。
- 改隔离组会换一套 Session，因此该标签的登录状态需要重新登录一次——这是隔离本身的语义，不是 bug。

---

## 🧹 会话残留清理

站点被删除、或隔离组被改过之后，旧分区目录里仍然躺着完整的 Cookie / LocalStorage，Electron 不会自动回收。标签管理面板底部提供：

- **清理会话残留（N）**：清空这些无人引用的分区数据（Cookie、LocalStorage、缓存），N 为待清理数量。
- **查看会话详情**：展开「正在使用 / 磁盘上存在 / 历史记录 / 可清理」四份清单。当按钮显示 0 时，用它就能确认到底是「确实没有残留」还是「扫描没找到目录」。

两个实现细节（Windows 上尤其明显）：

1. 只要碰过某个分区的 Session，Chromium 就会立刻为该分区建好目录并持有句柄，之后目录既删不掉也改不了名。所以清理是**先清数据、再尽力删目录**；数据一定被清空，删不掉的空壳目录会被记下来，等**下次启动**（句柄已释放）时自动回收。
2. 扫描只认可信的分区名（本应用的独立会话前缀 `isolated-`、主窗口的 `main`、以及配置里记录过的组名），不会去动 userData 里其他程序留下的目录。

---

## 🛠️ 环境要求

* **Node.js**: `>= 18.0.0`（推荐 20.x 及以上）
* **npm**: `>= 9.0.0`
* **操作系统**: Windows 10/11 或 Linux (Ubuntu/Debian)

---

## 🚀 技术栈

* **核心框架**: Electron（`WebContentsView` 多视图 + 独立 Session 隔离）
* **前端框架**: Vue 3 + TypeScript
* **构建工具**: Vite + vite-plugin-electron
* **打包工具**: electron-builder

主进程与 preload 由 Vite 打成 **CommonJS**（`dist-electron/main.cjs`、`dist-electron/preload.cjs`）：Electron 自身只提供 CommonJS 入口，用 ESM 具名导入（`import { ipcMain } from 'electron'`）会在运行时直接抛错，改成 CJS 输出最稳妥。

---

## 📂 项目目录功能说明

```text
site-manager/
├── config/                    # [自动生成] 站点数据 (sites.json) 与窗口几何 (window-state.json)
├── logs/                      # [自动生成] 应用运行日志 (main.log)
├── shared/
│   ├── types.ts               # 主进程与渲染进程共用的类型定义（纯类型，编译后擦除）
│   └── site-partition.ts      # 隔离组 / 分区名的解析规则（两侧共用，纯字符串运算）
├── electron/                  # 主进程
│   ├── main.ts                # 应用与窗口生命周期、单实例锁、应用菜单、调试端口开关
│   ├── ipc.ts                 # IPC 通道注册（视图编排 + 持久化写入 + 会话清理）
│   ├── view-manager.ts        # WebContentsView 生命周期、显隐、边界、会话权限策略
│   ├── shortcuts.ts           # 应用级快捷键捕获（主进程 before-input-event）
│   ├── store.ts               # 版本化状态持久化（迁移、防抖写入、会话残留清理）
│   ├── window-state.ts        # 窗口尺寸/位置留存（越界自动回退）
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
│   │   ├── useTabs.ts         # 标签语义：激活 / 删除 / 恢复 / 排序 / 隔离组
│   │   ├── useViewStates.ts   # 订阅视图状态（真实标题、加载态、favicon）
│   │   └── useShortcuts.ts    # 全局快捷键
│   └── components/
│       ├── TabBar.vue         # 标签栏：滚动、滚轮横滚、拖拽排序
│       ├── TabItem.vue        # 单个标签：favicon、真实标题、加载态、刷新/重试
│       ├── TabContextMenu.vue # 标签右键菜单（只放视图级操作）
│       ├── SiteManagerModal.vue # 标签管理面板：列表 + 显隐开关 + 增删改 + 会话清理
│       ├── SiteForm.vue       # 站点表单（新增 / 编辑，含隔离组三态选择）
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

> 国内网络可以在**系统环境变量**里配置镜像（`.npmrc` 里写大写键会被 npm 当成未知配置项报警告）：
>
> ```bash
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```

2. 启动开发环境

```bash
npm run dev
```

3. 类型检查（同时覆盖渲染进程 `src/` 与主进程 `electron/`、`shared/`）

```bash
npm run typecheck
```

4. 构建产物（会先跑一遍类型检查）

```bash
npm run build
```

### 使用说明

* **切换网址**：点击顶部标签页即可切换，网页状态会保留（视图常驻，只切换可见性）。
* **管理站点**：点右上角「标签管理」（或 `Ctrl + T`），在那里新增、编辑、复制、删除站点，并勾选是否在标签栏显示。删除会再确认一次，误删可用面板里的「恢复上次删除」或 `Ctrl + Shift + T` 找回。
* **刷新页面**：标签上的 ⟳ 是强制刷新（忽略缓存）；普通重载用右键菜单或 `Ctrl + R` / `F5`。
* **登录隔离**：新增/编辑站点时选择「独立会话」或「隔离组」。给同一网站的两个标签填同一个组名，即可同时登录两个账号（详见上文「登录隔离」）。

---

## 📦 应用打包 (Build)

项目使用 electron-builder 进行打包，支持输出免安装绿化版程序。

打包资源放在 `build/` 目录，electron-builder 按约定自动取用，无需在配置里指定路径：

* Windows → `build/icon.ico`（内含 16 / 24 / 32 / 48 / 64 / 128 / 256 多尺寸，任务栏与资源管理器各档分辨率都有对应图）
* Linux → `build/icon.png`（512×512）

exe 里的「产品名称 / 发布者 / 版权」来自 `package.json` 的 `name`、`productName`、`description` 与 `author`。

### 依赖下载走国内镜像

打包时 electron-builder 需要下载 Electron 二进制（约 150MB）以及 nsis 等打包工具。**这些下载不看 `.npmrc`**：Electron 走 `@electron/get`，工具走 electron-builder 自己的下载器，它们只认环境变量或构建配置。国内直连 GitHub 会非常慢甚至卡住，所以镜像**两处都配了**，互为兜底：

**1. `package.json`（推荐，不依赖环境）** —— 直接指定 Electron 二进制的下载地址：

```json
"build": {
  "electronDownload": {
    "mirror": "https://npmmirror.com/mirrors/electron/",
    "customDir": "v{{ version }}"
  }
}
```

`customDir` 里的 `v` 前缀不能省：镜像站把版本目录命名为 `v44.0.0`，少了 `v` 会 404。改为别的镜像时，先确认该站的目录结构再动这两个字段。

**2. `.npmrc`（覆盖 `npm install` 与打包工具）** —— 这个文件里的镜像键**是有效的**，别看着警告就删：

```ini
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

- npm 9+ 会对后三行打印 `Unknown project config` 警告 —— 那只是提示，不是错误。
- 但 npm 依然会把它们写成环境变量（`electron_mirror` → `npm_config_electron_mirror`），而 `@electron/get` / `electron-builder` 正是通过环境变量读镜像：`@electron/get` 的取值顺序里 `npm_config_electron_mirror` 是**最高优先级**。删掉这几行，打包就会回落 GitHub 并卡在 `Downloading electron-v...zip`。
- `ELECTRON_BUILDER_BINARIES_MIRROR` 管的是 nsis / winCodeSign 等打包工具的下载，`package.json` 里配不到，只能靠这里或系统环境变量。

> 缓存说明：Electron 的 zip 会缓存在 `%LOCALAPPDATA%\electron\Cache`，缓存目录名是**下载 URL 的 sha256**。换镜像就等于换 URL，旧缓存不会被复用（会重新下载一次）；打包工具缓存在 `%LOCALAPPDATA%\electron-builder\Cache`，与 URL 无关。
>
> 若 `npm run pack:win` 卡在 `Downloading electron-v...zip`，说明镜像没生效、正在走 GitHub，Ctrl+C 停掉后按上面的配置检查即可。

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

**隐藏标签同样不销毁视图**：隐藏是可逆操作，而销毁意味着正在生成的回答、没提交的表单全部丢失。只有真正删除站点、或站点换了隔离组（必须换 Session）时才销毁视图。

### 配置格式与迁移

`config/sites.json` 会持久化站点顺序、上次激活的标签与会话清单：

```json
{
  "version": 3,
  "sites": [
    { "id": "1", "name": "DeepSeek", "url": "https://chat.deepseek.com/", "partitionMode": "isolated" },
    { "id": "2", "name": "DeepSeek 小号", "url": "https://chat.deepseek.com/", "partitionMode": "group", "partitionKey": "deepseek-alt" }
  ],
  "activeSiteId": "1",
  "usedPartitions": ["isolated-1", "deepseek-alt"],
  "prunedPartitions": []
}
```

- **v1** 是「只有站点列表的裸数组」，**v2** 缺少 `partitionMode` 字段，启动时都会自动识别并升级到 v3。
- 升级**不改变既有站点的会话归属**（老配置里有组名的仍是同一个组，`partitionMode` 只是被显式补上），所以登录状态不会因为升级而丢失。
- `usedPartitions` 记录曾经使用过的分区，`prunedPartitions` 记录「数据已清空、只剩空壳」的分区；两者支撑上文提到的会话残留清理。
- 写入做了 250ms 防抖，拖拽排序、快速切标签不会频繁落盘；退出前会强制落盘一次。
- 读取时会做结构校验：地址不是 http/https 的条目、缺字段的条目、重复 id 会被丢弃并记日志，避免手工编辑坏配置文件导致启动异常。配置整体损坏时回退到默认站点。

### 站点数据与「是否显示」

`config/sites.json` 里每个站点可以带一个 `visible` 字段：**省略或 `true` 表示在标签栏显示，`false` 表示只在标签管理里保留**。取消勾选写 `false`，重新勾选则把该字段整个删掉，所以旧配置和正常状态下的文件都不会出现冗余字段，也就不需要为这个功能做数据迁移。

打开时若上次激活的站点已被删除或已被隐藏，会自动退回第一个可见标签。

### 快捷键与系统菜单

应用菜单刻意不包含 `window` / `view` 相关角色，避免 `Ctrl + W`（关窗）、`Ctrl + R`（重载界面）这些默认加速键与标签级快捷键冲突；剪贴板与缩放角色保留，保证输入框里复制粘贴正常。菜单里的「界面开发者工具」作用于外壳；网页自身的开发者工具用 `F12` / `Ctrl + Shift + I`，会开在当前网页上。

快捷键在**主进程**用 `before-input-event` 捕获（`electron/shortcuts.ts`），同时挂在窗口自身的 webContents 与每一个网页视图的 webContents 上。这点很关键：用户点进网页后焦点在原生视图里，渲染进程的 `keydown` 根本收不到事件——只在标签栏那一侧监听，会出现「点了网页之后 Ctrl + T 就没反应」。其中只涉及视图的操作（重载、后退、前进）由主进程直接执行，其余以指令形式下发给渲染进程。

几个边界处理：数字键按**物理键位**（`input.code === 'Digit1'`）识别，小键盘与非美式布局下同样有效；长按 Ctrl+Tab / Ctrl+数字只生效一次，而 Ctrl+W、Ctrl+R、F5 保持可重复触发。

### 链接与标签的关系

站点自行发起的开新窗口请求（`target="_blank"`、`window.open`）一律拒绝新建窗口，改为在**当前标签内就地导航**，因此标签栏只包含手动添加的标签。代价是新页面会替换掉当前页面，所以标签栏左侧提供了前进/后退按钮，并绑定 `Alt + ←` / `Alt + →`。`mailto:` / `tel:` 之类无法在页面里渲染的协议仍交给系统处理，其余未知协议直接忽略（不交给系统，避免被站点当成投递器）。

> 如果你更希望这类链接交给系统默认浏览器打开，改 `electron/view-manager.ts` 里 `setWindowOpenHandler` 的处理分支即可（一行）。

### 会话权限默认收紧

每个隔离会话都会安装权限策略：全屏、指针锁定、剪贴板**写入**、后台同步、空闲检测这类不涉及隐私的能力直接放行；摄像头、麦克风（音频除外）、定位、通知、剪贴板读取、HID / 串口 / USB 等一律拒绝并记日志。需要摄像头的站点可以在 `electron/view-manager.ts` 的 `SAFE_PERMISSIONS` 白名单里单独放行——那应该是明确的决定，而不是默认行为。

### 单实例与窗口状态

启动时先 `requestSingleInstanceLock()`：配置写入是「全量覆盖 + 内存缓存」，两个实例同时跑必然互相覆盖站点列表，更麻烦的是它们共用同一个 userData，而 Chromium 的缓存/存储目录并不支持多进程并发访问。第二次启动只会把已有窗口激活。

窗口尺寸与位置保存在 `config/window-state.json`：用 `getNormalBounds()` 取值，避免最大化状态下退出时把整屏尺寸写进配置；恢复时会校验坐标是否还落在某块屏幕内，越界则回退到默认尺寸。

### 顶部高度必须两处一致

标签栏高度由 `src/styles/base.css` 的 `--header-height` 决定，网页视图的起始偏移由 `electron/view-manager.ts` 的 `HEADER_HEIGHT` 决定，两者必须保持同为 `50px`，否则网页会与标签栏错位。

### 调试端口

设置环境变量 `SITE_MANAGER_DEBUG_PORT` 后启动，会开启 Chrome DevTools Protocol 远程调试端口，便于自动化自检：

```bash
SITE_MANAGER_DEBUG_PORT=9222 npm run dev
```

默认不开启。

### 免安装绿化支持

项目已配置 `PORTABLE_EXECUTABLE_DIR` 环境变量兼容，无论是打包为绿色文件夹还是单文件（Portable），配置 (`config/`)、窗口状态及日志 (`logs/`) 都会生成在 `.exe` 当前所在文件夹下。
