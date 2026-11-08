#!/usr/bin/env node
/**
 * 仓级文档门禁薄入口（D-6 后半 / 任务 7.1）。
 *
 * 检查实现只有一处：`scripts/lib/doc-checks.mjs`（内核）。本文件与
 * `plugins/multi-root-workspace/scripts/check-docs.mjs` 同构——只做三件事：
 * 构造 `REPO_CONFIG`、接线运行时自检、把错误计数转成退出码；不打印、不持逻辑
 * （打印层与计数归内核，D-B3）。
 *
 * 退出码（与 `scripts/dsh-check.mjs` 同约定）：
 * - `0`：自检通过且全部检查无 error；
 * - `1`：自检失败，或检查发现 error（含归档域之外的预期红项，首轮清偿见 G8）；
 * - `2`：用法错误或配置错误（配置非法由内核抛 `TypeError`，捕获后打印原因）。
 *
 * 配置口径（code-design ③.2 现行示例 + ④ G7 要点）：
 * - 检查集合 = ③.1 表中仓级入口为「开」的 9 项；双语三项（`readme-pairs` /
 *   `agent-note-pairs` / `readme-navigation`）已随单语化退役，不启用（内核实现保留）；
 * - 七包全部纳入 `readme-skeleton` / `evidence-location` 取包面：`pluginPackages.exclude`
 *   为空集（R5 轮 5 裁定⑤），扫描子树排除不使骨架检查缩水；
 * - `scan.excludePaths` 排 `plugins/multi-root-workspace`（D-B2：该子树归其包内入口，
 *   避免同一文件被两个入口按各自规则重判）；
 * - `scan.noScanPaths` 排 `openspec/changes`（R8：裸 ADR/绝对路径等检查的排除口径；
 *   链接检查不受它影响，仍覆盖 openspec 面）与 `plugins/<包>/artifacts/`（D-B5：证据域
 *   豁免绝对路径检查，链接仍受检）；
 * - `scan.linkWarningPaths` 排 `openspec/changes/archive/`（D-7：归档内断链降 warning、
 *   不阻塞）；
 * - `exemptions.bareAdrRefs` 豁免两份规则自述文件（D-B6：`AGENTS.md`、
 *   `docs/decisions/README.md` 的成文纪律本身就在讲「怎么引用 ADR」）；
 * - `exemptions.absolutePaths` 登记 `openspec/specs/dsh-multi-root-file-references/spec.md`：该只读
 *   spec 的 Scenario 示例绝对路径（`:30` / `:44`）按 D-13（不改 spec）/ D-B5（证据域口径）豁免（任务 8.3）；
 *   另登记 `openspec/specs/dsh-plugin-toolchain/spec.md`：其「文档链接与禁项检查语义」requirement
 *   自述 `file://` 禁项时字面命中自身规则（规则自述场景），沿用同一「不改 spec」口径豁免（R10）。
 *
 * 目录排除集按 D-B17 在 multi-root 的 8 项上补 `.dsh` / `.opencode` / `.worktrees`：
 * 三者是本地生成物（`.gitignore:1-2`），不排除会造成「本地红、CI 绿」的判定分裂。
 *
 * @module scripts/check-docs
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocChecks } from './lib/doc-checks.mjs'
import { runSelfTest } from './lib/doc-checks.selftest.mjs'

/** 仓库根（`scripts/` 的上一级，按入口文件物理位置推导，不用环境变量）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 命令用法（`--help` / `-h` 直接退出 0，未知参数退出 2）。 */
const USAGE = `用法：
  node scripts/check-docs.mjs          # 仓级文档检查（共享内核 + 双入口之仓级入口）
  node scripts/check-docs.mjs --help   # 显示本帮助`

/**
 * 仓级配置（`DocCheckConfig`，形状见 `scripts/lib/doc-checks.d.mts`）。
 *
 * `checks` 是显式开启制：内核缺省不跑未列出的检查，防止新检查静默扩散；
 * `rules` 只给启用项所需的判据常量（内核 fail-closed：启用某检查而缺规则即配置错误）。
 */
