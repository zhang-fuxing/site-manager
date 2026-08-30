import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from './logger'

export interface Site {
  id: string
  name: string
  url: string
  partitionKey?: string
}

// 获取当前 .exe 可执行文件所在的根目录（开发环境下为项目根目录）
const getExecutableDir = () => {
  if (app.isPackaged) {
    // 打包后：返回 .exe 所在的真实文件夹目录
    return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
  }
  // 开发环境：返回项目根目录
  return process.cwd()
}

// 定义保存目录与 JSON 文件路径
function getPaths() {
  const baseDir = getExecutableDir()
  const configDir = path.join(baseDir, 'config')
  const filePath = path.join(configDir, 'sites.json')
  return { configDir, filePath }
}
// 初始化默认数据
const DEFAULT_SITES: Site[] = [
  { id: '1', name: 'DeepSeek', url: 'https://chat.deepseek.com/', partitionKey: 'group_a' },
  { id: '2', name: 'GitHub', url: 'https://github.com', partitionKey: 'group_b' },
]


/**
 * 读取本地 JSON 配置文件
 */
export function readSitesFromFile(): Site[] {
  const { filePath } = getPaths()
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    logger.error('[Store 模块] 读取配置文件失败:', err)
  }
  // 文件不存在或解析失败时自动写入并返回默认值
  writeSitesToFile(DEFAULT_SITES)
  return DEFAULT_SITES
}

/**
 * 写入本地 JSON 配置文件
 */
export function writeSitesToFile(sites: Site[]): boolean {
  const { configDir, filePath } = getPaths()
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(sites, null, 2), 'utf-8')
    logger.info('[Store 模块] 成功保存配置文件至:', filePath)
    return true
  } catch (err) {
    logger.error('[Store 模块] 保存配置文件失败:', err)
    return false
  }
}