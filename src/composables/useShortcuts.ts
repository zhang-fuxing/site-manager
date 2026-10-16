import { onMounted, onUnmounted } from 'vue'
import type { ShortcutCommand } from '../../shared/types'

export interface ShortcutHandlers {
  addTab: () => void
  closeActive: () => void
  nextTab: () => void
  prevTab: () => void
  reopenClosed: () => void
  /** 收到 1-9 的原始数字键，9 约定为「最后一个标签」 */
  jumpToTab: (position: number) => void
  /** 关闭最上层的弹层，返回 true 表示这次 Esc 已被消费 */
  dismissOverlay: () => boolean
}

/**
 * 接收主进程下发的快捷键指令。
 *
 * 快捷键本身在主进程的 before-input-event 里捕获（见 electron/shortcuts.ts），
 * 而不是在这里监听 keydown：用户一旦点进网页，焦点就在原生视图上，
 * 渲染进程根本收不到键盘事件，会出现「点了网页之后 Ctrl+T 就没反应」的问题。
 *
 * 只涉及视图的操作（重载、后退、前进）由主进程直接处理，不经过这里。
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = window.electronAPI.onShortcutCommand((command: ShortcutCommand) => {
      switch (command.kind) {
        case 'add-tab':
          handlers.addTab()
          break
        case 'close-active':
          handlers.closeActive()
          break
        case 'next-tab':
          handlers.nextTab()
          break
        case 'prev-tab':
          handlers.prevTab()
          break
        case 'reopen-closed':
          handlers.reopenClosed()
          break
        case 'jump-to':
          handlers.jumpToTab(command.position)
          break
        case 'dismiss':
          handlers.dismissOverlay()
          break
      }
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })
}
