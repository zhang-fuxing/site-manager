/**
 * 自检启动器：用项目自带的 Electron 跑 test/store.test.cjs，并回显报告。
 *
 * Windows 下的 Electron 是无控制台进程，主进程的 stdout 取不到，
 * 所以测试把结果写进 test/report.txt，由这里读出来打印、并透传退出码。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()
const reportFile = path.join(root, 'test', 'report.txt')
const traceFile = path.join(root, 'test', 'trace.txt')

let electronPath
try {
  electronPath = require('electron')
} catch {
  console.error('未能定位 Electron，请先执行 npm install')
  process.exit(2)
}

// ELECTRON_RUN_AS_NODE 会让 electron 以纯 Node 身份启动，app.whenReady() 永远不触发
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(electronPath, [path.join('test', 'store.test.cjs')], {
  cwd: root,
  env,
  stdio: 'inherit',
})

const report = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf-8').trim() : ''
if (report) console.log(`\n${report}\n`)
else console.error('\n未生成测试报告，请查看 test/trace.txt\n')

if (result.status !== 0 || report.includes('RESULT: OK') === false) {
  if (fs.existsSync(traceFile)) console.error(fs.readFileSync(traceFile, 'utf-8').trim())
  process.exit(1)
}
