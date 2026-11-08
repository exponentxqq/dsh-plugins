/**
 * 文档检查共享内核——**唯一实现**（D-6 / D-B1）。
 *
 * 本模块从 multi-root 旧脚本 `plugins/multi-root-workspace/scripts/check-docs.mjs`
 * 承接 10 项检查（逻辑零改写，注释里保留原文件行号锚），并新增 4 项仓级检查。
 * 双薄入口（包内 `docs:check` 与仓级 `scripts/check-docs.mjs`）只构造
 * `DocCheckConfig` 并转 exit code；检查逻辑、打印与计数只在这里。
 *
 * 14 项检查按 `CHECK_IDS` 顺序执行，逐项产出 `CheckResult`：
 *
 * - `readme-pairs` / `agent-note-pairs` / `readme-navigation`：双语成对与导航，
 *   单语化（G4）后由入口配置关闭——**实现保留**，关闭即退役；
 * - `wrong-english-suffix` / `markdown-links` / `absolute-paths` /
 *   `agent-note-filenames` / `plan-conflicts` / `adr-names` / `empty-documents`：
 *   旧脚本 7 项；
 * - `readme-skeleton` / `adr-skeleton` / `evidence-location` / `bare-adr-ref`：
 *   新增 4 项，判定语义逐字对齐 `docs/decisions/ADR-0003-doc-system-layers-and-gates.md`
 *   与 code-design ③.1 / ③.5，multi-root 入口不启用、仓级入口（G7）启用。
 *
 * 配置是唯一旋钮（`DocCheckConfig`，形状见 `doc-checks.d.mts`）：
 *
 * - `checks` 为**显式开启制**：缺省/`false` = 不跑，防止新检查静默扩散到包内入口；
 * - `scan.noScanPaths`：匹配的文件除链接检查外一律不扫（归档域，D-B4）；
 * - `scan.linkWarningPaths`：匹配的域内断链记 warning、不进 error 计数（D-7）；
 *   仅 warning 的检查行打印 `[WARN]`（`[PASS]`/`[FAIL]` 与明细行逐字沿用旧脚本）；
 * - `rules.pluginPackages`：`readme-skeleton` / `evidence-location` 的取包面
 *   **独立于** `scan.excludePaths`——七包统一（R5 / D-B7 轮 5 裁定⑤），multi-root
 *   子树的扫描排除（D-B2）不使骨架检查缩水。
 *
 * 打印与计数归内核（D-B3），`runDocChecks` 返回 `{ errors, warnings, results }`
 * 供入口决定退出码（本模块**不设** `process.exitCode`）。配置非法一律抛
 * `TypeError`（fail-closed，仓级入口按约定映射 exit code 2）。
 *
 * 自检不在本模块：`runSelfTest()` 在 `doc-checks.selftest.mjs`（任务 3.2），
 * 避免「内核 → 自检 → 内核」的反向依赖；配置里的 `selfTest` 仅为形状保留。
 *
 * 零依赖：只 import `node:fs` / `node:path`，与仓内其余 `scripts/*.mjs` 一致。
 *
 * @module scripts/lib/doc-checks
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

/** 全部检查 id，顺序即打印顺序（③.1 表）。 */
export const CHECK_IDS = [
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

/**
 * 检查 id → 显示名。
 * 旧 10 项逐字取自 multi-root 旧脚本（parity 硬契约，不许改写）；4 项新增取 ③.1 表。
 */
const CHECK_NAMES = {
  'readme-pairs': 'README bilingual pairs',
  'agent-note-pairs': 'Agent note bilingual pairs',
  'wrong-english-suffix': 'English document suffixes',
  'readme-navigation': 'README language navigation',
  'markdown-links': 'Markdown local links',
  'absolute-paths': 'Absolute paths',
  'agent-note-filenames': 'Agent note filenames',
  'plan-conflicts': 'Plan lifecycle',
  'adr-names': 'ADR naming',
  'empty-documents': 'Empty documents',
  'readme-skeleton': 'Plugin README skeleton',
  'adr-skeleton': 'ADR section skeleton',
  'evidence-location': 'Verification evidence location',
  'bare-adr-ref': 'Bare ADR references',
}

/**
 * 检查启用时需要提供的配置项（fail-closed：缺项即配置错误，不静默放行）。
 * `exemptions` 有缺省空数组，故不在此表。
 */
const CHECK_CONFIG_REQUIREMENTS = {
  'agent-note-pairs': { dirs: ['agentNote'] },
  'wrong-english-suffix': { rules: ['wrongEnglishSuffix'] },
  'agent-note-filenames': { rules: ['scratchpadNamePattern'], dirs: ['agentNote'] },
  'plan-conflicts': { dirs: ['plansActive', 'plansCompleted'] },
  'adr-names': { rules: ['adrNamePattern'], dirs: ['decisions'] },
  'readme-skeleton': {
    rules: ['readmeRequiredSections', 'readmeOptionalSections', 'readmeEndness', 'pluginPackages'],
  },
  'adr-skeleton': { rules: ['adrRequiredSections', 'adrNamePattern'], dirs: ['decisions'] },
  'evidence-location': {
    rules: ['pluginPackages', 'evidenceSectionPattern', 'evidenceLinePattern', 'evidenceDirName'],
  },
}

/** 规则项的类型（供配置校验）。 */
const RULE_KINDS = {
  adrNamePattern: 'regexp',
  scratchpadNamePattern: 'regexp',
  wrongEnglishSuffix: 'regexp',
  adrRequiredSections: 'string-array',
  readmeRequiredSections: 'string-array',
  readmeOptionalSections: 'string-array',
  readmeEndness: 'endness',
  evidenceSectionPattern: 'regexp',
  evidenceLinePattern: 'regexp',
  evidenceDirName: 'string',
  pluginPackages: 'plugin-packages',
}

/** 必需节/ADR 节清单不许为空（空表等于关闭检查，属配置错误）。 */
const NON_EMPTY_RULE_LISTS = new Set(['adrRequiredSections', 'readmeRequiredSections'])

/** 配置对象允许的键（fail-closed：拼错键即配置错误，不静默忽略）。 */
const CONFIG_KEYS = new Set([
  'root',
  'label',
  'checks',
  'scan',
  'dirs',
  'rules',
  'exemptions',
  'selfTest',
])

/** `scan` 允许的键。 */
const SCAN_KEYS = new Set([
  'markdownRoots',
  'excludeDirs',
  'excludePaths',
  'linkWarningPaths',
  'noScanPaths',
])

/** `dirs` 允许的键。 */
const DIR_KEYS = new Set(['agentNote', 'plansActive', 'plansCompleted', 'decisions'])

/** `rules` 允许的键。 */
const RULE_KEYS = new Set(Object.keys(RULE_KINDS))

/** `exemptions` 允许的键。 */
const EXEMPTION_KEYS = new Set(['absolutePaths', 'bareAdrRefs'])

/**
 * 节标题归一表（ADR-0003 §2 判据：「构建」「构建与类型」→「构建与测试」，
 * 「许可证」→「许可」，「与 dsh-plugin-web-ux 的关系」→「与其他插件的关系」）。
 */
const SECTION_ALIASES = new Map([
  ['构建', '构建与测试'],
  ['构建与类型', '构建与测试'],
  ['许可证', '许可'],
  ['与 dsh-plugin-web-ux 的关系', '与其他插件的关系'],
])

/** 证据行标记（用于在 README 正文里识别「像证据行」的行，再按文法判定）。 */
const EVIDENCE_LINE_MARKER = /^验证证据/

/** 裸 ADR 编号：后接 `-slug` 的是文件名/路径形式，不算裸引用（D-B6）。 */
const BARE_ADR_REFERENCE = /\bADR-\d{4}(?![-A-Za-z0-9])/g

/** `docs/decisions/*.md` 的 `# ADR-NNNN:` 首行自标题（D-B6 结构豁免）。 */
const ADR_SELF_TITLE = /^#\s+ADR-\d{4}\b/

/** 行内 markdown 链接/图片：整段剥离后再找裸 ADR 编号（标签与目标均豁免）。 */
const MARKDOWN_LINK = /!?\[[^\]]*\]\([^)]*\)/g

