import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from './logger'
import type { PersistedState, Site } from '../shared/types'

/** 当前落盘格式版本；v1 是「只有站点列表的裸数组」 */
const STATE_VERSION = 2

/** 合并短时间内的高频写入（切标签、拖拽排序会产生大量小改动） */
const WRITE_DEBOUNCE_MS = 250

const DEFAULT_SITES: Site[] = [
  { id: '1', name: 'DeepSeek', url: 'https://chat.deepseek.com/', partitionKey: 'AI' },
  { id: '2', name: '千问', url: 'https://www.qianwen.com/', partitionKey: 'AI' },
  { id: '3', name: '豆包', url: 'https://www.doubao.com/chat/', partitionKey: 'AI' },
  { id: '4', name: 'Gemini', url: 'https://gemini.google.com/app', partitionKey: 'AI' },
  { id: '5', name: 'ChatGPT', url: 'https://chatgpt.com/', partitionKey: 'AI' },
  { id: '6', name: 'Claude', url: 'https://claude.ai/new/', partitionKey: 'AI' },
  { id: '7', name: 'GitHub', url: 'https://github.com', partitionKey: 'web_link' },
]

/** 打包后落在 .exe 同级目录，开发环境落在项目根目录 */
function getStateFile(): string {
  const baseDir = app.isPackaged
    ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
    : process.cwd()
  return path.join(baseDir, 'config', 'sites.json')
}

function isSite(value: unknown): value is Site {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string'
  )
}

function serialize(state: PersistedState): string {
  return JSON.stringify(state, null, 2)
}

export function createDefaultState(): PersistedState {
  const sites = DEFAULT_SITES.map((site) => ({ ...site }))
  return { version: STATE_VERSION, sites, activeSiteId: sites[0]?.id ?? null }
}

/** 兼容 v1 裸数组，剔除结构不完整的条目，并保证 activeSiteId 一定指向现存站点 */
function normalize(raw: unknown): PersistedState | null {
  if (Array.isArray(raw)) {
    const sites = raw.filter(isSite)
    return { version: STATE_VERSION, sites, activeSiteId: sites[0]?.id ?? null }
  }
  if (raw && typeof raw === 'object') {
    const candidate = raw as Partial<PersistedState>
    if (Array.isArray(candidate.sites)) {
      const sites = candidate.sites.filter(isSite)
      const wanted = candidate.activeSiteId
      const activeSiteId =
        typeof wanted === 'string' && sites.some((site) => site.id === wanted)
          ? wanted
          : sites[0]?.id ?? null
      return { version: STATE_VERSION, sites, activeSiteId }
    }
  }
  return null
}

let cached: PersistedState | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedState | null = null

function writeNow(state: PersistedState): boolean {
  const file = getStateFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, serialize(state), 'utf-8')
    return true
  } catch (err) {
    logger.error('[Store] 写入配置文件失败:', err)
    return false
  }
}

function scheduleWrite(state: PersistedState): void {
  pending = state
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    const target = pending
    pending = null
    if (target) writeNow(target)
  }, WRITE_DEBOUNCE_MS)
}

function loadFromDisk(): PersistedState {
  const file = getStateFile()
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed = normalize(JSON.parse(raw))
      if (parsed) {
        // 旧格式或含冗余字段时，顺手按新格式回写一份
        if (raw.trim() !== serialize(parsed).trim()) {
          logger.info('[Store] 检测到旧版配置格式，已转换为 v' + STATE_VERSION)
          scheduleWrite(parsed)
        }
        return parsed
      }
      logger.warn('[Store] 配置文件结构无法识别，回退到默认站点:', file)
    }
  } catch (err) {
    logger.error('[Store] 读取配置文件失败，回退到默认站点:', err)
  }
  const fallback = createDefaultState()
  scheduleWrite(fallback)
  return fallback
}

/**
 * 读取当前状态。
 * 主进程内保留一份缓存，否则防抖写入期间会从磁盘读到旧值。
 */
export function readState(): PersistedState {
  if (!cached) cached = loadFromDisk()
  return cached
}

/** 合并字段并安排落盘 */
export function updateState(patch: Partial<PersistedState>): PersistedState {
  const next: PersistedState = { ...readState(), ...patch }
  cached = next
  scheduleWrite(next)
  return next
}

/** 退出前把还在防抖中的写入立即落盘 */
export function flushState(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  const target = pending
  pending = null
  if (target) writeNow(target)
}
