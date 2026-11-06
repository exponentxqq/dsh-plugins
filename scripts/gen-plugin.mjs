#!/usr/bin/env node
/**
 * 新插件脚手架生成器（R13）。
 *
 * 从 `tooling/template/` 读取模板素材，按 `--kind` 生成 `plugins/<name>/` 下的插件骨架。
 * 生成物对齐六个软插件的终态，开箱通过 `lint / typecheck / build / test` 与仓级
 * `pnpm dsh:check`（AR3–AR5、B1–B5）：
 *
 * - `package.json` 的结构来自 `package.json.tmpl`；`version` 取仓库根 `package.json#version`，
 *   `engines.node` 取根 `engines.node`，`dsh.engines.dsh` 与 DSH peer 由
 *   `scripts/dsh-baseline.mjs` 的 `softDshRange()` **现取现派生**（模板里不写版本字面量）；
 * - `--kind dual` 在上面的基础上补 `exports["./client"]`、`dsh.client`、
 *   `@dsh-plugins/test-kit` devDep 与双 `tsc -p` 的 `typecheck`；
 * - 构建入口是 `@dsh-plugins/build-kit` 的薄入口，tsconfig 只 `extends` 根基准。
 *
 * 本脚本**只写文件，不跑 git / pnpm**；写完打印 5 步后续命令。目标目录必须不存在，
 * 避免覆盖任何已有插件。
 *
 * 退出码：0 成功；1 校验失败（名字非法 / 目录已存在 / 未知 kind）；2 用法错误。
 *
 * @module scripts/gen-plugin
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { softDshRange } from './dsh-baseline.mjs'

/** 仓库根（`scripts/` 的上一级）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 模板素材目录。 */
const TEMPLATE_ROOT = join(REPO_ROOT, 'tooling', 'template')
/** 插件输出目录。 */
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')

/** 允许的插件形态。 */
const KINDS = new Set(['host-only', 'dual'])

/** 插件名文法：kebab-case，不以 `dsh-plugin-` 开头（前缀由生成器补）。 */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

/** 包名前缀。 */
const PACKAGE_PREFIX = 'dsh-plugin-'

/** 命令用法（`pnpm gen:plugin --help` 的固定输出，G-doc-sync 依赖此契约）。 */
const USAGE = `用法：
  pnpm gen:plugin <name> --kind host-only|dual [--dry-run]

参数：
  <name>      kebab-case 插件名，不以 dsh-plugin- 开头（生成器补前缀）；目标目录必须不存在
  --kind      必填，无默认值：host-only（仅宿主半）| dual（宿主半 + 浏览器半）
  --dry-run   只打印将创建的文件与内容摘要，不写盘
  --help, -h  显示本用法

示例：
  pnpm gen:plugin demo-host --kind host-only
  pnpm gen:plugin demo-dual --kind dual --dry-run

退出码：0 成功；1 校验失败（名字非法 / 目录已存在 / 未知 kind）；2 用法错误。`

/**
 * 模板文件清单（显式表，不扫描目录：`--dry-run` 与真实写入因此逐条一致）。
 *
 * `format` 的特殊处理：
 * - `manifest`：先渲染再解析，`dual` 形态补 `exports["./client"]` / `dsh.client` /
 *   `test-kit` devDep 与双 `tsc -p` 的 `typecheck`，最后按 2 空格缩进写回；
 * - `solution`：`dual` 形态把 `tsconfig.client.json` 加进 `references`；
 * - 其余文件按占位符渲染后原样写出。
 */
