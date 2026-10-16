/**
 * 自检入口。
 *
 * 只是把主进程里几个「纯逻辑」模块的导出重新暴露一次，让 test/store.test.cjs
 * 能在 Electron 运行时里直接加载它们（这些模块依赖 electron 的 app / session，
 * 用 Node 跑不起来）。
 *
 * 不含任何副作用：开发模式下 vite-plugin-electron 会把它一起打包并启动一次，
 * 没有输出也不会做任何事。
 */
export * from './store'
export * from '../shared/site-partition'
