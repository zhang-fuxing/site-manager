import { onScopeDispose, reactive } from 'vue'
import type { ViewState } from '../../shared/types'

export interface ViewStateStore {
  /** siteId -> 运行状态 */
  states: Map<string, ViewState>
  get: (id: string) => ViewState | undefined
  drop: (id: string) => void
}

/**
 * 订阅主进程推送的网页视图状态：真实标题、加载态、favicon、加载错误。
 *
 * 必须在组件 setup 内调用，组件卸载时会自动取消订阅。
 * 用 Map 而不是数组，标签增删频繁时查找开销恒定。
 *
 * 注意这里用的是 reactive 而不是 shallowReactive：`states.get(id)` 属于
 * 集合操作，依赖的是集合的迭代键；浅层响应式下 Map 自身的 get/set 仍然会被
 * 代理追踪，但为了让「前进/后退按钮可用性」这类派生状态万无一失，直接
 * 整体换新对象 + 深层响应式更省心（state 对象始终是主进程推来的新对象）。
 */
export function useViewStates(): ViewStateStore {
  const states = reactive(new Map<string, ViewState>())

  const unsubscribe = window.electronAPI.onViewState((state) => {
    states.set(state.id, state)
  })
  onScopeDispose(() => unsubscribe())

  function get(id: string): ViewState | undefined {
    return states.get(id)
  }

  function drop(id: string): void {
    states.delete(id)
  }

  return { states, get, drop }
}
