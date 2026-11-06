#!/usr/bin/env node
/**
 * dsh:check 聚合入口（R6）。
 *
 * 顺序 spawn 三个检查脚本，任一非 0 即整体非 0：
 *
 * 1. `check-dsh-baseline.mjs` —— DSH 基线 / catalog / 安装树 / 发布年龄豁免；
 * 2. `check-architecture.mjs` —— 结构不变式（AR1–AR7，G7 8.1 全量开启）；
 * 3. `check-artifacts.mjs`    —— 产物契约（B1–B5，`--baseline` 模式下可比对模块词）。
 *
 * 三个脚本各自「收集全部失败再退出」的输出纪律不变：聚合器按顺序跑完全部三组，
 * 不截断子进程输出，也不在第一个失败处停下——这样一次运行能看见全部问题。
 * release 与 CI 都必须经过本入口，避免发布路径绕过结构门禁或产物门禁。
 *
 * 退出码：0 三组全过；1 至少一组失败；2 用法错误。
 *
 * @module scripts/dsh-check
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（`scripts/` 的上一级）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 依次执行的检查脚本（数组顺序即执行顺序，也是失败汇总的顺序）。 */
const CHECKS = [
  { file: 'check-dsh-baseline.mjs', label: 'DSH 基线' },
  { file: 'check-architecture.mjs', label: '结构不变式' },
  { file: 'check-artifacts.mjs', label: '产物契约' },
]

/** 命令用法。 */
const USAGE = `用法：
  node scripts/dsh-check.mjs    # 顺序运行 DSH 基线 / 结构不变式 / 产物契约三组门禁`

const argv = process.argv.slice(2)
if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
  console.log(USAGE)
  process.exit(0)
}
if (argv.length > 0) {
  console.error(`[dsh:check] 无法识别的参数：${argv.join(' ')}\n\n${USAGE}`)
  process.exit(2)
}

const results = []
for (const [index, check] of CHECKS.entries()) {
  const file = join(REPO_ROOT, 'scripts', check.file)
  process.stdout.write(`\n[dsh:check] ${index + 1}/${CHECKS.length} 运行 ${check.file}（${check.label}）\n`)
  const startedAt = Date.now()
  let status = 0
  try {
    execFileSync(process.execPath, [file], { cwd: REPO_ROOT, stdio: 'inherit' })
  } catch (error) {
    // 子脚本自身以 1 表示断言失败、2 表示用法错误；起不来（ENOENT 等）按 1 处理。
    status = typeof error?.status === 'number' ? error.status : 1
  }
  const elapsedMs = Date.now() - startedAt
  results.push({ ...check, status, elapsedMs })
  const verdict = status === 0 ? '通过' : `失败（exit ${status}）`
  process.stdout.write(`[dsh:check] ${check.file} ${verdict}，${elapsedMs}ms\n`)
}

const failed = results.filter((result) => result.status !== 0)
if (failed.length > 0) {
  console.error(`\n[dsh:check] ${results.length - failed.length}/${results.length} 组通过，${failed.length} 组失败：\n`)
  for (const result of failed) {
    console.error(`  - ${result.file}（${result.label}，exit ${result.status}）`)
  }
  console.error('\n修好上面各组报出的失败项后重试。\n')
  process.exit(1)
}

process.stdout.write(`\n[dsh:check] ${CHECKS.length} 组门禁全部通过\n`)
