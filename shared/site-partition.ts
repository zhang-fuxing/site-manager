import type { Site } from './types'

/**
 * 站点登录隔离组的解析规则。
 *
 * 主进程用它决定 WebContentsView 挂哪个 Session（见 electron/view-manager.ts），
 * 渲染进程用它渲染隔离组标签、给表单做校验，两侧必须共用同一套规则，
 * 否则界面显示的隔离关系和实际会话归属会对不上。
 *
 * 这里刻意不依赖 electron / node，纯字符串运算，渲染进程也能安全引入。
 */

/** 共享「登录隔离组」时，组名只允许这些字符：它最终会进入 persist: 分区名 */
const GROUP_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * 独立隔离的站点都用这个前缀，避免和历史配置里「没有 partitionKey 时直接拿 id 当分区」
 * 的写法撞名：那种写法下站点 id 恰好等于某个组名时会意外共享会话。
 */
const ISOLATED_PREFIX = 'isolated-'

/**
 * 历史上被当作默认值写进配置、但实际上会让多个**不同站点**共用一个
 * Cookie Jar 的组名。AI 站点之间共享会话没有任何合理场景，
 * 单独列出来是为了让「检查隔离组」能识别出这类历史遗留配置。
 */
export const LEGACY_BUILTIN_GROUPS = ['AI'] as const

export function isValidGroupKey(value: string): boolean {
  return GROUP_KEY_PATTERN.test(value)
}

/**
 * 把一个任意输入整理成可用的组名：去掉首尾空白与非法字符。
 * 非法字符转成下划线而不是直接判错，用户输入「我的 组」时也能顺手得到合法的组名。
 */
export function normalizeGroupKey(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

/** 该站点是否为「独立隔离」。老配置没有这个字段，按有无组名推断 */
export function resolvePartitionMode(site: Site): 'isolated' | 'group' {
  return site.partitionMode === 'group' || !!site.partitionKey?.trim() ? 'group' : 'isolated'
}

/** 站点最终使用的 persist 分区名 */
export function resolvePersistPartition(site: Site): string {
  if (resolvePartitionMode(site) === 'group') {
    // 组名先归一化，保证界面显示的分区名和真正生效的分区名完全一致
    const key = normalizeGroupKey(site.partitionKey ?? '')
    if (key) return key
  }
  return `${ISOLATED_PREFIX}${site.id}`
}

/**
 * 判断某个分区名是否属于本应用。
 *
 * 会话清理时用来过滤无关目录：组名是用户自己起的，没法从目录名反推站点，
 * 但独立隔离的分区一定带前缀，主窗口自身的分区固定叫 main。
 */
export function isAppPartition(name: string): boolean {
  return name === 'main' || name.startsWith(ISOLATED_PREFIX)
}

/** 独立隔离的站点不显示组名；共享隔离的站点显示组名 */
export function describePartition(site: Site): string {
  if (resolvePartitionMode(site) === 'isolated') return '独立'
  return normalizeGroupKey(site.partitionKey ?? '') || site.id
}

/** 判断是否为会让不同站点共用一个会话的历史遗留组 */
export function isLegacyBuiltinGroup(site: Site): boolean {
  if (resolvePartitionMode(site) !== 'group') return false
  const key = site.partitionKey?.trim()
  return !!key && (LEGACY_BUILTIN_GROUPS as readonly string[]).includes(key)
}

/** 站点地址只允许 http/https：主进程 loadURL 之前用它兜底校验 */
export function isAllowedSiteUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