/** H2 标题：`## 文本`，允许行尾闭合 `#`。 */
const H2_HEADING = /^##\s+(.+?)\s*#*\s*$/

/** H1 标题：结束当前 H2 的正文域。 */
const H1_HEADING = /^#\s+/

/** 三条绝对路径 pattern（原文件 :176-178，逐字保留）。 */
const ABSOLUTE_PATH_PATTERNS = [
  [/\/(Users|home)\//, 'Unix home absolute path'],
  [/[A-Za-z]:\\Users\\/i, 'Windows user absolute path'],
  [/file:\/\//i, 'file:// URL'],
]

/**
 * 构造一条检查结果。
 * @param {string} id 检查 id。
 * @returns {import('./doc-checks.d.mts').CheckResult} 空结果。
 */
function newResult(id) {
  return { id, name: CHECK_NAMES[id], issues: [] }
}

/**
 * 构造一条问题项（与旧脚本同形：无 file/line 时对象不带这两个键）。
 * @param {'error'|'warning'} level 级别。
 * @param {string} check 检查显示名。
 * @param {string} message 问题描述。
 * @param {string} [file] 相对文件路径。
 * @param {number} [line] 行号（1 起）。
 * @returns {import('./doc-checks.d.mts').DocCheckIssue} 问题项。
 */
function issue(level, check, message, file, line) {
  const item = { level, check, message }
  if (file !== undefined) item.file = file
  if (line !== undefined) item.line = line
  return item
}

/**
 * 配置错误（fail-closed）：仓级入口据此映射 exit code 2。
 * @param {string} label 入口标识。
 * @param {string} message 中文错误描述。
 * @returns {TypeError} 带入口前缀的错误。
 */
function configError(label, message) {
  return new TypeError(`doc-checks[${label}]: ${message}`)
}

/**
 * 判断是否为普通对象。
 * @param {unknown} value 待判断值。
 * @returns {boolean} 是否普通对象。
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 去掉 fenced code block（原文件 :57-59，逐字保留）。
 * @param {string} text 原文。
 * @returns {string} 去围栏后的文本。
 */
function stripCodeFences(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
}

/**
 * 去掉 HTML 注释（模板的 `<!-- 如适用：… -->` 不构成标题，③.5 细则 7）。
 * @param {string} text 原文。
 * @returns {string} 去注释后的文本。
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 结构判定用的正文视图：去围栏 + 去 HTML 注释（R7：示例不触发）。
 * @param {string} text 原文。
 * @returns {string} 可用于标题/正文解析的文本。
 */
function stripNonContent(text) {
  return stripHtmlComments(stripCodeFences(text))
}

/**
 * 平台路径 → posix 风格的相对路径。
 * @param {string} value 路径。
 * @returns {string} 以 `/` 分隔的路径。
 */
function toPosix(value) {
  return value.split(sep).join('/')
}

/**
 * 相对路径归一（去 `./` 前缀与尾部 `/`）。
 * @param {string} value 相对路径。
 * @returns {string} 归一后的路径。
 */
function normalizeRel(value) {
  return toPosix(value).replace(/^\.\//, '').replace(/\/+$/, '')
}

/**
 * 逐段匹配相对路径前缀；`*` 匹配任意单段（③.2：不引 glob 依赖）。
 * `**` 不特殊化（仓级配置的归档前缀已覆盖其子树，U1：确有第三种形状再扩语法）。
 * @param {string} rel 相对路径（posix 风格）。
 * @param {string} pattern 相对路径前缀模式。
 * @returns {boolean} 是否命中。
 */
function matchesPathPattern(rel, pattern) {
  const relSegments = rel.split('/')
  const patternSegments = normalizeRel(String(pattern))
    .split('/')
    .filter((segment) => segment !== '')
  if (patternSegments.length === 0) return false
  if (relSegments.length < patternSegments.length) return false
  return patternSegments.every((segment, index) => segment === '*' || segment === relSegments[index])
}

/**
 * 相对路径是否命中任一模式。
 * @param {string} rel 相对路径。
 * @param {string[]} patterns 模式清单。
 * @returns {boolean} 是否命中。
 */
function matchesAnyPath(rel, patterns) {
  return patterns.some((pattern) => matchesPathPattern(rel, pattern))
}

/**
 * 执行一次正则（重置 lastIndex，兼容带 `g` 的标志）。
 * @param {RegExp} pattern 正则。
 * @param {string} value 待匹配文本。
 * @returns {RegExpExecArray|null} 匹配结果。
 */
function execPattern(pattern, value) {
  pattern.lastIndex = 0
  return pattern.exec(value)
}

/**
 * 节标题归一（别名映射，见 `SECTION_ALIASES`）。
 * @param {string} title 原始标题文本。
 * @returns {string} 归一后的标题。
 */
function normalizeSectionTitle(title) {
  const trimmed = title.trim()
  return SECTION_ALIASES.get(trimmed) ?? trimmed
}

/**
 * 解析 H2 节：返回 `{ title, body }` 列表；H1 之后不再归属任何 H2。
 * @param {string} text 原文。
 * @returns {Array<{ title: string, body: string }>} 节列表。
 */
function parseSections(text) {
  const lines = stripNonContent(text).split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    const heading = line.match(H2_HEADING)
    if (heading) {
      current = { title: heading[1].trim(), body: [] }
      sections.push(current)
      continue
    }
    if (H1_HEADING.test(line)) {
      current = null
      continue
    }
    if (current) current.body.push(line)
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n') }))
}

/**
 * 在 `## 定位` 正文里找端性声明行（③.5 细则 3）。
 * @param {string} body 定位节正文。
 * @param {{ line: RegExp, values: string[] }} rule 端性规则。
 * @returns {{ invalid: boolean, value: string }|null} 声明结果；缺失为 null。
 */
function findEndnessDeclaration(body, rule) {
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    const match = execPattern(rule.line, trimmed)
    if (!match) continue
    const value = match[1] ?? rule.values.find((candidate) => trimmed.includes(candidate))
    if (value === undefined || !rule.values.includes(value)) {
      return { invalid: true, value: value === undefined ? trimmed : value }
    }
    return { invalid: false, value }
  }
  return null
}

/**
 * 归一化并校验配置（fail-closed）。
 * @param {import('./doc-checks.d.mts').DocCheckConfig} config 入口配置。
 * @returns {object} 归一化后的配置。
 */
function normalizeConfig(config) {
  if (!isPlainObject(config)) {
    throw configError('docs', 'config 必须是对象（DocCheckConfig）')
  }
  assertKnownKeys(
    typeof config.label === 'string' && config.label !== '' ? config.label : 'docs',
    'config',
    config,
    CONFIG_KEYS
  )
  const label =
    typeof config.label === 'string' && config.label !== '' ? config.label : 'docs'
  if (typeof config.root !== 'string' || config.root === '') {
    throw configError(label, 'root 必须是非空字符串（扫描根绝对路径）')
  }
  const root = resolve(config.root)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw configError(label, `root 不是目录: ${config.root}`)
  }

  if (!isPlainObject(config.checks)) {
    throw configError(label, 'checks 必须是对象（检查开关表）')
  }
  const checks = {}
  for (const [id, enabled] of Object.entries(config.checks)) {
    if (!CHECK_IDS.includes(id)) {
      throw configError(label, `未知检查 id: ${id}`)
    }
    if (typeof enabled !== 'boolean') {
      throw configError(label, `checks.${id} 必须是布尔值`)
    }
    checks[id] = enabled
  }

  const scanInput = config.scan
  if (!isPlainObject(scanInput)) {
    throw configError(label, 'scan 必须是对象')
  }
  assertKnownKeys(label, 'scan', scanInput, SCAN_KEYS)
  if (
    !Array.isArray(scanInput.markdownRoots) ||
    scanInput.markdownRoots.length === 0 ||
    scanInput.markdownRoots.some((item) => typeof item !== 'string' || item === '')
  ) {
    throw configError(label, 'scan.markdownRoots 必须是非空的字符串数组')
  }
  const readScanArray = (key) => {
    const value = scanInput[key]
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw configError(label, `scan.${key} 必须是字符串数组`)
    }
    return [...value]
  }
  const scan = {
    markdownRoots: [...scanInput.markdownRoots],
    excludeDirs: readScanArray('excludeDirs'),
    excludePaths: readScanArray('excludePaths'),
    linkWarningPaths: readScanArray('linkWarningPaths'),
    noScanPaths: readScanArray('noScanPaths'),
  }

  const dirsInput = config.dirs === undefined ? {} : config.dirs
  if (!isPlainObject(dirsInput)) {
    throw configError(label, 'dirs 必须是对象')
  }
  assertKnownKeys(label, 'dirs', dirsInput, DIR_KEYS)
  const dirs = {}
  for (const [key, value] of Object.entries(dirsInput)) {
    if (value === undefined) continue
    if (typeof value !== 'string' || value === '') {
      throw configError(label, `dirs.${key} 必须是非空字符串`)
    }
    dirs[key] = value
  }

  const rulesInput = config.rules === undefined ? {} : config.rules
  if (!isPlainObject(rulesInput)) {
    throw configError(label, 'rules 必须是对象')
  }
  assertKnownKeys(label, 'rules', rulesInput, RULE_KEYS)
  const rules = { ...rulesInput }

  const exemptionsInput = config.exemptions === undefined ? {} : config.exemptions
  if (!isPlainObject(exemptionsInput)) {
    throw configError(label, 'exemptions 必须是对象')
  }
  assertKnownKeys(label, 'exemptions', exemptionsInput, EXEMPTION_KEYS)
  const readExemptionArray = (key) => {
    const value = exemptionsInput[key]
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw configError(label, `exemptions.${key} 必须是字符串数组`)
    }
    return [...value]
  }
  const exemptions = {
    absolutePaths: readExemptionArray('absolutePaths'),
    bareAdrRefs: readExemptionArray('bareAdrRefs'),
  }

  if (config.selfTest !== undefined && typeof config.selfTest !== 'boolean') {
    throw configError(label, 'selfTest 必须是布尔值')
  }

  for (const [id, requirements] of Object.entries(CHECK_CONFIG_REQUIREMENTS)) {
    if (checks[id] !== true) continue
    for (const key of requirements.rules ?? []) {
      if (rules[key] === undefined) {
        throw configError(label, `检查 ${id} 需要 rules.${key}`)
      }
      assertRuleValue(label, id, key, rules[key])
    }
    for (const key of requirements.dirs ?? []) {
      if (typeof dirs[key] !== 'string' || dirs[key] === '') {
        throw configError(label, `检查 ${id} 需要 dirs.${key}`)
      }
    }
  }

  return {
    root,
    label,
    checks,
    scan,
    dirs,
    rules,
    exemptions,
    selfTest: config.selfTest ?? true,
  }
}

