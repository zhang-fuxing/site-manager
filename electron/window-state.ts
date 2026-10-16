import fs from 'fs'
import path from 'path'
import { screen } from 'electron'
import { logger } from './logger'
import { readJsonFile, resolveDataFile } from './store'
import type { BrowserWindow } from 'electron'
import type { WindowBounds } from '../shared/types'

/**
 * 窗口尺寸与位置的留存。
 *
 * 单独放一个文件，不和 config/sites.json 混在一起：站点配置是用户数据，
 * 窗口几何只是本机界面状态，两者损坏时的回退策略也完全不同。
 */

const MIN_WIDTH = 900
const MIN_HEIGHT = 600
const DEFAULT_BOUNDS: Required<Pick<WindowBounds, 'width' | 'height'>> = {
  width: 1280,
  height: 840,
}

/** 记录几何变化的防抖，拖拽窗口时会连续触发 resize / move */
const SAVE_DEBOUNCE_MS = 400

function getBoundsFile(): string {
  return resolveDataFile('config', 'window-state.json')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 判断保存的位置是否还落在某块屏幕里。
 * 外接显示器拔掉之后，原来保存的坐标可能完全在屏幕之外，那样窗口会「打开就看不见」。
 */
function isOnSomeDisplay(bounds: WindowBounds): boolean {
  if (!isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) return false
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x! < area.x + area.width &&
      bounds.x! + bounds.width > area.x &&
      bounds.y! < area.y + area.height &&
      bounds.y! + bounds.height > area.y
    )
  })
}

/** 读上一次的窗口几何；任何不可信的字段都会被丢掉而不是硬套 */
export function readWindowBounds(): WindowBounds {
  const raw = readJsonFile<WindowBounds>(getBoundsFile())
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BOUNDS }

  const bounds: WindowBounds = {
    width: isFiniteNumber(raw.width) ? Math.max(MIN_WIDTH, Math.round(raw.width)) : DEFAULT_BOUNDS.width,
    height: isFiniteNumber(raw.height)
      ? Math.max(MIN_HEIGHT, Math.round(raw.height))
      : DEFAULT_BOUNDS.height,
    maximized: raw.maximized === true,
  }

  if (isFiniteNumber(raw.x) && isFiniteNumber(raw.y) && isOnSomeDisplay({ ...bounds, x: raw.x, y: raw.y })) {
    bounds.x = Math.round(raw.x)
    bounds.y = Math.round(raw.y)
  }

  return bounds
}

function writeWindowBounds(bounds: WindowBounds): void {
  const file = getBoundsFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(bounds, null, 2), 'utf-8')
  } catch (err) {
    logger.error('[WindowState] 写入窗口状态失败:', err)
  }
}

/**
 * 挂上几何跟踪：最大化时记状态、普通状态记尺寸。
 *
 * 用 getNormalBounds() 取「还原后」的尺寸，否则在最大化状态下退出会把
 * 屏幕大小写进配置，下次还原时窗口就占满整屏。
 */
export function trackWindowBounds(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const capture = (): WindowBounds => {
    const normal = win.getNormalBounds()
    return {
      width: normal.width,
      height: normal.height,
      x: normal.x,
      y: normal.y,
      maximized: win.isMaximized(),
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (!win.isDestroyed()) writeWindowBounds(capture())
    }, SAVE_DEBOUNCE_MS)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    // 关闭时立即落盘，来不及等防抖
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!win.isDestroyed()) writeWindowBounds(capture())
  })
}

/**
 * 保存渲染进程上报的窗口几何。
 *
 * 主进程已经通过 trackWindowBounds 自动跟踪，这条 IPC 只是为了在
 * 渲染进程主动改窗口（例如「重置窗口大小」）后能立刻生效，
 * 因此同样要按白名单校验，不能直接信任渲染进程传来的数字。
 */
export function saveWindowBounds(bounds: WindowBounds, win?: BrowserWindow | null): void {
  if (!bounds || typeof bounds !== 'object') return
  if (!isFiniteNumber(bounds.width) || !isFiniteNumber(bounds.height)) return

  const next: WindowBounds = {
    width: Math.max(MIN_WIDTH, Math.round(bounds.width)),
    height: Math.max(MIN_HEIGHT, Math.round(bounds.height)),
    maximized: win ? win.isMaximized() : bounds.maximized === true,
  }

  if (isFiniteNumber(bounds.x) && isFiniteNumber(bounds.y)) {
    next.x = Math.round(bounds.x)
    next.y = Math.round(bounds.y)
  }

  writeWindowBounds(next)
}
