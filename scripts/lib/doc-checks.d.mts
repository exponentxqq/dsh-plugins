/**
 * `scripts/lib/doc-checks.mjs` 的类型声明（③.1 形状）。
 *
 * 共享内核是文档门禁的单一实现：multi-root 薄入口与仓级 `scripts/check-docs.mjs`
 * 都只构造 `DocCheckConfig` + 调 `runDocChecks` + 转 exit code。声明面与实现逐字
 * 对应（导出面恰为 `CHECK_IDS` / `runDocChecks`；`printResults()` 是内核内部打印层，
 * 不对外导出；`runSelfTest()` 在 `doc-checks.selftest.mjs`，不在本模块）。
 *
 * 判定语义以 `docs/decisions/ADR-0003-doc-system-layers-and-gates.md` 与
 * code-design ③.1 / ③.5 为准；本文件只声明形状，不复制规则正文。
 *
 * @module scripts/lib/doc-checks
 */

/**
 * 全部检查 id（顺序即打印顺序）。
 */
export const CHECK_IDS: readonly [
  'readme-pairs',
  'agent-note-pairs',
  'wrong-english-suffix',
  'readme-navigation',
  'markdown-links',
  'absolute-paths',
  'agent-note-filenames',
  'plan-conflicts',
  'adr-names',
  'empty-documents',
  'readme-skeleton',
  'adr-skeleton',
  'evidence-location',
  'bare-adr-ref',
]

/** 检查 id 的并集（`CHECK_IDS` 的元素类型）。 */
export type CheckId = (typeof CHECK_IDS)[number]

/** 问题项（`file` / `line` 按检查是否定位到具体位置而缺省）。 */
export interface DocCheckIssue {
  level: 'error' | 'warning'
  /** 检查显示名（`CheckResult.name`）。 */
  check: string
  message: string
  /** 相对扫描根的路径。 */
  file?: string
  /** 1 起的行号。 */
  line?: number
}

/** 单项检查结果。 */
export interface CheckResult {
  id: CheckId
  /** 显示名：旧 10 项逐字沿用 multi-root 旧脚本，4 项新增见 ③.1 表。 */
  name: string
  issues: DocCheckIssue[]
}

/** 内核运行报告（打印已由内核完成，入口只据此决定退出码）。 */
export interface DocCheckReport {
  errors: number
  warnings: number
  results: CheckResult[]
}

/** 扫描域配置。 */
export interface DocCheckScan {
  /** 相对 `root`；文件或目录，目录递归。 */
  markdownRoots: string[]
  /** 目录**名**匹配（`node_modules` / `.git` / `.dsh` / `.opencode` / `.worktrees` …）。 */
  excludeDirs: string[]
  /** 相对路径前缀，整棵子树不扫（仓级用它排除 multi-root 子树）。 */
  excludePaths: string[]
  /** 相对路径前缀：该域内断链记 warning（归档域，D-7）。 */
  linkWarningPaths: string[]
  /** 相对路径前缀：除链接检查外一律不扫（归档域，D-B4）；支持单层 `*` 段。 */
  noScanPaths: string[]
}

/** 目录角色（原 multi-root 脚本 :26-29 四常量）。 */
export interface DocCheckDirs {
  /** `.agent/note` 等；启用 `agent-note-*` 检查时必填。 */
  agentNote?: string
  /** `docs/plans/active`；启用 `plan-conflicts` 时必填。 */
  plansActive?: string
  /** `docs/plans/completed`；启用 `plan-conflicts` 时必填。 */
  plansCompleted?: string
  /** `docs/decisions`；启用 `adr-names` / `adr-skeleton` 时必填。 */
  decisions?: string
}

/** 端性声明规则（③.5 细则 3）。 */
export interface ReadmeEndnessRule {
  /** 匹配 `端性：host-only` / `端性：双端` 的声明行（捕获组 1 为取值）。 */
  line: RegExp
  values: readonly ['host-only', '双端']
  /** 双端结构节标题（声明双端时必备、host-only 时不得出现）。 */
  dualSection: string
}

/** 插件包枚举规则（readme-skeleton / evidence-location 的取包面）。 */
export interface PluginPackagesRule {
  /** 包目录名（仓级为 `plugins`）。 */
  dir: string
  /** 排除的包（目录名或 `<dir>/<name>` 相对路径）；七包统一后为空集。 */
  exclude: string[]
}

/** 检查规则（判定常量；启用某检查时其所需项必填，缺项即配置错误）。 */
export interface DocCheckRules {
  /** `^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$`。 */
  adrNamePattern: RegExp
  /** 临时文件名模式（`.agent/note/` 检查）。 */
  scratchpadNamePattern: RegExp
  /** 错拼英文后缀：`(_en|\.eng|\.english|-en)\.md$`（大小写不敏感）。 */
  wrongEnglishSuffix: RegExp
  /** `['Status', 'Date', 'Context', 'Decision', 'Alternatives Considered', 'Consequences', 'Related Documents']`。 */
  adrRequiredSections: string[]
  /** `['定位', '安装到 profile', '构建与测试', '许可']`。 */
  readmeRequiredSections: string[]
  /** `['配置', '双端结构', '已知限制', '排障', '非目标', '与其他插件的关系']`。 */
  readmeOptionalSections: string[]
  readmeEndness: ReadmeEndnessRule
  /** `^(验证证据|冒烟记录|验收记录|真机验证)$`。 */
  evidenceSectionPattern: RegExp
  /** `^验证证据：\[[^\]]+\]\((?:\.\.\/)?artifacts\/[^)]+\.md\)——结论：.+$`。 */
  evidenceLinePattern: RegExp
  /** 证据目录名（`artifacts`）。 */
  evidenceDirName: string
  pluginPackages: PluginPackagesRule
}

/** 豁免登记（配置清单，不在检查代码里写 per-file 分支）。 */
export interface DocCheckExemptions {
  /** 相对路径**子串**（沿用旧脚本 :181 语义）。 */
  absolutePaths: string[]
  /** 相对路径**精确**匹配（规则自述文件，D-B6）。 */
  bareAdrRefs: string[]
}

/** 内核唯一入口的配置（唯一旋钮）。 */
export interface DocCheckConfig {
  /** 扫描根绝对路径（由入口按 `import.meta.url` 推导）。 */
  root: string
  /** `'repo' | 'multi-root'` 等入口标识，只用于配置错误提示，不进 `[PASS]` 行。 */
  label: string
  /** 检查开关：缺省 `false`（显式开启制，防新检查静默扩散到包内入口）。 */
  checks: Partial<Record<CheckId, boolean>>
  scan: DocCheckScan
  dirs: DocCheckDirs
  rules: DocCheckRules
  exemptions: DocCheckExemptions
  /**
   * 自检开关（缺省 `true`，`false` 仅供调试）。
   * 自检模块是 `doc-checks.selftest.mjs`，由入口调用；内核不反向依赖它。
   */
  selfTest?: boolean
}

/**
 * 运行一组文档检查。打印由内核负责；返回值只供入口决定退出码。
 *
 * @param config 入口配置。
 * @returns `{ errors, warnings, results }`。
 */
export function runDocChecks(config: DocCheckConfig): DocCheckReport