/**
 * 校验对象没有未知键（fail-closed：拼错的旋钮不会被静默忽略）。
 * @param {string} label 入口标识。
 * @param {string} field 字段名。
 * @param {object} value 待校验对象。
 * @param {Set<string>} allowed 允许的键集合。
 */
function assertKnownKeys(label, field, value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw configError(label, `${field}.${key} 不是已知字段`)
  }
}

/**
 * 校验单个规则项的类型。
 * @param {string} label 入口标识。
 * @param {string} id 检查 id。
 * @param {string} key 规则键。
 * @param {unknown} value 规则值。
 */
function assertRuleValue(label, id, key, value) {
  const kind = RULE_KINDS[key]
  if (kind === 'regexp') {
    if (!(value instanceof RegExp)) {
      throw configError(label, `检查 ${id} 的 rules.${key} 必须是 RegExp`)
    }
    return
  }
  if (kind === 'string-array') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw configError(label, `检查 ${id} 的 rules.${key} 必须是字符串数组`)
    }
    if (NON_EMPTY_RULE_LISTS.has(key) && value.length === 0) {
      throw configError(label, `检查 ${id} 的 rules.${key} 不允许为空`)
    }
    return
  }
  if (kind === 'string') {
    if (typeof value !== 'string' || value === '') {
      throw configError(label, `检查 ${id} 的 rules.${key} 必须是非空字符串`)
    }
    return
  }
  if (kind === 'endness') {
    if (!isPlainObject(value)) {
      throw configError(label, `检查 ${id} 的 rules.${key} 必须是对象`)
    }
    if (!(value.line instanceof RegExp)) {
      throw configError(label, `检查 ${id} 的 rules.${key}.line 必须是 RegExp`)
    }
    if (
      !Array.isArray(value.values) ||
      value.values.length === 0 ||
      value.values.some((item) => typeof item !== 'string')
    ) {
      throw configError(label, `检查 ${id} 的 rules.${key}.values 必须是非空字符串数组`)
    }
    if (typeof value.dualSection !== 'string' || value.dualSection === '') {
      throw configError(label, `检查 ${id} 的 rules.${key}.dualSection 必须是非空字符串`)
    }
    return
  }
  if (kind === 'plugin-packages') {
    if (!isPlainObject(value)) {
      throw configError(label, `检查 ${id} 的 rules.${key} 必须是对象`)
    }
    if (typeof value.dir !== 'string' || value.dir === '') {
      throw configError(label, `检查 ${id} 的 rules.${key}.dir 必须是非空字符串`)
    }
    if (!Array.isArray(value.exclude) || value.exclude.some((item) => typeof item !== 'string')) {
      throw configError(label, `检查 ${id} 的 rules.${key}.exclude 必须是字符串数组`)
    }
  }
}