const FILE_TABLE = [
  { template: 'package.json.tmpl', output: 'package.json', format: 'manifest' },
  { template: 'cordis.patch.yml', output: 'cordis.patch.yml' },
  { template: 'build.mjs', output: 'build.mjs' },
  { template: 'tsconfig.json', output: 'tsconfig.json', format: 'solution' },
  { template: 'tsconfig.host.json', output: 'tsconfig.host.json' },
  { template: 'tsconfig.client.json', output: 'tsconfig.client.json', only: 'dual' },
  { template: 'vitest.config.ts', output: 'vitest.config.ts' },
  { template: 'src/index.ts', output: 'src/index.ts' },
  { template: 'src/client/index.ts', output: 'src/client/index.ts', only: 'dual' },
  { template: 'test/smoke.test.ts', output: 'test/smoke.test.ts' },
  { template: 'plugin-README.md.tmpl', output: 'README.md' },
]

/**
 * 解析命令行参数。
 *
 * 只有「缺必需参数 / 未知参数」算用法错误（exit 2）；名字或 kind 的**值**不合法
 * （含未知 kind）算校验失败（exit 1），与 ③.3 的退出码契约一致。
 * @param {string[]} argv - `process.argv.slice(2)`。
 * @returns {{help: boolean, name?: string, kind?: string, dryRun: boolean, usageErrors: string[]}} 解析结果。
 */
