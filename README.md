# 网址管理器 (Site Manager)

基于 Electron + Vue 3 开发的多标签页桌面端网址管理工具。支持站点多标签页切换、多账号 Cookie 隔离（Partition）、自定义站点持久化配置及日志记录。

---

## 🛠️ 环境要求

* **Node.js**: `>= 16.0.0` (推荐 18.x 或 20.x)
* **npm**: `>= 8.0.0`
* **操作系统**: Windows 10/11 或 Linux (Ubuntu/Debian)

---

## 🚀 技术栈

* **核心框架**: Electron
* **前端框架**: Vue 3 + TypeScript
* **构建工具**: Vite + vite-plugin-electron
* **原生组件**: WebContentsView (支持多视图与独立 Session 隔离)
* **打包工具**: electron-builder

---

## 📂 项目目录功能说明

```text
site-manager/
├── config/                  # [自动生成] 本地站点数据配置文件 (sites.json)
├── logs/                    # [自动生成] 应用运行日志目录 (main.log)
├── electron/                # Electron 主进程与预加载脚本源码
│   ├── main.ts              # 主进程入口文件 (窗口管理、IPC 监听、View 调度)
│   ├── preload.ts           # 预加载脚本 (安全暴露上下文 API 给渲染进程)
│   ├── store.ts             # 数据持久化模块 (原生 fs 实现读写)
│   └── logger.ts            # 日志记录模块 (封装 electron-log)
├── src/                     # Vue 3 渲染进程源码
│   ├── assets/              # 静态资源文件
│   ├── App.vue              # 主界面组件 (导航栏、Tab 标签、模态框)
│   ├── main.ts              # 前端入口文件
│   └── env.d.ts             # TypeScript 类型声明 (扩展 window.electronAPI)
├── dist/                    # Vue 前端编译产物
├── dist-electron/           # Electron 主进程/Preload 编译产物
├── release/                 # electron-builder 构建打包输出产物目录
├── package.json             # 项目依赖配置及打包指令
├── vite.config.ts           # Vite 及 Electron 插件配置文件
└── README.md                # 项目文档
```

💻 本地开发与使用

1. 安装依赖

```Bash
npm install
```

2. 启动开发环境

运行以下命令唤起 Electron 开发窗口（支持 Hot Reload）：

```Bash
npm run dev
```

3. 使用说明

切换网址：点击顶部导航栏中的标签页，即可无缝切换显示的网页视图。

添加网址：点击右上角 + 添加网址 按钮唤起模态框，输入网站名称、URL（及可选的隔离组 Key）后点击确定。

删除网址：鼠标悬停至标签页上，点击右侧 ✕ 按钮即可销毁视图并同步从本地配置文件中移除。

登录隔离 (Partition)：在添加站点时填入不同的“隔离组 Key”，系统将自动隔离开该站点的 Cookie 与 LocalStorage，实现同网站多账号同时登录。

📦 应用打包 (Build)
项目使用 electron-builder 进行打包，支持输出免安装绿化版程序。

1. 打包 Windows 程序 (64位)
运行以下命令进行打包，产物将生成在 release/win-unpacked 文件夹中：

```Bash
npm run pack:win
```

打包完成后，直接双击运行 release/win-unpacked/Site Manager.exe 即可使用。配置及日志文件将自动生成在 .exe 同级目录下。

2. 打包 Linux 程序 (.AppImage / .deb)

```Bash
npm run pack:linux
```

3. 清理构建产物

如果需要清理历史编译产物（dist、dist-electron、release）以及运行产生的临时日志/配置文件，执行：

```Bash
npm run clean
```

📝 注意事项
层级遮挡处理：应用使用了 Electron 原生的 WebContentsView 视图，当弹窗或下拉菜单展开时，系统会自动隐藏底层原生视图以保证 Vue UI 组件不被遮挡。

免安装绿化支持：项目已配置 PORTABLE_EXECUTABLE_DIR 环境变量兼容，无论是打包为绿色文件夹还是单文件（Portable），配置 (config/) 及日志 (logs/) 都会始终保持生成在 .exe 当前所在的文件夹下。