/**
 * 惰性收集待检文件（替代旧脚本 :54-55 的顶层全量扫描）。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @returns {Array<{ rel: string, abs: string }>} 相对路径 + 绝对路径（按 rel 排序）。
 */
function collectMarkdown(config) {
  const files = new Map()
  const addFile = (abs) => {
    const rel = toPosix(relative(config.root, abs))
    if (!files.has(rel)) files.set(rel, abs)
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (config.scan.excludeDirs.includes(entry.name)) continue
        const child = join(dir, entry.name)
        if (matchesAnyPath(toPosix(relative(config.root, child)), config.scan.excludePaths)) continue
        walk(child)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const abs = join(dir, entry.name)
      if (matchesAnyPath(toPosix(relative(config.root, abs)), config.scan.excludePaths)) continue
      addFile(abs)
    }
  }
  for (const markdownRoot of config.scan.markdownRoots) {
    const abs = resolve(config.root, markdownRoot)
    if (!existsSync(abs)) {
      throw configError(config.label, `scan.markdownRoots 指向的路径不存在: ${markdownRoot}`)
    }
    if (statSync(abs).isDirectory()) {
      const rel = toPosix(relative(config.root, abs))
      if (rel !== '' && matchesAnyPath(rel, config.scan.excludePaths)) continue
      walk(abs)
      continue
    }
    if (abs.endsWith('.md') && !matchesAnyPath(toPosix(relative(config.root, abs)), config.scan.excludePaths)) {
      addFile(abs)
    }
  }
  return [...files.entries()]
    .map(([rel, abs]) => ({ rel, abs }))
    .sort((left, right) => (left.rel < right.rel ? -1 : left.rel > right.rel ? 1 : 0))
}

