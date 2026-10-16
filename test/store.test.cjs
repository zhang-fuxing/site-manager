/**
 * 数据层自检（npm run test）。
 *
 * 为什么不是普通的 Node 测试：store.ts 依赖 electron 的 app / session，
 * 必须在 Electron 运行时里跑。所以这里由 electron 启动本文件，断言结果写到
 * test/report.txt —— Windows 下 Electron 是无控制台进程，stdout 不可靠。
 *
 * 覆盖的都是「改错了很难从界面看出来」的行为：
 *   - 旧配置（v1 裸数组 / v2 无分区字段）迁移到 v3，且不打断既有登录态
 *   - 非法地址、重复 id、残缺条目、损坏 JSON 的处理
 *   - 独立会话的分区必须逐站点唯一（默认站点不再共用一个 Cookie Jar）
 *   - usedPartitions / prunedPartitions 的登记与清理的一致性
 *   - 会话残留清理：真的写一条 Cookie，验证它被清掉，且不碰无关目录
 *
 * 本文件会重写工作目录下的 config/sites.json，因此跑之前会先把原文件备份到
 * config/sites.json.bak，结束后（无论成败）恢复。
 */
const fs = require('fs')
const path = require('path')
const { app, session } = require('electron')

const root = process.cwd()
const configDir = path.join(root, 'config')
const stateFile = path.join(configDir, 'sites.json')
const backupFile = path.join(configDir, 'sites.json.bak')
const reportFile = path.join(root, 'test', 'report.txt')

const results = []
let traceStream = null

function trace(message) {
  if (traceStream) traceStream.write(`${new Date().toISOString()} ${message}\n`)
}

