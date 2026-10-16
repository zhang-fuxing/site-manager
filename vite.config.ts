import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

/**
 * 主进程与 preload 必须打成 CommonJS。
 *
 * Electron 自己只提供 CommonJS 入口，而 Node 的 ESM 加载器对 CJS 的具名导出
 * 依赖静态分析，`import { ipcMain } from 'electron'` 会在运行时直接抛
 * "does not provide an export named 'ipcMain'"。改成 CJS 输出后就是普通的
 * require，没有这层脆弱的转换，启动也不必先整份解析 ESM 模块图。
 *
 * 两个入口都走 lib 模式：Vite 只会在 lib 模式下认 `formats`，
 * 普通应用构建即使在 rollupOptions 里写 format: 'cjs' 也会被忽略。
 */
function cjsLib(entry: string, fileName: string) {
  return {
    build: {
      lib: { entry, formats: ['cjs' as const], fileName: () => fileName },
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs' as const, entryFileNames: fileName },
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  /**
   * 开发服务器端口。
   *
   * 有些 Windows 机器会把 5173 划进「保留端口段」（`netsh interface ipv4 show
   * excludedportrange protocol=tcp` 可查，常见区间 4535-5240），此时监听会直接
   * 报 EACCES，表现就是 npm run dev 启动失败、Electron 窗口根本不出现。
   * package.json 的 dev 脚本默认传了 5300 规避这一点，也可以随时覆盖：
   *   npm run dev -- --port 6100
   *   SITE_MANAGER_DEV_PORT=6100 npm run dev
   */
  server: {
    port: Number(process.env.SITE_MANAGER_DEV_PORT) || 5173,
    // 端口被占用时自动顺延，而不是直接失败退出
    strictPort: false,
  },
  plugins: [
    vue(),
    electron([
      {
        // 主进程入口 → dist-electron/main.cjs
        entry: 'electron/main.ts',
        vite: cjsLib('electron/main.ts', 'main.cjs'),
      },
      {
        // 预加载脚本入口 → dist-electron/preload.cjs
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: cjsLib('electron/preload.ts', 'preload.cjs'),
      },
      {
        // 自检入口：只把 store 的导出重新暴露出来，供 npm run test 在 Electron 里加载
        entry: 'electron/test-entry.ts',
        vite: cjsLib('electron/test-entry.ts', 'test-entry.cjs'),
      },
    ]),
  ],
})
