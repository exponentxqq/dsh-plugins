#!/usr/bin/env node
// 薄入口（D.check-docs）：检查实现在仓根 `scripts/lib/doc-checks.mjs`（唯一实现，防双写漂移），
// 规则正文在 `.agent/skills/documentation/SKILL.md`；本文件只声明本包配置并把错误计数转成 exit code。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocChecks } from '../../../scripts/lib/doc-checks.mjs'
import { runSelfTest } from '../../../scripts/lib/doc-checks.selftest.mjs'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 本包配置：扫描根 = 包根；7 项：双语三项已随单语化退役（ADR-0014 / 任务 4.7），内核实现保留、本包不启用。 */
const PKG_CONFIG = {
  root: PKG_ROOT,
  label: 'multi-root',
  checks: {
    'wrong-english-suffix': true,
    'markdown-links': true,
    'absolute-paths': true,
    'agent-note-filenames': true,
    'plan-conflicts': true,
    'adr-names': true,
    'empty-documents': true,
  },
  scan: {
    markdownRoots: ['.'],
    excludeDirs: ['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'out', '.dsh-smoke'],
    excludePaths: [], linkWarningPaths: [], noScanPaths: [],
  },
  dirs: {
    agentNote: '.agent/note', plansActive: 'docs/plans/active',
    plansCompleted: 'docs/plans/completed', decisions: 'docs/decisions',
  },
  rules: {
    adrNamePattern: /^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
    scratchpadNamePattern: /^(temp|tmp|draft\d*|test\d*|new|final\d*|notes\d+|scratch|scratchpad)\.md$/i,
    wrongEnglishSuffix: /(_en|\.eng|\.english|-en)\.md$/i,
  },
  exemptions: { absolutePaths: [], bareAdrRefs: [] },
}

if (!runSelfTest({ quiet: true })) process.exit(1) // 自检静默接线（R12）：通过时零输出保 parity，失败时打印并 exit 1
const { errors } = runDocChecks(PKG_CONFIG)
process.exitCode = errors > 0 ? 1 : 0
