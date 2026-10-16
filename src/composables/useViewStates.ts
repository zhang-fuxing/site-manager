import { onScopeDispose, shallowReactive } from 'vue'
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
 */
export function useViewStates(): ViewStateStore {
  const states = shallowReactive(new Map<string, ViewState>())

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