/**
 * 除链接检查外的检查所见的文件集（`noScanPaths` 域一律不扫，D-B4）。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {Array<{ rel: string, abs: string }>} 可扫文件。
 */
function scannableFiles(config, files) {
  return files.filter((file) => !matchesAnyPath(file.rel, config.scan.noScanPaths))
}

/**
 * 目录角色 → 绝对路径；未配置时返回 null。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {'agentNote'|'plansActive'|'plansCompleted'|'decisions'} key 角色键。
 * @returns {string|null} 目录绝对路径。
 */
function configDir(config, key) {
  const value = config.dirs[key]
  return value === undefined ? null : resolve(config.root, value)
}

/**
 * 枚举 `rules.pluginPackages` 下的插件包与 README（七包统一，R5）。
 * 与 `scan.excludePaths` 无关：子树扫描排除不使骨架/证据检查缩水（D-B2 与 D-B7 的边界）。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @returns {Array<{ name: string, readmeAbs: string, readmeRel: string, hasReadme: boolean }>} 包列表。
 */
function collectPluginPackages(config) {
  const { dir, exclude } = config.rules.pluginPackages
  const packagesRoot = resolve(config.root, dir)
  if (!existsSync(packagesRoot) || !statSync(packagesRoot).isDirectory()) {
    throw configError(config.label, `rules.pluginPackages.dir 不是目录: ${dir}`)
  }
  const packages = []
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (config.scan.excludeDirs.includes(entry.name)) continue
    if (isExcludedPackage(dir, exclude, entry.name)) continue
    const readmeRel = toPosix(join(dir, entry.name, 'README.md'))
    if (matchesAnyPath(readmeRel, config.scan.noScanPaths)) continue
    packages.push({
      name: entry.name,
      readmeAbs: join(packagesRoot, entry.name, 'README.md'),
      readmeRel,
      hasReadme: existsSync(join(packagesRoot, entry.name, 'README.md')),
    })
  }
  return packages.sort((left, right) =>
    left.readmeRel < right.readmeRel ? -1 : left.readmeRel > right.readmeRel ? 1 : 0
  )
}

/**
 * 包目录是否在 `pluginPackages.exclude` 内（接受目录名或相对路径两种写法）。
 * @param {string} dir `pluginPackages.dir`。
 * @param {string[]} exclude 排除清单。
 * @param {string} name 包目录名。
 * @returns {boolean} 是否排除。
 */
function isExcludedPackage(dir, exclude, name) {
  const candidates = new Set([name, normalizeRel(`${dir}/${name}`)])
  return exclude.some((entry) => candidates.has(normalizeRel(entry)))
}

// ---------------------------------------------------------------------------
// 既有 10 项检查（原文件 :70-272，逻辑零改写；仅把模块常量换成 config）
// ---------------------------------------------------------------------------

