#!/usr/bin/env node
/**
 * 文档检查共享内核的负测试（自检）——**样本运行时生成，不入库**（D-B10）。
 *
 * 5 类缺陷样本（断链 / 绝对路径 / 空文档 / 缺骨架节 README / 缺七节 ADR）在
 * `mkdtempSync(os.tmpdir())` 下临时落盘：缺陷样本逐项断言对应检查 FAIL，每类附
 * 合规样本断言 PASS，并覆盖三条豁免/降级路径（归档域断链降 warning、绝对路径
 * 豁免子串、规则自述文件裸 ADR 豁免）。附带 `bare-adr-ref` 的剥离语义：正文裸写
 * 编号 FAIL、带路径链接 PASS、ADR 首行自标题不触发。
 *
 * 内核 `runDocChecks()` 自己打印，自检只消费其返回值：运行期临时接管
 * `console.log`、`finally` 恢复；临时根同样在 `finally` 递归清理，异常路径也
 * 不留样本。
 *
 * 导出面只有 `runSelfTest()`；两个薄入口以 `if (!runSelfTest()) process.exit(1)`
 * 接入（D-B11）。直接执行本文件（`node scripts/lib/doc-checks.selftest.mjs`）时
 * 打印逐项断言并回写退出码（全通过 0 / 任一失败 1）。
 *
 * 判定真源：`docs/decisions/ADR-0003-doc-system-layers-and-gates.md` §2/§4。
 *
 * @module scripts/lib/doc-checks.selftest
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocChecks } from './doc-checks.mjs'

/**
 * README 必备节样本清单（ADR-0003 §2 的四节）。
 *
 * 自检的**期望清单故意与配置分离**：样本按本清单固定构造，判定值由
 * `TEST_RULES` 提供，规则被改弱或改名时自检转红，而不是跟着变绿。
 */
const README_REQUIRED_SAMPLE = [
  ['定位', '把附加目录接进当前会话的工作区。'],
  ['安装到 profile', '`dsh plugin --profile web add <本仓>/plugins/demo`'],
  ['构建与测试', '`pnpm --filter dsh-plugin-demo verify:all`'],
  ['许可', 'MIT。'],
]

/** ADR 七节样本清单（ADR-0003 §4 判据常量；子集校验，允许多出节与乱序）。 */
const ADR_SECTION_SAMPLE = [
  ['Status', 'Accepted'],
  ['Date', '2026-11-07'],
  ['Context', '背景。'],
  ['Decision', '决策。'],
  ['Alternatives Considered', '被否方案。'],
  ['Consequences', '后果。'],
  ['Related Documents', '无。'],
]

/**
 * 样本的判定侧规则：与 ADR-0003 §4 判据常量、code-design ③.1 的仓级配置同值。
 * 内核不导出规则（配置是唯一旋钮），自检只带本负测试启用的检查所需项——
 * 未覆盖的旋钮不在这里抄一份假镜像，真源仍在 ADR 与入口配置。
 */
const TEST_RULES = {
  adrNamePattern: /^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  adrRequiredSections: ADR_SECTION_SAMPLE.map(([heading]) => heading),
  readmeRequiredSections: README_REQUIRED_SAMPLE.map(([heading]) => heading),
  readmeOptionalSections: ['配置', '双端结构', '已知限制', '排障', '非目标', '与其他插件的关系'],
  readmeEndness: {
    line: /^端性[：:]\s*(host-only|双端)$/,
    values: ['host-only', '双端'],
    dualSection: '双端结构',
  },
  pluginPackages: { dir: 'plugins', exclude: [] },
}

/**
 * 构造合规/缺陷 README 样本（host-only 或双端）。
 * @param {{ omit?: string|null, endness?: string, dualSection?: boolean }} [options]
 *   `omit`：故意缺失的必备节；`endness`：声明取值；`dualSection`：是否追加双端结构节。
 * @returns {string} README 正文。
 */
