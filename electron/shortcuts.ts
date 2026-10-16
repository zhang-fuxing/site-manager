import type { WebContents } from 'electron'
import type { ShortcutCommand } from '../shared/types'

export interface ShortcutContext {
  /** 当前激活的标签 id，没有则为 null */
  getActiveId: () => string | null
  /** 当前激活标签的网页 webContents，用于把开发者工具开在网页上而不是外壳上 */
  getActiveContents: () => WebContents | null
  reloadActive: () => void
  goBack: () => void
  goForward: () => void
  /** 把标签操作指令发回渲染进程 */
  dispatch: (command: ShortcutCommand) => void
}

/** Ctrl+1…9 用物理键位判断，避免小键盘 / 非美式布局下 input.key 不是数字 */
const DIGIT_CODES: Record<string, number> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Digit5: 5,
  Digit6: 6,
  Digit7: 7,
  Digit8: 8,
  Digit9: 9,
}

/**
 * 长按会持续触发 keyDown，这些操作每按一次就该生效一次：
 * 按住 Ctrl+Tab 一路跳过 8 个标签、按住 Ctrl+1 反复重载同一个标签都不是用户想要的。
 * Ctrl+W、Ctrl+R、F5 保持可重复，那才是「按住不放」的合理用法。
 */
const REPEATABLE = new Set(['w', 'r', 'f5'])

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
    const repeatable = REPEATABLE.has(lower)

    // 开发者工具：优先开在正在浏览的网页上，焦点在外壳时才开外壳的
    if (key === 'F12' || (ctrl && input.shift && lower === 'i')) {
      event.preventDefault()
      const target = context.getActiveContents()
      if (target && !target.isDestroyed()) {
        if (target.isDevToolsOpened()) target.closeDevTools()
        else target.openDevTools({ mode: 'right' })
      } else {
        contents.toggleDevTools()
      }
      return
    }

    // Alt + ←/→：页面历史前进后退。就地导航之后没有这个就回不去了
    if (input.alt && !ctrl) {
      if (key === 'ArrowLeft') {
        event.preventDefault()
        if (!input.isAutoRepeat) context.goBack()
        return
      }
      if (key === 'ArrowRight') {
        event.preventDefault()
        if (!input.isAutoRepeat) context.goForward()
        return
      }
    }

    // Esc 不拦截：页面自己也常用它（关弹幕、退出全屏等），这里只额外通知渲染进程收起弹层
    if (key === 'Escape') {
      if (!input.isAutoRepeat) context.dispatch({ kind: 'dismiss' })
      return
    }

    if (!ctrl) {
      if (key === 'F5') {
        event.preventDefault()
        context.reloadActive()
      }
      return
    }

    if (input.isAutoRepeat && !repeatable) return

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

    const digit = DIGIT_CODES[input.code] ?? (/^[1-9]$/.test(key) ? Number(key) : null)
    if (digit !== null) {
      event.preventDefault()
      context.dispatch({ kind: 'jump-to', position: digit })
    }
  })
}