/**
 * CHECK 1（原 :70-83）：README 双语成对。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkReadmePairs(config, files) {
  const result = newResult('readme-pairs')
  for (const file of scannableFiles(config, files)) {
    const base = basename(file.rel)
    const dir = dirname(file.abs)
    if (base === 'README.md' && !existsSync(join(dir, 'README.en.md'))) {
      result.issues.push(issue('error', result.name, 'Missing counterpart: README.en.md', file.rel))
    }
    if (base === 'README.en.md' && !existsSync(join(dir, 'README.md'))) {
      result.issues.push(issue('error', result.name, 'Missing counterpart: README.md', file.rel))
    }
  }
  return result
}

/**
 * CHECK 2（原 :86-102）：`.agent/note/` 双语成对。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkAgentNotePairs(config, files) {
  const result = newResult('agent-note-pairs')
  const noteDir = configDir(config, 'agentNote')
  if (noteDir === null) return result
  const noteFiles = scannableFiles(config, files).filter(
    (file) => resolve(dirname(file.abs)) === noteDir
  )
  const present = new Set(noteFiles.map((file) => basename(file.abs)))
  for (const file of noteFiles) {
    const base = basename(file.abs)
    const counterpart = base.endsWith('.en.md')
      ? base.slice(0, -6) + '.md'
      : base.slice(0, -3) + '.en.md'
    if (!present.has(counterpart)) {
      result.issues.push(
        issue('error', result.name, `Missing counterpart: ${counterpart}`, file.rel)
      )
    }
  }
  return result
}

/**
 * CHECK 3（原 :105-116）：错误的英文后缀形式。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkWrongEnglishSuffixes(config, files) {
  const result = newResult('wrong-english-suffix')
  for (const file of scannableFiles(config, files)) {
    const base = basename(file.rel)
    if (execPattern(config.rules.wrongEnglishSuffix, base)) {
      result.issues.push(
        issue('error', result.name, `Wrong English-suffix form, use ".en.md": ${base}`, file.rel)
      )
    }
  }
  return result
}

/**
 * CHECK 4（原 :119-137）：README 语言导航。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkReadmeNavigation(config, files) {
  const result = newResult('readme-navigation')
  for (const file of scannableFiles(config, files)) {
    const base = basename(file.rel)
    if (base !== 'README.md' && base !== 'README.en.md') continue
    const text = readFileSync(file.abs, 'utf8')
    if (base === 'README.md' && !text.includes('README.en.md')) {
      result.issues.push(
        issue('error', result.name, 'Chinese README does not link to README.en.md', file.rel)
      )
    }
    if (base === 'README.en.md' && !text.includes('README.md')) {
      result.issues.push(
        issue('error', result.name, 'English README does not link to README.md', file.rel)
      )
    }
  }
  return result
}

/**
 * CHECK 5（原 :140-170）：markdown 本地链接；`linkWarningPaths` 域降 warning。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkMarkdownLinks(config, files) {
  const result = newResult('markdown-links')
  const linkPattern = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g
  for (const file of files) {
    const text = stripCodeFences(readFileSync(file.abs, 'utf8'))
    const lines = text.split('\n')
    const level = matchesAnyPath(file.rel, config.scan.linkWarningPaths) ? 'warning' : 'error'
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(linkPattern)) {
        let target = match[1]
        if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
        if (target.startsWith('#')) continue
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // http: / https: / mailto: 等 scheme
        let pathname = target.split('#')[0]
        try {
          pathname = decodeURIComponent(pathname)
        } catch {
          // 百分号解码失败时保留原始目标
        }
        if (pathname === '') continue
        const resolved = resolve(dirname(file.abs), pathname)
        if (!existsSync(resolved)) {
          result.issues.push(
            issue(level, result.name, `Broken link: ${target}`, file.rel, index + 1)
          )
        }
      }
    }
  }
  return result
}

/**
 * CHECK 6（原 :173-195）：绝对路径；豁免子串 + `noScanPaths`（R7：围栏内示例不触发）。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkAbsolutePaths(config, files) {
  const result = newResult('absolute-paths')
  for (const file of scannableFiles(config, files)) {
    if (config.exemptions.absolutePaths.some((allowed) => file.rel.includes(allowed))) continue
    const text = stripCodeFences(readFileSync(file.abs, 'utf8'))
    const lines = text.split('\n')
    for (const [index, line] of lines.entries()) {
      for (const [pattern, label] of ABSOLUTE_PATH_PATTERNS) {
        if (execPattern(pattern, line)) {
          result.issues.push(
            issue(
              'error',
              result.name,
              `Accidental ${label}: ${line.trim().slice(0, 80)}`,
              file.rel,
              index + 1
            )
          )
        }
      }
    }
  }
  return result
}

/**
 * CHECK 7（原 :198-211）：`.agent/note/` 临时文件名。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkAgentNoteFilenames(config, files) {
  const result = newResult('agent-note-filenames')
  const noteDir = configDir(config, 'agentNote')
  if (noteDir === null) return result
  const noteFiles = scannableFiles(config, files).filter(
    (file) => resolve(dirname(file.abs)) === noteDir
  )
  for (const file of noteFiles) {
    if (execPattern(config.rules.scratchpadNamePattern, basename(file.rel))) {
      result.issues.push(
        issue('error', result.name, 'Scratchpad-style filename in .agent/note/', file.rel)
      )
    }
  }
  return result
}

/**
 * CHECK 8（原 :214-231）：计划生命周期冲突。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkPlanConflicts(config, files) {
  const result = newResult('plan-conflicts')
  const listFiles = (dir) => {
    if (dir === null || !existsSync(dir)) return []
    return scannableFiles(config, files)
      .filter((file) => resolve(dirname(file.abs)) === dir)
      .map((file) => basename(file.abs))
  }
  const active = new Set(listFiles(configDir(config, 'plansActive')))
  for (const name of listFiles(configDir(config, 'plansCompleted'))) {
    if (active.has(name)) {
      result.issues.push(
        issue('error', result.name, `Same plan exists in both active/ and completed/: ${name}`)
      )
    }
  }
  return result
}

/**
 * CHECK 9（原 :234-260）：ADR 文件名与编号唯一。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkAdrNames(config, files) {
  const result = newResult('adr-names')
  const decisionsDir = configDir(config, 'decisions')
  if (decisionsDir === null) return result
  const seenNumbers = new Map()
  const adrFiles = scannableFiles(config, files).filter((file) => {
    if (resolve(dirname(file.abs)) !== decisionsDir) return false
    const base = basename(file.abs)
    return base !== 'README.md' && base !== 'README.en.md'
  })
  for (const file of adrFiles) {
    const base = basename(file.rel)
    if (!execPattern(config.rules.adrNamePattern, base)) {
      result.issues.push(
        issue(
          'error',
          result.name,
          `Invalid ADR filename, expected "ADR-NNNN-short-title.md": ${base}`,
          file.rel
        )
      )
      continue
    }
    const number = base.slice(4, 8)
    if (seenNumbers.has(number)) {
      result.issues.push(
        issue(
          'error',
          result.name,
          `Duplicate ADR number ${number}: ${base} and ${seenNumbers.get(number)}`,
          file.rel
        )
      )
    } else {
      seenNumbers.set(number, base)
    }
  }
  return result
}

/**
 * CHECK 10（原 :263-272）：空文档。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkEmptyDocuments(config, files) {
  const result = newResult('empty-documents')
  for (const file of scannableFiles(config, files)) {
    const text = readFileSync(file.abs, 'utf8')
    if (text.trim() === '') {
      result.issues.push(issue('error', result.name, 'Empty markdown document', file.rel))
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 新增 4 项检查（③.1 语义表 + ADR-0003 判据）
// ---------------------------------------------------------------------------

/**
 * 新增 CHECK：插件 README 软骨架（③.5 / ADR-0003 §2）。
 * 4 必备节存在 + 端性声明 + 如适用节非空 + 双端结构闭环；不查节序与自由节。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件（本检查自取包面）。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkReadmeSkeleton(config, files) {
  const result = newResult('readme-skeleton')
  const required = config.rules.readmeRequiredSections
  const optional = config.rules.readmeOptionalSections
  const endness = config.rules.readmeEndness
  for (const pkg of collectPluginPackages(config)) {
    if (!pkg.hasReadme) {
      result.issues.push(
        issue('error', result.name, 'Missing package README.md', pkg.readmeRel)
      )
      continue
    }
    const sections = parseSections(readFileSync(pkg.readmeAbs, 'utf8'))
    const titles = sections.map((section) => normalizeSectionTitle(section.title))
    for (const name of required) {
      if (!titles.includes(name)) {
        result.issues.push(
          issue('error', result.name, `Missing required section: ## ${name}`, pkg.readmeRel)
        )
      }
    }
    const positionSections = sections.filter(
      (section) => normalizeSectionTitle(section.title) === '定位'
    )
    const declaration = findEndnessDeclaration(
      positionSections.map((section) => section.body).join('\n'),
      endness
    )
    if (declaration === null) {
      result.issues.push(
        issue(
          'error',
          result.name,
          'Missing endness declaration (expected "端性：host-only" or "端性：双端")',
          pkg.readmeRel
        )
      )
    } else if (declaration.invalid) {
      result.issues.push(
        issue(
          'error',
          result.name,
          `Invalid endness value "${declaration.value}" (expected: ${endness.values.join(', ')})`,
          pkg.readmeRel
        )
      )
    } else {
      const hasDualSection = titles.includes(normalizeSectionTitle(endness.dualSection))
      if (declaration.value === '双端' && !hasDualSection) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Endness is "双端" but ## ${endness.dualSection} is missing`,
            pkg.readmeRel
          )
        )
      }
      if (declaration.value === 'host-only' && hasDualSection) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Endness is "host-only" but ## ${endness.dualSection} must not exist`,
            pkg.readmeRel
          )
        )
      }
    }
    for (const name of optional) {
      for (const section of sections) {
        if (normalizeSectionTitle(section.title) !== name) continue
        if (section.body.replace(/\s/g, '') === '') {
          result.issues.push(
            issue('error', result.name, `Empty optional section: ## ${name}`, pkg.readmeRel)
          )
        }
      }
    }
  }
  return result
}

/**
 * 新增 CHECK：ADR 七节子集存在性（D-B8：允许多出节、不查顺序）。
 * 只判 `dirs.decisions` 下文件名合法的 ADR（命名问题由 `adr-names` 负责）。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkAdrSkeleton(config, files) {
  const result = newResult('adr-skeleton')
  const decisionsDir = configDir(config, 'decisions')
  if (decisionsDir === null) return result
  const required = config.rules.adrRequiredSections
  const namePattern = config.rules.adrNamePattern
  for (const file of scannableFiles(config, files)) {
    if (resolve(dirname(file.abs)) !== decisionsDir) continue
    const base = basename(file.rel)
    if (base === 'README.md' || base === 'README.en.md') continue
    if (!execPattern(namePattern, base)) continue
    const headings = parseSections(readFileSync(file.abs, 'utf8')).map((section) => section.title)
    const missing = required.filter((name) => !headings.includes(name))
    if (missing.length > 0) {
      result.issues.push(
        issue('error', result.name, `Missing ADR sections: ${missing.join(', ')}`, file.rel)
      )
    }
  }
  return result
}

/**
 * 新增 CHECK：验证证据位置（ADR-0003 §3）。
 * 证据节不得内嵌 README；证据行须合文法、目标在 `<pkg>/artifacts/` 下且存在。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件（本检查自取包面）。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkEvidenceLocation(config, files) {
  const result = newResult('evidence-location')
  const sectionPattern = config.rules.evidenceSectionPattern
  const linePattern = config.rules.evidenceLinePattern
  const evidenceDirName = config.rules.evidenceDirName
  for (const pkg of collectPluginPackages(config)) {
    if (!pkg.hasReadme) continue // 缺失 README 由 readme-skeleton 报告，避免重复
    const raw = readFileSync(pkg.readmeAbs, 'utf8')
    for (const section of parseSections(raw)) {
      if (execPattern(sectionPattern, section.title)) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Evidence section must not be embedded in README: ## ${section.title}`,
            pkg.readmeRel
          )
        )
      }
    }
    const lines = stripNonContent(raw).split('\n')
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim()
      if (!EVIDENCE_LINE_MARKER.test(trimmed)) continue
      if (!execPattern(linePattern, trimmed)) {
        result.issues.push(
          issue(
            'error',
            result.name,
            'Invalid evidence line (expected "验证证据：[标题](artifacts/<file>.md)——结论：<一句话>")',
            pkg.readmeRel,
            index + 1
          )
        )
        continue
      }
      const targetMatch = trimmed.match(/\]\(([^)]+)\)/)
      if (targetMatch === null) continue
      const target = targetMatch[1]
      const targetAbs = resolve(dirname(pkg.readmeAbs), target)
      const artifactsDir = resolve(dirname(pkg.readmeAbs), evidenceDirName)
      if (targetAbs !== artifactsDir && !targetAbs.startsWith(artifactsDir + sep)) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Evidence target must live under ${evidenceDirName}/: ${target}`,
            pkg.readmeRel,
            index + 1
          )
        )
        continue
      }
      if (!existsSync(targetAbs)) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Evidence target does not exist: ${target}`,
            pkg.readmeRel,
            index + 1
          )
        )
      }
    }
  }
  return result
}

/**
 * 新增 CHECK：裸 ADR 编号引用（D-B6）。
 * 剥离 markdown 链接（标签与目标均不计）与 ADR 首行自标题后，仍出现的裸编号即违规；
 * 规则自述文件由 `exemptions.bareAdrRefs` 精确路径豁免。
 * @param {ReturnType<typeof normalizeConfig>} config 归一化配置。
 * @param {Array<{ rel: string, abs: string }>} files 全部文件。
 * @returns {import('./doc-checks.d.mts').CheckResult} 检查结果。
 */