function buildReadme({ omit = null, endness = 'host-only', dualSection = false } = {}) {
  const blocks = []
  for (const [heading, body] of README_REQUIRED_SAMPLE) {
    if (heading === omit) continue
    const text = heading === '定位' ? `端性：${endness}\n\n${body}` : body
    blocks.push(`## ${heading}\n\n${text}\n`)
  }
  if (dualSection) blocks.push('## 双端结构\n\n宿主半注册命令，浏览器半渲染入口。\n')
  return `# demo 插件\n\n${blocks.join('\n')}`
}

/**
 * 构造 ADR 样本（七节可选缺失，可乱序、可多出节）。
 * @param {{ omit?: string|null, relatedFirst?: boolean, extraHeading?: string|null }} [options]
 *   `omit`：故意缺失的节；`relatedFirst`：把 Related Documents 提到最前（乱序）；`extraHeading`：多出的自由节。
 * @returns {string} ADR 正文。
 */
function buildAdr({ omit = null, relatedFirst = false, extraHeading = null } = {}) {
  const entries = ADR_SECTION_SAMPLE.filter(([heading]) => heading !== omit)
  if (relatedFirst) {
    const index = entries.findIndex(([heading]) => heading === 'Related Documents')
    if (index !== -1) entries.unshift(entries.splice(index, 1)[0])
  }
  const blocks = entries.map(([heading, body]) => `## ${heading}\n\n${body}\n`)
  if (extraHeading !== null) blocks.push(`## ${extraHeading}\n\n2026-11-07 首版。\n`)
  return `# ADR-0001: 示例决策\n\n${blocks.join('\n')}`
}

/**
 * 在临时根下写一个场景目录并跑内核（静默打印）。
 * @param {string} baseRoot 临时根。
 * @param {string} name 场景目录名。
 * @param {Record<string, string>} files 相对路径 → 正文。
 * @param {{ checks: string[], dirs?: object, linkWarningPaths?: string[], absolutePaths?: string[], bareAdrRefs?: string[] }} options 场景配置。
 * @returns {{ report: import('./doc-checks.d.mts').DocCheckReport }|{ error: Error }} 报告或执行错误。
 */
function runScenario(baseRoot, name, files, options) {
  const root = join(baseRoot, name)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  const config = {
    root,
    label: 'selftest',
    checks: Object.fromEntries(options.checks.map((id) => [id, true])),
    scan: {
      markdownRoots: ['.'],
      excludeDirs: ['node_modules', '.git'],
      excludePaths: [],
      linkWarningPaths: options.linkWarningPaths ?? [],
      noScanPaths: [],
    },
    dirs: options.dirs ?? {},
    rules: { ...TEST_RULES },
    exemptions: {
      absolutePaths: options.absolutePaths ?? [],
      bareAdrRefs: options.bareAdrRefs ?? [],
    },
  }
  const originalLog = console.log
  console.log = () => {}
  try {
    return { report: runDocChecks(config) }
  } catch (error) {
    return { error }
  } finally {
    console.log = originalLog
  }
}

/**
 * 取某项检查的问题项。
 * @param {import('./doc-checks.d.mts').DocCheckReport} report 内核报告。
 * @param {string} id 检查 id。
 * @returns {import('./doc-checks.d.mts').DocCheckIssue[]} 问题项。
 */
function issuesOf(report, id) {
  return report.results.find((result) => result.id === id)?.issues ?? []
}

/**
 * 某项检查是否含指定级别、指定报文片段的问题项。
 * @param {import('./doc-checks.d.mts').DocCheckReport} report 内核报告。
 * @param {string} id 检查 id。
 * @param {'error'|'warning'} level 级别。
 * @param {string} fragment 报文片段。
 * @returns {boolean} 是否命中。
 */
function hasIssue(report, id, level, fragment) {
  return issuesOf(report, id).some(
    (item) => item.level === level && item.message.includes(fragment)
  )
}