function parseArgs(argv) {
  const result = { help: false, name: undefined, kind: undefined, dryRun: false, usageErrors: [] }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--dry-run') {
      result.dryRun = true
    } else if (arg === '--kind') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        result.usageErrors.push('--kind 缺少取值（host-only | dual）')
      } else {
        result.kind = value
        index += 1
      }
    } else if (arg.startsWith('--kind=')) {
      result.kind = arg.slice('--kind='.length)
    } else if (arg.startsWith('-')) {
      result.usageErrors.push(`无法识别的参数：${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length > 1) result.usageErrors.push(`只接受一个插件名，多出：${positional.slice(1).join(' ')}`)
  if (positional.length > 0) result.name = positional[0]
  return result
}

/**
 * 读取仓库根清单（版本与 Node 版本的唯一来源）。
 * @returns {object} 根 `package.json` 的解析结果。
 */
function readRootManifest() {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
}

/**
 * 判断一个名字是否合法（语法 + 前缀规则）。
 * @param {string} name - 插件名。
 * @returns {string | null} 失败原因；合法时返回 null。
 */
function validateName(name) {
  if (!NAME_PATTERN.test(name)) {
    return `插件名 "${name}" 不是 kebab-case（小写字母开头，仅字母 / 数字 / 中划线）`
  }
  if (name.startsWith(PACKAGE_PREFIX)) {
    return `插件名不要带 "${PACKAGE_PREFIX}" 前缀：目录名用 "${name.slice(PACKAGE_PREFIX.length)}" 即可，生成器会补前缀`
  }
  return null
}

/**
 * 渲染一个模板文本（逐 token 字面替换）。
 * @param {string} source - 模板文本。
 * @param {Record<string, string>} tokens - 占位符 → 值（键不含花括号）。
 * @returns {string} 渲染结果。
 */
function render(source, tokens) {
  let text = source
  for (const [key, value] of Object.entries(tokens)) text = text.split(`{{${key}}}`).join(value)
  return text
}

/**
 * 生成插件 README 里的目录树摘要。
 * @param {boolean} dual - 是否双端形态。
 * @returns {string} 目录树文本。
 */
function structureTree(dual) {
  const lines = [
    'src/index.ts                  宿主半入口：导出 name / inject / apply',
  ]
  if (dual) lines.push('src/client/index.ts           浏览器半入口：座位 / 事件桥从这里开始')
  lines.push(
    'test/smoke.test.ts            包形状 + 产物形状冒烟（产物断言需先 build）',
    'build.mjs                     薄构建入口（策略在 @dsh-plugins/build-kit）',
    'cordis.patch.yml              bundle 注册行（裸包名 insert）',
    'tsconfig.host.json            宿主工程（只 extends 根基准）',
  )
  if (dual) lines.push('tsconfig.client.json          浏览器工程（只 extends 根基准）')
  lines.push(
    `tsconfig.json                 solution 文件（${dual ? '两个工程' : '宿主工程'}的汇总，IDE 用）`,
    'vitest.config.ts              测试配置（node 环境）',
    `package.json                  清单：dsh.bundle.patch${dual ? ' / dsh.client' : ''} / 脚本 / catalog 依赖`,
    'README.md                     本文件',
  )
  return lines.join('\n')
}

/**
 * 由插件名派生 CSS 作用域类名前缀（取各中划线分段的首字母，最多 4 位）。
 *
 * `build-kit` 要求双端插件必须传 `cssClassPrefix`（它决定作用域类名前缀，是保产物
 * 字节的旋钮）；生成物给一个确定性起点，后续按需手改。
 * @param {string} name - 插件名（不含包名前缀）。
 * @returns {string} 类名前缀。
 */
function cssClassPrefix(name) {
  return name
    .split('-')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 4)
}

/**
 * 构造模板占位符取值。
 * @param {string} name - 插件名（不含包名前缀）。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @param {object} rootManifest - 仓库根清单。
 * @returns {Record<string, string>} 占位符取值。
 */
function buildTokens(name, kind, rootManifest) {
  const dual = kind === 'dual'
  const kindLabel = dual ? '双端' : 'host-only'
  return {
    NAME: name,
    PACKAGE_NAME: `${PACKAGE_PREFIX}${name}`,
    KIND: kind,
    DESCRIPTION: `DSH 插件（${kindLabel}）：${name} —— 请替换为定位与能力的一句话说明。`,
    VERSION: rootManifest.version,
    NODE_RANGE: rootManifest.engines.node,
    DSH_RANGE: softDshRange(),
    CSS_CLASS_PREFIX_OPTION: dual ? `, cssClassPrefix: '${cssClassPrefix(name)}'` : '',
    CLIENT_TSCONFIG_NOTE: dual ? ' / tsconfig.client.json' : '',
    TYPECHECK_CLIENT: dual ? ' && tsc -p tsconfig.client.json --pretty false' : '',
    BUILD_CLIENT: dual ? ' + lib/client.js' : '',
    STRUCTURE_TREE: structureTree(dual),
  }
}

/**
 * 把渲染后的清单文本整理成终态：`dual` 补浏览器半声明，并排序 devDependencies。
 * @param {string} rendered - 渲染后的 `package.json` 文本。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @returns {string} 终态 `package.json` 文本。
 */
function finalizeManifest(rendered, kind) {
  const manifest = JSON.parse(rendered)
  if (kind === 'dual') {
    manifest.exports['./client'] = { default: './lib/client.js' }
    manifest.dsh.client = { inject: [], platform: 'web' }
    manifest.devDependencies['@dsh-plugins/test-kit'] = 'workspace:*'
    manifest.scripts.typecheck = 'tsc -p tsconfig.host.json --pretty false && tsc -p tsconfig.client.json --pretty false'
  }
  manifest.devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  )
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * 把渲染后的 solution tsconfig 整理成终态（`dual` 增加浏览器工程引用）。
 * @param {string} rendered - 渲染后的 `tsconfig.json` 文本。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @returns {string} 终态 `tsconfig.json` 文本。
 */
function finalizeSolution(rendered, kind) {
  const solution = JSON.parse(rendered)
  if (kind === 'dual') solution.references.push({ path: './tsconfig.client.json' })
  return `${JSON.stringify(solution, null, 2)}\n`
}

/**
 * 读完模板、生成全部文件内容（**先全部生成再落盘**，模板缺陷不会留下半成品目录）。
 * @param {string} name - 插件名（不含包名前缀）。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @param {object} rootManifest - 仓库根清单。
 * @returns {{output: string, content: string}[]} 相对插件目录的路径与内容。
 */
function buildFiles(name, kind, rootManifest) {
  const tokens = buildTokens(name, kind, rootManifest)
  const files = []
  for (const entry of FILE_TABLE) {
    if (entry.only !== undefined && entry.only !== kind) continue
    const templateFile = join(TEMPLATE_ROOT, entry.template)
    if (!existsSync(templateFile)) {
      throw new Error(`模板素材缺失：${relative(REPO_ROOT, templateFile)}`)
    }
    const rendered = render(readFileSync(templateFile, 'utf8'), tokens)
    let content = rendered
    if (entry.format === 'manifest') content = finalizeManifest(rendered, kind)
    else if (entry.format === 'solution') content = finalizeSolution(rendered, kind)
    files.push({ output: entry.output, content })
  }
  return files
}

/**
 * 打印文件摘要（`--dry-run` 与成功回执共用）。
 * @param {{output: string, content: string}[]} files - 生成的文件。
 * @param {string} prefix - 每行前缀（如插件相对目录）。
 */
function printFileSummaries(files, prefix) {
  for (const file of files) {
    const lines = file.content.split('\n').length - 1
    process.stdout.write(`  ${prefix}/${file.output}（${lines} 行，${Buffer.byteLength(file.content)} 字节）\n`)
  }
}

/**
 * 打印成功后的 5 步后续命令（生成器不执行它们）。
 * @param {string} packageName - 包名。
 */
function printNextSteps(packageName) {
  process.stdout.write(
    '\n后续步骤（生成器只写文件，不执行 git / pnpm）：\n'
    + '  1. pnpm install\n'
    + `  2. pnpm --filter ${packageName} lint\n`
    + `  3. pnpm --filter ${packageName} typecheck\n`
    + `  4. pnpm --filter ${packageName} build && pnpm --filter ${packageName} test\n`
    + '  5. pnpm dsh:check\n',
  )
}

/**
 * 入口。
 * @param {string[]} argv - 命令行参数。
 * @returns {number} 退出码。
 */
function main(argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (parsed.usageErrors.length > 0) {
    process.stderr.write(`${parsed.usageErrors.join('\n')}\n\n${USAGE}\n`)
    return 2
  }
  if (parsed.name === undefined) {
    process.stderr.write(`缺少插件名\n\n${USAGE}\n`)
    return 2
  }
  if (parsed.kind === undefined) {
    process.stderr.write(`缺少必填参数 --kind（host-only | dual）\n\n${USAGE}\n`)
    return 2
  }

  const nameError = validateName(parsed.name)
  if (nameError !== null) {
    process.stderr.write(`[gen:plugin] ${nameError}\n`)
    return 1
  }
  if (!KINDS.has(parsed.kind)) {
    process.stderr.write(`[gen:plugin] 未知 kind "${parsed.kind}"（允许 host-only | dual）\n`)
    return 1
  }
  const kind = parsed.kind
  const targetDir = join(PLUGINS_ROOT, parsed.name)
  if (existsSync(targetDir)) {
    process.stderr.write(`[gen:plugin] 目标目录已存在：${relative(REPO_ROOT, targetDir)}（不覆盖）\n`)
    return 1
  }

  let files
  try {
    files = buildFiles(parsed.name, kind, readRootManifest())
  } catch (error) {
    process.stderr.write(`[gen:plugin] 生成失败：${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  const packageName = `${PACKAGE_PREFIX}${parsed.name}`
  const relativeDir = relative(REPO_ROOT, targetDir)
  if (parsed.dryRun) {
    process.stdout.write(`[dry-run] 将创建 ${relativeDir}/，共 ${files.length} 个文件：\n`)
    printFileSummaries(files, relativeDir)
    printNextSteps(packageName)
    return 0
  }

  for (const file of files) {
    const absolute = join(targetDir, file.output)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, file.content)
  }
  process.stdout.write(`已生成 ${relativeDir}/（${files.length} 个文件，包名 ${packageName}，kind ${kind}）：\n`)
  printFileSummaries(files, relativeDir)
  printNextSteps(packageName)
  return 0
}

process.exitCode = main(process.argv.slice(2))