function checkBareAdrRefs(config, files) {
  const result = newResult('bare-adr-ref')
  const exemptFiles = new Set(config.exemptions.bareAdrRefs.map(normalizeRel))
  for (const file of scannableFiles(config, files)) {
    if (exemptFiles.has(file.rel)) continue
    const lines = stripNonContent(readFileSync(file.abs, 'utf8')).split('\n')
    const firstContent = lines.findIndex((line) => line.trim() !== '')
    for (const [index, line] of lines.entries()) {
      if (index === firstContent && ADR_SELF_TITLE.test(line.trim())) continue
      const stripped = line.replace(MARKDOWN_LINK, '')
      for (const match of stripped.matchAll(BARE_ADR_REFERENCE)) {
        result.issues.push(
          issue(
            'error',
            result.name,
            `Bare ADR reference: ${match[0]} (cite the ADR by path)`,
            file.rel,
            index + 1
          )
        )
      }
    }
  }
  return result
}

/** 检查 id → 实现（顺序无关，`CHECK_IDS` 决定打印顺序）。 */
const CHECK_IMPLEMENTATIONS = {
  'readme-pairs': checkReadmePairs,
  'agent-note-pairs': checkAgentNotePairs,
  'wrong-english-suffix': checkWrongEnglishSuffixes,
  'readme-navigation': checkReadmeNavigation,
  'markdown-links': checkMarkdownLinks,
  'absolute-paths': checkAbsolutePaths,
  'agent-note-filenames': checkAgentNoteFilenames,
  'plan-conflicts': checkPlanConflicts,
  'adr-names': checkAdrNames,
  'empty-documents': checkEmptyDocuments,
  'readme-skeleton': checkReadmeSkeleton,
  'adr-skeleton': checkAdrSkeleton,
  'evidence-location': checkEvidenceLocation,
  'bare-adr-ref': checkBareAdrRefs,
}