function check(name, pass, extra) {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? `  :: ${extra}` : ''}`)
}

/** 删除测试留下的目录；被句柄占用时静默放过（见文件末尾的说明） */
function tryRemove(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch (err) {
    trace(`收尾删除失败（可忽略）: ${target} ${err && err.code ? err.code : err}`)
  }
}

function finish(code) {
  const failed = results.filter((line) => line.startsWith('FAIL')).length
  const report = [
    ...results,
    '',
    `${results.length - failed}/${results.length} passed`,
    failed === 0 ? 'RESULT: OK' : `RESULT: ${failed} FAILED`,
  ].join('\n')
  try {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true })
    fs.writeFileSync(reportFile, report, 'utf-8')
  } catch (err) {
    trace(`写报告失败: ${err}`)
  }

  // 先恢复用户原来的配置再退出：app.exit() 会立即结束进程，
  // 放在 Promise 的 finally 里根本来不及执行。
  restoreBackup()

  if (traceStream) traceStream.end()
  app.exit(code)
}

/** 自检会改写 config/sites.json，结束前必须还原 */
function restoreBackup() {
  try {
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, stateFile)
      fs.rmSync(backupFile, { force: true })
    }
  } catch (err) {
    trace(`恢复配置失败: ${err}`)
  }
}

// 只允许在项目根目录跑：这个脚本会覆盖 config/sites.json
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'electron', 'store.ts'))) {
  console.error('请在项目根目录运行 npm run test')
  process.exit(2)
}

async function main() {
  fs.mkdirSync(path.join(root, 'test'), { recursive: true })
  traceStream = fs.createWriteStream(path.join(root, 'test', 'trace.txt'), { flags: 'w' })
  process.on('uncaughtException', (err) => trace(`UNCAUGHT ${err && err.stack ? err.stack : err}`))
  process.on('unhandledRejection', (err) => trace(`UNHANDLED ${err && err.stack ? err.stack : err}`))

  if (fs.existsSync(stateFile)) fs.copyFileSync(stateFile, backupFile)
  trace('已备份原配置')

  await app.whenReady()
  trace('app ready')

  const store = require('../dist-electron/test-entry.cjs')
  const {
    readState,
    updateState,
    flushState,
    clearOrphanSessions,
    countOrphanSessions,
    activePartitions,
    diagnosticOrphans,
    resolvePersistPartition,
    createDefaultState,
  } = store

  /** 写配置并丢掉内存缓存，模拟「应用重新启动后读盘」 */
  function writeConfig(value) {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      stateFile,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      'utf-8',
    )
    store.resetStateCache()
  }

  // -------------------------------------------------- 1. v1 裸数组迁移
  writeConfig([
    { id: 'a', name: 'A', url: 'https://a.example.com' },
    { id: 'b', name: 'B', url: 'https://b.example.com', partitionKey: 'AI' },
    { id: 'c', name: 'C', url: 'https://c.example.com', visible: false },
    { id: 'd', name: 'D', url: 'javascript:alert(1)' },
    { id: 'e', name: 'E', url: 'file:///C:/secret.txt' },
    { id: 'f', name: 'F' },
    { id: 'b', name: 'B 重复', url: 'https://b.example.com' },
  ])
  let state = readState()
  check('v1 裸数组迁移到 v3', state.version === 3, `version=${state.version}`)
  check('丢掉非法 url、残缺条目与重复 id', state.sites.length === 3, `len=${state.sites.length}`)
  check(
    '没有分区字段的站点推断为独立会话',
    state.sites.find((s) => s.id === 'a')?.partitionMode === 'isolated',
  )
  check(
    '有组名的旧站点保留为共享组（登录态不丢）',
    state.sites.find((s) => s.id === 'b')?.partitionMode === 'group' &&
      state.sites.find((s) => s.id === 'b')?.partitionKey === 'AI',
  )
  check('visible:false 保留', state.sites.find((s) => s.id === 'c')?.visible === false)
  check('javascript: 地址被拒绝', !state.sites.some((s) => s.url.startsWith('javascript')))
  check('file: 地址被拒绝', !state.sites.some((s) => s.url.startsWith('file:')))
  check(
    '迁移时把历史组名记进 usedPartitions（否则旧会话永远清不掉）',
    state.usedPartitions.includes('AI'),
    JSON.stringify(state.usedPartitions),
  )

  // -------------------------------------------------- 2. 独立会话必须逐站点唯一
  const defaults = createDefaultState()
  const partitions = defaults.sites.map((site) => resolvePersistPartition(site))
  check(
    '默认站点两两不同分区（不再共用一个 Cookie Jar）',
    new Set(partitions).size === partitions.length,
    partitions.join(','),
  )
  check('默认站点全部为独立会话', defaults.sites.every((s) => s.partitionMode === 'isolated'))
  check(
    '独立会话分区带 isolated- 前缀（不会与组名撞名）',
    partitions.every((name) => name.startsWith('isolated-')),
    partitions[0],
  )

  // 站点 id 恰好等于组名时的老写法的对照：两种情况必须落到不同分区
  const asIsolated = resolvePersistPartition({ id: 'zhihu', name: 'x', url: 'https://x.com' })
  const asGroup = resolvePersistPartition({
    id: 'other',
    name: 'y',
    url: 'https://y.com',
    partitionKey: 'zhihu',
  })
  check('站点 id 与组名同名时不会共用会话', asIsolated !== asGroup, `${asIsolated} vs ${asGroup}`)

  // -------------------------------------------------- 3. activeSiteId 兜底与损坏配置
  writeConfig({
    version: 2,
    sites: [
      { id: 'x', name: 'X', url: 'https://x.example.com', visible: false },
      { id: 'y', name: 'Y', url: 'https://y.example.com' },
    ],
    activeSiteId: 'x',
  })
  check('activeSiteId 指向存在的站点时保留（隐藏也保留）', readState().activeSiteId === 'x')

  writeConfig({
    version: 2,
    sites: [{ id: 'y', name: 'Y', url: 'https://y.example.com' }],
    activeSiteId: '已删除',
  })
  check('activeSiteId 指向已删除站点时回退到首个站点', readState().activeSiteId === 'y')

  writeConfig('{ 这不是 JSON')
  check('配置损坏时回退到默认站点且不抛错', readState().sites.length === 7, `len=${readState().sites.length}`)

  // -------------------------------------------------- 4. 分区登记
  writeConfig({ version: 3, sites: [], activeSiteId: null, usedPartitions: [] })
  updateState({
    sites: [
      { id: 'y', name: 'Y', url: 'https://y.example.com', partitionMode: 'isolated' },
      { id: 'z', name: 'Z', url: 'https://z.example.com', partitionMode: 'group', partitionKey: 'zhihu' },
    ],
  })
  check(
    '保存站点后 usedPartitions 收录新分区',
    readState().usedPartitions.includes('isolated-y') && readState().usedPartitions.includes('zhihu'),
    JSON.stringify(readState().usedPartitions),
  )
  check('activePartitions 只反映当前引用', activePartitions().has('zhihu') && !activePartitions().has('AI'))

  // 删一个、加一个：长度不变但集合变了，必须仍然登记新分区
  updateState({
    sites: [
      { id: 'z', name: 'Z', url: 'https://z.example.com', partitionMode: 'group', partitionKey: 'zhihu' },
      { id: 'w', name: 'W', url: 'https://w.example.com', partitionMode: 'isolated' },
    ],
  })
  check(
    '替换站点后新分区仍被登记（长度不变的场景）',
    readState().usedPartitions.includes('isolated-w'),
    JSON.stringify(readState().usedPartitions),
  )

  // -------------------------------------------------- 5. 会话残留清理
  const partitionsDir = path.join(app.getPath('userData'), 'Partitions')
  const orphanDir = path.join(partitionsDir, 'isolated-ghost')
  const foreignDir = path.join(partitionsDir, 'someone-elses-app')
  fs.rmSync(orphanDir, { recursive: true, force: true })
  fs.mkdirSync(orphanDir, { recursive: true })
  fs.writeFileSync(path.join(orphanDir, 'marker.txt'), 'cookie-jar', 'utf-8')
  fs.mkdirSync(foreignDir, { recursive: true })

  updateState({
    usedPartitions: [...readState().usedPartitions, 'isolated-ghost', 'vanished-partition'],
  })
  flushState()

  // 往幽灵分区里真的写一条 Cookie：清理的意义就是删掉这些数据
  const ghost = session.fromPartition('persist:isolated-ghost')
  await ghost.cookies.set({
    url: 'https://ghost.example.com',
    name: 'secret',
    value: 'should-be-gone',
  })
  const seeded = (await ghost.cookies.get({ name: 'secret' })).length
  check('幽灵分区里确实写入了 Cookie', seeded === 1, `count=${seeded}`)

  const diagBefore = diagnosticOrphans()
  check(
    '诊断能列出可清理项',
    diagBefore.orphans.includes('isolated-ghost') && diagBefore.orphans.includes('vanished-partition'),
    JSON.stringify(diagBefore.orphans),
  )
  check('诊断能列出正在使用的分区', diagBefore.active.includes('zhihu') && diagBefore.active.includes('isolated-w'))

  const result = await clearOrphanSessions()
  flushState()
  check('清理结果包含真实存在的孤儿分区', result.partitions.includes('isolated-ghost'), JSON.stringify(result))
  check('记录里已消失的分区也被忘掉', result.partitions.includes('vanished-partition'))
  check('仍被引用的分区不会被清理', activePartitions().has('zhihu') && activePartitions().has('isolated-w'))
  check('不相关的分区目录不受影响', fs.existsSync(foreignDir))

  const left = (await ghost.cookies.get({ name: 'secret' })).length
  check('幽灵分区的 Cookie 已被真实清空', left === 0, `count=${left}`)

  check('清理后不再有残留', countOrphanSessions() === 0, `count=${countOrphanSessions()}`)
  check(
    '数据已清空但目录删不掉时，会记进 prunedPartitions 待下次启动回收',
    fs.existsSync(orphanDir) ? (readState().prunedPartitions ?? []).includes('isolated-ghost') : true,
    JSON.stringify(readState().prunedPartitions),
  )
  check(
    'config 里不再记录已清理的分区',
    !readState().usedPartitions.includes('isolated-ghost'),
    JSON.stringify(readState().usedPartitions),
  )

  // 收尾：本进程仍持有该分区的 Session，Windows 下这个目录可能删不掉（EPERM），
  // 这本身就是被测行为之一，删不掉不算失败——残留由应用下次启动时回收。
  tryRemove(foreignDir)
  tryRemove(orphanDir)
}

main()
  .then(() => {
    const failed = results.filter((line) => line.startsWith('FAIL')).length
    finish(failed === 0 ? 0 : 1)
  })
  .catch((err) => {
    trace(`FATAL ${err && err.stack ? err.stack : err}`)
    check('自检过程未抛异常', false, String(err && err.message ? err.message : err))
    finish(1)
  })
