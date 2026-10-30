#!/usr/bin/env node
/**
 * 兼容 shim：升级引擎已上移到仓库根 `scripts/upgrade-dsh.mjs`。
 *
 * 保留这个路径是因为多根插件自己的文档/脚本历史上引用它；真正的实现、
 * 基线常量与探测 overrides 都在根级统一维护。新用法：
 *
 * ```bash
 * pnpm dsh:upgrade 0.2.1-rc.2 --probe
 * ```
 *
 * @module scripts/upgrade-dsh
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
console.warn('[upgrade] 已弃用：请使用仓库根 `pnpm dsh:upgrade`；本脚本仅委托执行。')

const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'upgrade-dsh.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
