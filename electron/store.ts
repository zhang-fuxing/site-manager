import path from 'path'
import fs from 'fs'
import { app, session } from 'electron'
import { logger } from './logger'
import { isAllowedSiteUrl, isAppPartition, resolvePersistPartition } from '../shared/site-partition'
import type { CleanupResult, PersistedState, SessionDiagnostics, Site } from '../shared/types'

/** 当前落盘格式版本；v1 是「只有站点列表的裸数组」，v2 缺少 partitionMode */
const STATE_VERSION = 3

/** 合并短时间内的高频写入（切标签、拖拽排序会产生大量小改动） */
const WRITE_DEBOUNCE_MS = 250

/**
 * 首次启动时的预置站点。
 *
 * 这里刻意**不**给 partitionKey：每个站点各自一套 Session。
 * 早期版本把 6 个不同的 AI 站点都写成 partitionKey: 'AI'，等于让它们共用同一个
 * Cookie Jar / LocalStorage 配额，既没有「同站点多账号」的收益，又放大了跨站数据风险。
 * 需要多账号并存的场景，请把同一站点的两个标签配成同一个隔离组。
 */
const DEFAULT_SITES: Site[] = [
  { id: '1', name: 'DeepSeek', url: 'https://chat.deepseek.com/', partitionMode: 'isolated' },
  { id: '2', name: '千问', url: 'https://www.qianwen.com/', partitionMode: 'isolated' },
  { id: '3', name: '豆包', url: 'https://www.doubao.com/chat/', partitionMode: 'isolated' },
  { id: '4', name: 'Gemini', url: 'https://gemini.google.com/app', partitionMode: 'isolated' },
  { id: '5', name: 'ChatGPT', url: 'https://chatgpt.com/', partitionMode: 'isolated' },
  { id: '6', name: 'Claude', url: 'https://claude.ai/new/', partitionMode: 'isolated' },
  { id: '7', name: 'GitHub', url: 'https://github.com', partitionMode: 'isolated' },
]

/**
 * 打包后落在 .exe 同级目录（兼容免安装版），开发环境落在项目根目录。
 * 窗口尺寸、会话清单等都放在同一个目录下。
 */
export function resolveDataFile(...segments: string[]): string {
  const baseDir = app.isPackaged
    ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
    : process.cwd()
  return path.join(baseDir, ...segments)
}

/** 统一收口的 JSON 读取：读不到或解析失败一律返回 null，由调用方决定回退策略 */
export function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch (err) {
    logger.error('[Store] 读取文件失败:', file, err)
    return null
  }
}

function getStateFile(): string {
  return resolveDataFile('config', 'sites.json')
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

/**
 * 归一化单个站点。
 *
 * 除了丢掉类型不对的字段，还负责把地址收敛到 http/https：
 * sites.json 是用户可直接编辑的文本，而这份地址最终会交给 loadURL，
 * 不校验的话可以塞进 file:// 之类的本地路径。
 */
function normalizeSite(site: Site): Site | null {
  if (!isAllowedSiteUrl(site.url)) {
    logger.warn('[Store] 丢弃地址非 http/https 的站点:', site.name, site.url)
    return null
  }

  const next: Site = {
    id: site.id,
    name: site.name.trim() || site.url,
    url: site.url,
  }

  // 老配置没有 partitionMode：按有无组名推断，保留原有会话归属，
  // 这样升级后既有站点的登录态不会被换掉。
  if (site.partitionMode === 'isolated' || site.partitionMode === 'group') {
    next.partitionMode = site.partitionMode
  } else {
    next.partitionMode = site.partitionKey?.trim() ? 'group' : 'isolated'
  }

  if (next.partitionMode === 'group') {
    const key = site.partitionKey?.trim()
    if (key) next.partitionKey = key
    else next.partitionMode = 'isolated'
  }

  // 省略 true，只写 false：旧配置与正常状态下文件里都不该出现冗余字段
  if (site.visible === false) next.visible = false

  return next
}

function normalizeSites(raw: unknown[]): Site[] {
  const sites: Site[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!isSite(item) || seen.has(item.id)) continue
    const site = normalizeSite(item)
    if (!site) continue
    seen.add(site.id)
    sites.push(site)
  }
  return sites
}

function normalizePartitions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const names = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) names.add(item.trim())
  }
  return [...names]
}