const REPO_CONFIG = {
  root: REPO_ROOT,
  label: 'repo',
  checks: {
    // ③.1 表中仓级入口为「开」的 9 项；双语三项已退役（D-2 / 任务 4.7）。
    'wrong-english-suffix': true,
    'markdown-links': true,
    'absolute-paths': true,
    'adr-names': true,
    'empty-documents': true,
    'readme-skeleton': true,
    'adr-skeleton': true,
    'evidence-location': true,
    'bare-adr-ref': true,
  },
  scan: {
    markdownRoots: ['README.md', 'AGENTS.md', 'docs', 'tooling', 'templates', 'plugins', 'openspec'],
    excludeDirs: [
      '.git',
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.next',
      'out',
      '.dsh',
      '.opencode',
      '.worktrees',
      '.dsh-smoke',
    ],
    excludePaths: ['plugins/multi-root-workspace'],
    linkWarningPaths: ['openspec/changes/archive/'],
    noScanPaths: ['openspec/changes', 'plugins/*/artifacts/'],
  },
  dirs: {
    // 仓根只有 docs/decisions 一个目录角色；.agent/note 与 docs/plans 不在仓级面
    // （对应检查未启用，内核不要求配置）。
    decisions: 'docs/decisions',
  },
  rules: {
    adrNamePattern: /^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
    wrongEnglishSuffix: /(_en|\.eng|\.english|-en)\.md$/i,
    adrRequiredSections: [
      'Status',
      'Date',
      'Context',
      'Decision',
      'Alternatives Considered',
      'Consequences',
      'Related Documents',
    ],
    readmeRequiredSections: ['定位', '安装到 profile', '构建与测试', '许可'],
    readmeOptionalSections: ['配置', '双端结构', '已知限制', '排障', '非目标', '与其他插件的关系'],
    readmeEndness: {
      line: /^端性[：:]\s*(host-only|双端)$/,
      values: ['host-only', '双端'],
      dualSection: '双端结构',
    },
    evidenceSectionPattern: /^(验证证据|冒烟记录|验收记录|真机验证)$/,
    evidenceLinePattern: /^验证证据：\[[^\]]+\]\((?:\.\.\/)?artifacts\/[^)]+\.md\)——结论：.+$/,
    evidenceDirName: 'artifacts',
    // 七包统一（R5）：exclude 空集；multi-root 骨架由 G5.5 施工后同样受检。
    pluginPackages: { dir: 'plugins', exclude: [] },
  },
  exemptions: {
    // 子串匹配（沿用 multi-root 旧脚本 :181 语义）；证据域由 noScanPaths 覆盖，
    // 不在此登记（路径 pattern 无法用子串表达）。
    absolutePaths: [
      // 只读 spec 的 Scenario 示例绝对路径（`:30` / `:44`）：D-13 / D-B5 口径，
      // 按文件路径子串登记——命中整份 spec，其他文件的绝对路径判定不受影响。
      'openspec/specs/dsh-multi-root-file-references/spec.md',
      // 该 spec 的「文档链接与禁项检查语义」requirement 自述 file:// 禁项本身，字面命中
      // 自身规则（规则自述场景）；D-13「不改 spec」口径同上（R10 收尾，2026-11-08）。
      'openspec/specs/dsh-plugin-toolchain/spec.md',
    ],
    // 精确相对路径（D-B6）。
    bareAdrRefs: ['AGENTS.md', 'docs/decisions/README.md'],
  },
}

const argv = process.argv.slice(2)
if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
  console.log(USAGE)
  process.exit(0)
}
if (argv.length > 0) {
  console.error(`[docs:check] 无法识别的参数：${argv.join(' ')}\n\n${USAGE}`)
  process.exit(2)
}

// 运行时自检（R12/R13）：静默模式，通过时零输出；失败时 selftest 打印诊断并 exit 1。
if (!runSelfTest({ quiet: true })) process.exit(1)

try {
  const { errors } = runDocChecks(REPO_CONFIG)
  process.exitCode = errors > 0 ? 1 : 0
} catch (error) {
  // 内核配置非法一律抛 TypeError（fail-closed）：映射 exit 2 并打印中文原因。
  if (!(error instanceof TypeError)) throw error
  console.error(`[docs:check] 配置错误：${error.message}`)
  process.exitCode = 2
}
