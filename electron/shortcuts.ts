import type { WebContents } from 'electron'
import type { ShortcutCommand } from '../shared/types'

export interface ShortcutContext {
  /** 当前激活的标签 id，没有则为 null */
  getActiveId: () => string | null
  reloadActive: () => void
  goBack: () => void
  goForward: () => void
  /** 把标签操作指令发回渲染进程 */
  dispatch: (command: ShortcutCommand) => void
}

/**
 * 在指定 webContents 上捕获应用级快捷键。
 *
 * 必须同时挂到「窗口自身的 webContents」和「每一个网页视图的 webContents」上：
 * 用户一旦点进网页，焦点就在原生视图里，只挂在标签栏那一侧会全部失效。
 *
 * 由主进程接管还有个好处：重载、后退、前进这类只涉及视图的操作可以直接处理，
 * 不必绕回渲染进程。
 */
export function attachShortcuts(contents: WebContents, context: ShortcutContext): void {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    const key = input.key
    const lower = key.toLowerCase()
    const ctrl = input.control || input.meta

    // 开发者工具
    if (key === 'F12' || (ctrl && input.shift && lower === 'i')) {
      event.preventDefault()
      contents.toggleDevTools()
      return
    }

    // Alt + ←/→：页面历史前进后退。就地导航之后没有这个就回不去了
    if (input.alt && !ctrl) {
      if (key === 'ArrowLeft') {
        event.preventDefault()
        context.goBack()
        return
      }
      if (key === 'ArrowRight') {
        event.preventDefault()
        context.goForward()
        return
      }
    }

    // Esc 不拦截：页面自己也常用它（关弹幕、退出全屏等），这里只额外通知渲染进程收起弹层
    if (key === 'Escape') {
      context.dispatch({ kind: 'dismiss' })
      return
    }

    if (!ctrl) {
      if (key === 'F5') {
        event.preventDefault()
        context.reloadActive()
      }
      return
    }

    if (lower === 'tab') {
      event.preventDefault()
      context.dispatch({ kind: input.shift ? 'prev-tab' : 'next-tab' })
      return
    }

    if (lower === 't') {
      event.preventDefault()
      context.dispatch({ kind: input.shift ? 'reopen-closed' : 'add-tab' })
      return
    }

    if (lower === 'w') {
      event.preventDefault()
      context.dispatch({ kind: 'close-active' })
      return
    }

    if (lower === 'r') {
      event.preventDefault()
      context.reloadActive()
      return
    }

    if (/^[1-9]$/.test(key)) {
      event.preventDefault()
      context.dispatch({ kind: 'jump-to', position: Number(key) })
    }
  })
}