/** 归一化落盘分区的并集：既保留历史记录，也纳入当前所有站点正在使用的分区 */
function mergePartitions(sites: Site[], known: string[]): string[] {
  const names = new Set(known)
  for (const site of sites) names.add(resolvePersistPartition(site))
  return [...names]
}

function serialize(state: PersistedState): string {
  return JSON.stringify(state, null, 2)
}

export function createDefaultState(): PersistedState {
  const sites = DEFAULT_SITES.map((site) => ({ ...site }))
  return {
    version: STATE_VERSION,
    sites,
    activeSiteId: sites[0]?.id ?? null,
    usedPartitions: mergePartitions(sites, []),
  }
}

/**
 * 从原始配置里捞出所有出现过的隔离组名。
 *
 * 旧配置里的组名（例如早期默认的 AI）在升级后可能已经没有任何站点引用，
 * 但它们对应的分区目录里还留着完整 Cookie。迁移时把组名记进 usedPartitions，
 * 用户点一次「清理会话残留」就能真正把这些历史会话清掉；
 * 漏记的话这些目录永远列不出来，也就永远清不掉。
 */
function collectRawPartitions(rawSites: unknown[]): string[] {
  const names = new Set<string>()
  for (const item of rawSites) {
    if (!item || typeof item !== 'object') continue
    const key = (item as Record<string, unknown>).partitionKey
    if (typeof key === 'string' && key.trim()) names.add(key.trim())
  }
  return [...names]
}

/** 兼容 v1 裸数组，剔除结构不完整的条目，并保证 activeSiteId 一定指向现存站点 */
function normalize(raw: unknown): PersistedState | null {
  const rawSites = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Partial<PersistedState>).sites)
      ? (raw as Partial<PersistedState>).sites
      : null

  if (!rawSites) return null

  const sites = normalizeSites(rawSites)
  const wanted = Array.isArray(raw) ? undefined : (raw as Partial<PersistedState>).activeSiteId
  const activeSiteId =
    typeof wanted === 'string' && sites.some((site) => site.id === wanted)
      ? wanted
      : sites[0]?.id ?? null

  const known = [
    ...collectRawPartitions(rawSites),
    ...(Array.isArray(raw) ? [] : normalizePartitions((raw as PersistedState).usedPartitions)),
  ]
  const pruned = Array.isArray(raw) ? [] : normalizePartitions((raw as PersistedState).prunedPartitions)

  return {
    version: STATE_VERSION,
    sites,
    activeSiteId,
    usedPartitions: mergePartitions(sites, known),
    ...(pruned.length > 0 ? { prunedPartitions: pruned } : {}),
  }
}

let cached: PersistedState | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedState | null = null

/**
 * 本轮清理中发现「数据已清空、但目录被句柄占着删不掉」的分区。
 * 收集起来在 clearOrphanSessions 结束时一次性写进 prunedPartitions，
 * 避免每个分区都各自落一次盘（也避免和 usedPartitions 的更新互相覆盖）。
 */
