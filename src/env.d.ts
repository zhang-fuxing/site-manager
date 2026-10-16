/// <reference types="vite/client" />

import type { ElectronAPI } from '../shared/types'

declare global {
  interface Window {
    /** 由 electron/preload.ts 通过 contextBridge 注入 */
    electronAPI: ElectronAPI
  }
}