/**
 * 报告摘要（断言详情的统一格式）。
 * @param {import('./doc-checks.d.mts').DocCheckReport} report 内核报告。
 * @returns {string} 摘要文本。
 */
function describeReport(report) {
  const messages = report.results.flatMap((result) => result.issues.map((item) => item.message))
  const head = `${report.errors} error / ${report.warnings} warning`
  return messages.length === 0 ? head : `${head}：${messages.slice(0, 3).join('；')}`
}

/**
 * 运行负测试（全部场景都在临时目录内，样本不入库）。
 * @param {{ quiet?: boolean }} [options] `quiet`：只打印失败项（入口热路径用）。
 * @returns {boolean} 全部断言通过为 `true`。
 */
export function runSelfTest(options = {}) {
  const quiet = options.quiet === true
  const assertions = []
  const tempRoot = mkdtempSync(join(tmpdir(), 'doc-checks-selftest-'))
  try {
    /**
     * 断言：场景执行失败时记红而不是抛栈。
     * @param {string} name 断言名。
     * @param {ReturnType<typeof runScenario>} scenario 场景结果。
     * @param {(report: import('./doc-checks.d.mts').DocCheckReport) => boolean} predicate 判定。
     */
    const expect = (name, scenario, predicate) => {
      if (scenario.error) {
        const message = scenario.error instanceof Error ? scenario.error.message : String(scenario.error)
        assertions.push({ name, ok: false, detail: `场景执行失败：${message}` })
        return
      }
      assertions.push({
        name,
        ok: Boolean(predicate(scenario.report)),
        detail: describeReport(scenario.report),
      })
    }

    // 1 断链：缺陷 FAIL / 合规 PASS / 归档域降 warning。
    expect(
      '1 断链 · 缺陷样本 FAIL',
      runScenario(
        tempRoot,
        'links-broken',
        { 'docs/a.md': '# 断链样本\n\n[缺失](./missing.md)\n' },
        { checks: ['markdown-links'] }
      ),
      (report) =>
        hasIssue(report, 'markdown-links', 'error', 'Broken link: ./missing.md') &&
        report.errors === 1
    )
    expect(
      '1 断链 · 合规样本 PASS',
      runScenario(
        tempRoot,
        'links-ok',
        {
          'docs/a.md': '# 合规链接\n\n[存在](./exists.md)\n',
          'docs/exists.md': '# 目标\n\n正文。\n',
        },
        { checks: ['markdown-links'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'markdown-links').length === 0
    )
    expect(
      '1 断链 · 归档域降 warning 不置 error',
      runScenario(
        tempRoot,
        'links-archive',
        { 'openspec/changes/archive/2026-01-01-demo/a.md': '# 归档断链\n\n[缺失](./gone.md)\n' },
        { checks: ['markdown-links'], linkWarningPaths: ['openspec/changes/archive/'] }
      ),
      (report) =>
        hasIssue(report, 'markdown-links', 'warning', 'Broken link: ./gone.md') &&
        report.errors === 0 &&
        report.warnings === 1
    )

    // 2 绝对路径：缺陷 FAIL / 豁免 PASS / 围栏内示例不触发（R7）。
    expect(
      '2 绝对路径 · 缺陷样本 FAIL',
      runScenario(
        tempRoot,
        'absolute-broken',
        { 'docs/a.md': '# 绝对路径样本\n\n采集路径：/home/selftest/demo\n' },
        { checks: ['absolute-paths'] }
      ),
      (report) =>
        hasIssue(report, 'absolute-paths', 'error', 'Unix home absolute path') &&
        report.errors === 1
    )
    expect(
      '2 绝对路径 · 豁免子串样本 PASS',
      runScenario(
        tempRoot,
        'absolute-exempt',
        { 'docs/exempt/a.md': '# 豁免样本\n\n采集路径：/home/selftest/demo\n' },
        { checks: ['absolute-paths'], absolutePaths: ['docs/exempt'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'absolute-paths').length === 0
    )
    expect(
      '2 绝对路径 · 围栏内示例不触发（R7）',
      runScenario(
        tempRoot,
        'absolute-fenced',
        {
          'docs/a.md': [
            '# 围栏样本',
            '',
            '```bash',
            'cd /home/selftest/demo',
            '```',
            '',
            '正文不含绝对路径。',
            '',
          ].join('\n'),
        },
        { checks: ['absolute-paths'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'absolute-paths').length === 0
    )

    // 3 空文档：缺陷 FAIL / 合规 PASS。
    expect(
      '3 空文档 · 缺陷样本 FAIL',
      runScenario(
        tempRoot,
        'empty-broken',
        { 'docs/blank.md': '   \n\n\t\n' },
        { checks: ['empty-documents'] }
      ),
      (report) =>
        hasIssue(report, 'empty-documents', 'error', 'Empty markdown document') &&
        report.errors === 1
    )
    expect(
      '3 空文档 · 合规样本 PASS',
      runScenario(
        tempRoot,
        'empty-ok',
        { 'docs/has-text.md': '# 有内容\n\n正文。\n' },
        { checks: ['empty-documents'] }
      ),
      (report) => report.errors === 0
    )

    // 4 缺骨架节 README：四个必备节逐个缺失都 FAIL；合规/端性闭环各自断言。
    README_REQUIRED_SAMPLE.forEach(([heading], index) => {
      expect(
        `4 缺骨架节 README · 缺「${heading}」FAIL`,
        runScenario(
          tempRoot,
          `readme-missing-${index + 1}`,
          { 'plugins/demo/README.md': buildReadme({ omit: heading }) },
          { checks: ['readme-skeleton'] }
        ),
        (report) =>
          hasIssue(report, 'readme-skeleton', 'error', `Missing required section: ## ${heading}`)
      )
    })
    expect(
      '4 缺骨架节 README · 合规样本 PASS',
      runScenario(
        tempRoot,
        'readme-ok',
        { 'plugins/demo/README.md': buildReadme() },
        { checks: ['readme-skeleton'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'readme-skeleton').length === 0
    )
    expect(
      '4 缺骨架节 README · 声明双端缺「双端结构」FAIL',
      runScenario(
        tempRoot,
        'readme-dual-missing',
        { 'plugins/demo/README.md': buildReadme({ endness: '双端' }) },
        { checks: ['readme-skeleton'] }
      ),
      (report) =>
        hasIssue(
          report,
          'readme-skeleton',
          'error',
          'Endness is "双端" but ## 双端结构 is missing'
        )
    )
    expect(
      '4 缺骨架节 README · host-only 带「双端结构」FAIL',
      runScenario(
        tempRoot,
        'readme-host-dual',
        { 'plugins/demo/README.md': buildReadme({ dualSection: true }) },
        { checks: ['readme-skeleton'] }
      ),
      (report) =>
        hasIssue(
          report,
          'readme-skeleton',
          'error',
          'Endness is "host-only" but ## 双端结构 must not exist'
        )
    )

    // 5 缺七节 ADR：缺陷 FAIL / 合规 PASS（乱序 + 多出节）/ 文件名非法 FAIL。
    expect(
      '5 缺七节 ADR · 缺陷样本 FAIL',
      runScenario(
        tempRoot,
        'adr-missing',
        { 'docs/decisions/ADR-0001-demo.md': buildAdr({ omit: 'Consequences' }) },
        { checks: ['adr-skeleton'], dirs: { decisions: 'docs/decisions' } }
      ),
      (report) =>
        hasIssue(report, 'adr-skeleton', 'error', 'Missing ADR sections: Consequences') &&
        report.errors === 1
    )
    expect(
      '5 缺七节 ADR · 合规样本 PASS（乱序 + 多出节）',
      runScenario(
        tempRoot,
        'adr-ok',
        {
          'docs/decisions/ADR-0001-demo.md': buildAdr({
            relatedFirst: true,
            extraHeading: '修订记录',
          }),
        },
        { checks: ['adr-skeleton'], dirs: { decisions: 'docs/decisions' } }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'adr-skeleton').length === 0
    )
    expect(
      '5 缺七节 ADR · 文件名非法 FAIL（adr-names）',
      runScenario(
        tempRoot,
        'adr-bad-name',
        {
          'docs/decisions/README.md': '# 决策索引\n\n链接略。\n',
          'docs/decisions/naming.md': buildAdr(),
        },
        { checks: ['adr-names', 'adr-skeleton'], dirs: { decisions: 'docs/decisions' } }
      ),
      (report) =>
        hasIssue(
          report,
          'adr-names',
          'error',
          'Invalid ADR filename, expected "ADR-NNNN-short-title.md": naming.md'
        ) &&
        issuesOf(report, 'adr-skeleton').length === 0 &&
        report.errors === 1
    )

    // 附带：bare-adr-ref 的剥离语义（正文裸写 / 链接 / 首行自标题 / 规则自述豁免）。
    expect(
      '附带 bare-adr-ref · 正文裸写 ADR-0002 FAIL',
      runScenario(
        tempRoot,
        'bare-broken',
        { 'docs/a.md': '# 裸引用样本\n\n决策见 ADR-0002 的归属内核。\n' },
        { checks: ['bare-adr-ref'] }
      ),
      (report) =>
        hasIssue(report, 'bare-adr-ref', 'error', 'Bare ADR reference: ADR-0002') &&
        report.errors === 1
    )
    expect(
      '附带 bare-adr-ref · 带路径链接 PASS',
      runScenario(
        tempRoot,
        'bare-link-ok',
        {
          'docs/a.md':
            '# 链接样本\n\n决策见 [ADR-0002 归属内核](./decisions/ADR-0002-attribution-kernel.md)。\n',
        },
        { checks: ['bare-adr-ref'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'bare-adr-ref').length === 0
    )
    expect(
      '附带 bare-adr-ref · 首行自标题不触发',
      runScenario(
        tempRoot,
        'bare-self-title',
        {
          'docs/decisions/ADR-0002-attribution-kernel.md':
            '# ADR-0002: 归属内核\n\n## Status\n\nAccepted\n',
        },
        { checks: ['bare-adr-ref'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'bare-adr-ref').length === 0
    )
    expect(
      '附带 bare-adr-ref · 规则自述文件豁免 PASS',
      runScenario(
        tempRoot,
        'bare-exempt',
        { 'AGENTS.md': '# 规则自述\n\n本文件可裸写 ADR-0002。\n' },
        { checks: ['bare-adr-ref'], bareAdrRefs: ['AGENTS.md'] }
      ),
      (report) => report.errors === 0 && issuesOf(report, 'bare-adr-ref').length === 0
    )
  } catch (error) {
    assertions.push({
      name: '自检执行',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }

  const failed = assertions.filter((item) => !item.ok)
  if (!quiet) {
    console.log('doc-checks selftest（运行时样本，不入库）\n')
    for (const item of assertions) {
      console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}（${item.detail}）`)
    }
    console.log('')
  }
  if (failed.length > 0) {
    if (quiet) {
      for (const item of failed) console.log(`[FAIL] ${item.name}（${item.detail}）`)
    }
    console.log(`doc-checks selftest failed：${failed.length}/${assertions.length} 项断言失败。`)
    return false
  }
  if (!quiet) {
    console.log(
      `5 类缺陷样本（断链 / 绝对路径 / 空文档 / 缺骨架节 README / 缺七节 ADR）+ 附带 bare-adr-ref：` +
        `${assertions.length} 项断言全部通过；临时样本已清理。`
    )
    console.log('doc-checks selftest passed.')
  }
  return true
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1])
if (invokedPath !== null && invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runSelfTest() ? 0 : 1
}