const prunedThisRun = new Set<string>()

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
  const raw = readJsonFile<unknown>(file)
  if (raw !== null) {
    const parsed = normalize(raw)
    if (parsed) {
      // 旧格式、含冗余字段或需要补 usedPartitions 时，顺手按新格式回写一份
      if (JSON.stringify(raw) !== serialize(parsed)) {
        logger.info('[Store] 检测到旧版配置格式，已转换为 v' + STATE_VERSION)
        scheduleWrite(parsed)
      }
      return parsed
    }
    logger.warn('[Store] 配置文件结构无法识别，回退到默认站点:', file)
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

/**
 * 合并字段并安排落盘；站点列表变化时顺带把使用过的分区记进配置。
 *
 * usedPartitions 必须按**内容**比较再决定是否扩展：只比长度会漏掉
 * 「删掉一个站点、同时新增一个站点」这种情况（长度不变但分区集合变了），
 * 漏记之后清理会话时就可能连正在使用的分区一起清掉。
 */
export function updateState(patch: Partial<PersistedState>): PersistedState {
  const current = readState()
  const next: PersistedState = { ...current, ...patch }

  if (patch.sites) {
    const previous = current.usedPartitions ?? []
    const merged = mergePartitions(patch.sites, previous)
    if (merged.length !== previous.length || merged.some((name, index) => name !== previous[index])) {
      next.usedPartitions = merged
    }
  }

  // 某个空壳分区又被某个站点用上了，就不能再留在待删名单里
  if (next.prunedPartitions?.length) {
    const inUse = new Set(next.sites.map((site) => resolvePersistPartition(site)))
    const kept = next.prunedPartitions.filter((name) => !inUse.has(name))
    if (kept.length) next.prunedPartitions = kept
    else delete next.prunedPartitions
  }

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

/**
 * 丢掉内存缓存并取消待写入，使下一次 readState 重新从磁盘读。
 *
 * 只给自检/测试用：正常运行时缓存是刻意的（否则防抖写入期间会读到旧值），
 * 但测试需要模拟「应用重启后重新读盘」这个动作，没有这个入口就只能靠
 * 进程重启来验证，代价太大。
 */
export function resetStateCache(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  pending = null
  cached = null
}

/** 当前所有站点仍在引用的分区名 */
export function activePartitions(): Set<string> {
  return new Set(readState().sites.map((site) => resolvePersistPartition(site)))
}

/** 曾经用过、但已经没有任何站点引用的分区名（即可以安全清理的会话残留） */
export function orphanPartitions(): string[] {
  const active = activePartitions()
  return (readState().usedPartitions ?? []).filter((name) => !active.has(name))
}

/** persist: 分区目录名允许的字符，与用户可输入的隔离组名规则一致 */
const SAFE_PARTITION = /^[A-Za-z0-9_-]{1,64}$/

/**
 * 列出本应用在 userData/Partitions 下真实存在的分区目录名。
 *
 * Electron 没有「列出所有分区」的 API，只能看目录：
 * persist:foo 的分区落在 <userData>/Partitions/foo。
 * 只认自己认得出来的名字（独立隔离前缀 + 配置里记录过的组名），
 * 既避免把别的项目留下的目录算进来，也避免误删无关数据。
 */
function listExistingPartitions(): string[] {
  const dir = path.join(app.getPath('userData'), 'Partitions')
  try {
    if (!fs.existsSync(dir)) return []
    const state = readState()
    const known = new Set([...(state.usedPartitions ?? []), ...activePartitions()])
    const pruned = new Set(state.prunedPartitions ?? [])
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter(
        (name) => !pruned.has(name) && SAFE_PARTITION.test(name) && (isAppPartition(name) || known.has(name)),
      )
  } catch (err) {
    logger.error('[Store] 读取分区目录失败:', err)
    return []
  }
}

/**
 * 清理没有被任何站点引用的 persist 分区。
 *
 * 用 Electron 的 Session API 而不是直接删目录：分区目录里的文件此刻可能被
 * 正在运行的网络线程持有，手工 rm 容易留下半截数据，交给 Electron 更稳。
 * 只清理真实存在、且没被引用的分区；配置文件里记着但目录已消失的名字顺手忘掉。
 */
export async function clearOrphanSessions(): Promise<CleanupResult> {
  const active = activePartitions()
  const existing = listExistingPartitions()
  const current = readState()
  const remembered = new Set(current.usedPartitions ?? [])

  // 真实存在的孤儿目录 ∪ 记录里已经不存在于磁盘的名字
  const targets = new Set<string>()
  for (const name of existing) if (!active.has(name)) targets.add(name)
  for (const name of remembered) if (!active.has(name) && !existing.includes(name)) targets.add(name)

  if (targets.size === 0) return { removed: 0, partitions: [] }

  const existed = new Set(existing)
  const removed: string[] = []
  prunedThisRun.clear()

  for (const name of targets) {
    if (!existed.has(name)) {
      removed.push(name)
      continue
    }
    try {
      await clearPartition(name)
      removed.push(name)
    } catch (err) {
      logger.error('[Store] 清理会话分区失败，保留记录以便重试:', name, err)
    }
  }

  if (removed.length > 0) {
    const drop = new Set(removed)
    // usedPartitions 与 prunedPartitions 必须在同一次更新里写：
    // 分两次 updateState 会互相覆盖，空壳名单就丢了（这里踩过一次）。
    const pruned = new Set([...(current.prunedPartitions ?? []), ...prunedThisRun])
    for (const name of active) pruned.delete(name)
    updateState({
      usedPartitions: (current.usedPartitions ?? []).filter((name) => !drop.has(name)),
      prunedPartitions: [...pruned],
    })
    logger.info('[Store] 已清理无引用的会话分区:', removed.join(', '))
  }

  return { removed: removed.length, partitions: removed }
}

/**
 * Chromium 在一个分区目录下使用的子目录。
 *
 * 清空数据之后这些目录往往还在（Cookie、缓存都躺在里面），只调
 * clearStorageData 并不等于「目录消失」，所以这里逐个删掉。
 * 只删白名单里的名字，用户自己丢进分区目录的文件不受影响。
 */
const PARTITION_SUBDIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Network',
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Service Worker',
  'Shared Dictionary',
  'WebStorage',
  'blob_storage',
  'File System',
  'Crashpad',
]

/** 分区目录里可能以文件形式出现的存储，需要单独删掉 */
const PARTITION_ROOT_FILES = [
  'Cookies',
  'Cookies-journal',
  'TransportSecurity',
  'Network Persistent State',
  'Reporting and NEL',
  'Trust Tokens',
  'Trust Tokens-journal',
]

/**
 * 清空一个分区的数据，返回分区名；清理过程中发现目录空壳会记进 prunedPartitions。
 *
 * 注意不要在这里直接落盘：调用方还要在同一次更新里合并 usedPartitions，
 * 各自 updateState 会互相覆盖（prunedPartitions 就是这样被抹掉过一次）。
 */
async function clearPartition(name: string): Promise<void> {
  const target = session.fromPartition(`persist:${name}`)
  await target.clearStorageData()
  await target.clearCache()

  const root = path.join(app.getPath('userData'), 'Partitions', name)
  if (!fs.existsSync(root)) return

  removePath(root, [
    ...PARTITION_SUBDIRS.map((sub) => path.join(root, sub)),
    ...PARTITION_ROOT_FILES.map((file) => path.join(root, file)),
  ])
  removePath(root)

  if (fs.existsSync(root)) {
    // 目录还被句柄占着（或刚被 Chromium 重建），但数据已经清空。
    // 只有「确实清空过」的目录才能进这个名单，下次启动才敢直接删。
    logger.info('[Store] 分区数据已清空，目录空壳留待下次启动回收:', root)
    prunedThisRun.add(name)
  }
}

/** 启动时删掉已经清空数据的空壳目录。 */
export function sweepPrunedPartitions(): number {
  const dir = path.join(app.getPath('userData'), 'Partitions')
  const names = readState().prunedPartitions ?? []
  if (names.length === 0) return 0

  const remaining: string[] = []
  let removed = 0

  for (const name of names) {
    const target = path.join(dir, name)
    if (!fs.existsSync(target)) {
      removed += 1
      continue
    }
    if (rmWithRetry(target)) removed += 1
    else remaining.push(name)
  }

  if (removed > 0) logger.info('[Store] 已回收上次清空的会话目录:', removed, '个')
  if (remaining.length !== names.length) updateState({ prunedPartitions: remaining })
  return removed
}

/**
 * 删除一批路径，失败最多重试三次。
 *
 * 分区目录可能一直被 Session 占用（EPERM），这一层删除本来就是「顺手回收磁盘」
 * 的性质：数据在 clearStorageData 后已经清空，删不掉不该让整个清理流程失败，
 * 所以只返回成败，由调用方决定要不要记进 prunedPartitions。
 */
function removePath(target: string, children: string[] = []): boolean {
  let ok = true
  for (const child of children) if (!rmWithRetry(child)) ok = false
  if (!fs.existsSync(target)) return ok
  return rmWithRetry(target) && ok
}

function rmWithRetry(target: string): boolean {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return true
    } catch {
      if (attempt === 2) return false
      // 同步等待一小会儿再试：句柄通常在几十毫秒内释放
      const until = Date.now() + 100
      while (Date.now() < until) {
        /* 有意为之的短阻塞重试 */
      }
    }
  }
  return false
}

/** 当前可以清理的分区数，用于在标签管理里给出按钮文案 */
export function countOrphanSessions(): number {
  return diagnosticOrphans().orphans.length
}

/**
 * 会话残留的诊断详情：真实存在的分区目录、当前引用的分区、以及二者之差。
 *
 * 「清理会话残留（0）」这种事没法从界面看出是「确实没有残留」还是
 * 「扫描逻辑没找到目录」，所以这里把中间结果一并暴露出来，便于排查。
 */
export function diagnosticOrphans(): SessionDiagnostics {
  const active = activePartitions()
  const existing = listExistingPartitions()
  const remembered = readState().usedPartitions ?? []
  const names = new Set([...existing, ...remembered])
  const orphans = [...names].filter((name) => !active.has(name))
  return {
    userData: app.getPath('userData'),
    active: [...active],
    existing,
    remembered,
    orphans,
  }
}