/**
 * 打印层：逐项检查行 + 明细 + 计数尾行（D-B3）。PASS/FAIL 行、明细缩进与计数尾行
 * 逐字沿用旧脚本 :298-312；仅 warning 的检查行按派发要求补 `[WARN]`（见下方注释）。
 * @param {import('./doc-checks.d.mts').CheckResult[]} results 检查结果。
 * @returns {{ errors: number, warnings: number }} 计数。
 */
function printResults(results) {
  let errors = 0
  let warnings = 0
  console.log('Documentation checks\n')
  for (const result of results) {
    const resultErrors = result.issues.filter((item) => item.level === 'error')
    const resultWarnings = result.issues.filter((item) => item.level === 'warning')
    errors += resultErrors.length
    warnings += resultWarnings.length
    if (result.issues.length === 0) {
      console.log(`[PASS] ${result.name}`)
      continue
    }
    // 旧脚本只有 PASS/FAIL 两态；引入 warning 域后，仅 warning 的检查用 [WARN]
    // 以免把「归档断链不阻塞」误读为失败（无 warning 时输出与旧脚本逐字节一致）。
    console.log(`[${resultErrors.length > 0 ? 'FAIL' : 'WARN'}] ${result.name}`)
    for (const item of result.issues) {
      const location = [item.file, item.line].filter(Boolean).join(':')
      console.log(`       ${location ? location : '(repository)'}`)
      console.log(`       ${item.level.toUpperCase()}: ${item.message}`)
    }
  }
  console.log(
    `\n${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${
      warnings === 1 ? 'warning' : 'warnings'
    }.`
  )
  console.log(
    errors > 0 ? '\nDocumentation checks failed.' : '\nDocumentation checks passed.'
  )
  return { errors, warnings }
}

/**
 * 内核唯一入口：跑启用中的检查并打印结果。
 *
 * 打印由内核负责（D-B3），返回值只供入口决定退出码；本函数不设置 `process.exitCode`。
 * 配置非法抛 `TypeError`（仓级入口映射 exit code 2）。
 *
 * @param {import('./doc-checks.d.mts').DocCheckConfig} config 入口配置。
 * @returns {import('./doc-checks.d.mts').DocCheckReport} 计数与逐项结果。
 */
export function runDocChecks(config) {
  const normalized = normalizeConfig(config)
  const files = collectMarkdown(normalized)
  const results = []
  for (const id of CHECK_IDS) {
    if (normalized.checks[id] !== true) continue
    results.push(CHECK_IMPLEMENTATIONS[id](normalized, files))
  }
  const { errors, warnings } = printResults(results)
  return { errors, warnings, results }
}
