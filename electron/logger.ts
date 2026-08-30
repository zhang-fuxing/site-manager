import path from 'path'
import log from 'electron-log'
import { app } from 'electron'

// 1. 配置日志级别与文件大小限制
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB

// 2. 指定日志输出路径到项目根目录的 logs 文件夹下
log.transports.file.resolvePathFn = () => {
const baseDir = app.isPackaged 
    ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath))
    : process.cwd()
  return path.join(baseDir, 'logs', 'main.log')
}
// 3. 封装日志工具对象，提供统一调用 API
export const logger = {
  info: (...args: any[]) => log.info(...args),
  warn: (...args: any[]) => log.warn(...args),
  error: (...args: any[]) => log.error(...args),
  getFilePath: () => log.transports.file.getFile().path,
}

// 打印日志系统初始化信息
logger.info('日志系统初始化完成，日志文件保存路径:', logger.getFilePath())