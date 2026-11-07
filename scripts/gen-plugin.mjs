#!/usr/bin/env node
/**
 * 新插件脚手架生成器（R13）。
 *
 * 从 `templates/<template>/` 读取模板素材（件套清单是 `template.json`），按 `--kind` 生成
 * `plugins/<name>/` 下的插件骨架；`--template` 选模板（缺省 `default`）。
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
 * 退出码：0 成功；1 校验失败（名字非法 / 目录已存在 / 未知 kind / 未知模板 / 模板清单非法 /
 * 素材缺失）；2 用法错误（缺必需参数、未知 flag、`--template` 缺值）。
 *
 * @module scripts/gen-plugin
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { softDshRange } from './dsh-baseline.mjs'

/** 仓库根（`scripts/` 的上一级）。 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 模板素材根：每个子目录一个模板（`templates/<name>/template.json`）。 */
const TEMPLATE_ROOT = join(REPO_ROOT, 'templates')
/** 缺省模板名（`--template` 不写时即选它）。 */
const DEFAULT_TEMPLATE = 'default'
/** 插件输出目录。 */
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins')

/** 允许的插件形态。 */
const KINDS = new Set(['host-only', 'dual'])

/** 条目 `format` 的允许值（与两种结构化后处理一一对应）。 */
const FORMATS = new Set(['manifest', 'solution'])

/** `template.json` 顶层允许的键。 */
const TEMPLATE_MANIFEST_KEYS = new Set(['name', 'description', 'files'])

/** `template.json` 的 `files[]` 条目允许的键。 */
const TEMPLATE_FILE_KEYS = new Set(['template', 'output', 'format', 'only'])

/** 名字文法：kebab-case（插件名与模板名共用；模板名另需等于目录名）。 */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

/** 包名前缀。 */
const PACKAGE_PREFIX = 'dsh-plugin-'

/** 命令用法（`pnpm gen:plugin --help` 的固定输出，G-doc-sync 依赖此契约）。 */
const USAGE = `用法：
  pnpm gen:plugin <name> --kind host-only|dual [--template <name>] [--dry-run]

参数：
  <name>      kebab-case 插件名，不以 dsh-plugin- 开头（生成器补前缀）；目标目录必须不存在
  --kind      必填，无默认值：host-only（仅宿主半）| dual（宿主半 + 浏览器半）
  --template  模板名，缺省 ${DEFAULT_TEMPLATE}；取 templates/<name>/ 的目录名，件套清单为该目录的 template.json（--template=<name> 等价）
  --dry-run   只打印将创建的文件与内容摘要，不写盘
  --help, -h  显示本用法

示例：
  pnpm gen:plugin demo-host --kind host-only
  pnpm gen:plugin demo-dual --kind dual --template ${DEFAULT_TEMPLATE} --dry-run

退出码：0 成功；1 校验失败（名字非法 / 目录已存在 / 未知 kind / 未知模板 / 模板清单非法 / 素材缺失）；2 用法错误。`

/**
 * @typedef {object} TemplateFile
 * @property {string} template  相对模板目录的素材路径（POSIX，禁绝对路径 / `..` 段 / 反斜杠）
 * @property {string} output    相对插件目录的产物路径（约束同上，清单内不得重复）
 * @property {'manifest' | 'solution'} [format]  结构化后处理；缺省 = 占位符渲染后原样写出
 * @property {'host-only' | 'dual'} [only]       只在该 kind 生成；缺省 = 两个 kind 都生成
 *
 * @typedef {object} TemplateManifest
 * @property {string} name            模板名，必须等于目录名
 * @property {string} [description]   人读说明（仅文档用，生成器不消费）
 * @property {TemplateFile[]} files   非空，顺序即生成顺序
 */

/**
 * 列出可用模板（目录内含 `template.json` 的子目录），按名排序。
 * @returns {string[]} 模板名。
 */
function listTemplates() {
  if (!existsSync(TEMPLATE_ROOT)) return []
  return readdirSync(TEMPLATE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(TEMPLATE_ROOT, entry.name, 'template.json')))
    .map((entry) => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

/**
 * 可用模板名的展示文本（错误信息里点名合法取值）。
 * @returns {string} 以 `、` 连接的模板名；一个都没有时返回「（无）」。
 */
function availableTemplates() {
  const names = listTemplates()
  return names.length > 0 ? names.join('、') : '（无）'
}

/**
 * 校验清单里的 POSIX 相对路径（素材路径与产物路径共用）。
 * @param {string} field - 字段名（`template` / `output`）。
 * @param {unknown} value - 字段值。
 * @returns {string | null} 失败原因；合法时返回 null。
 */
function pathError(field, value) {
  if (typeof value !== 'string' || value.length === 0) return `${field} 必须是非空字符串`
  if (value.startsWith('/')) return `${field} "${value}" 不能是绝对路径`
  if (value.includes('\\')) return `${field} "${value}" 不能含反斜杠（POSIX 相对路径）`
  if (value.split('/').includes('..')) return `${field} "${value}" 不能含 ".." 段`
  return null
}

/**
 * 读取并 fail-closed 校验一个模板（清单是唯一来源，生成器不扫描目录）。
 *
 * 校验项（任一不满足即抛错 → 入口 exit 1）：模板名为 kebab-case；`templates/<name>/`
 * 存在且含 `template.json`；JSON 可解析且为对象；顶层键 ⊆ `{name, description, files}`；
 * `name` === 目录名；`files` 为非空数组；条目为对象且键 ⊆ `{template, output, format, only}`；
 * `template` / `output` 为合法 POSIX 相对路径（`output` 不重复）；`format` ∈
 * `{manifest, solution}`；`only` ∈ `{host-only, dual}`；素材文件真实存在。
 * @param {string} name - 模板名（`templates/<name>/` 的目录名）。
 * @returns {{dir: string, manifest: TemplateManifest}} 模板目录与清单。
 */
function loadTemplate(name) {
  const available = `可用模板：${availableTemplates()}`
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new Error(
      `模板名 "${String(name)}" 不是 kebab-case（小写字母开头，仅字母 / 数字 / 中划线，不含路径段；模板目录应为 templates/<name>/）；${available}`,
    )
  }
  const dir = join(TEMPLATE_ROOT, name)
  const manifestFile = join(dir, 'template.json')
  if (!existsSync(manifestFile)) {
    throw new Error(`模板不存在或缺少 templates/${name}/template.json；${available}`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  } catch (error) {
    throw new Error(
      `templates/${name}/template.json 无法解析：${error instanceof Error ? error.message : String(error)}；${available}`,
    )
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`templates/${name}/template.json 顶层必须是对象；${available}`)
  }
  for (const key of Object.keys(manifest)) {
    if (!TEMPLATE_MANIFEST_KEYS.has(key)) {
      throw new Error(`templates/${name}/template.json 含未知顶层键 "${key}"（允许 name / description / files）；${available}`)
    }
  }
  if (manifest.name !== name) {
    throw new Error(
      `templates/${name}/template.json 的 name "${String(manifest.name)}" 必须等于目录名 "${name}"；${available}`,
    )
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`templates/${name}/template.json 的 files 必须是非空数组；${available}`)
  }
  const seenOutputs = new Set()
  manifest.files.forEach((entry, index) => {
    const where = `templates/${name}/template.json 第 ${index + 1} 条`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${where}必须是对象；${available}`)
    }
    for (const key of Object.keys(entry)) {
      if (!TEMPLATE_FILE_KEYS.has(key)) {
        throw new Error(`${where}含未知键 "${key}"（允许 template / output / format / only）；${available}`)
      }
    }
    for (const field of ['template', 'output']) {
      const reason = pathError(field, entry[field])
      if (reason !== null) throw new Error(`${where}的 ${reason}；${available}`)
    }
    if (entry.format !== undefined && !FORMATS.has(entry.format)) {
      throw new Error(`${where}的 format "${String(entry.format)}" 非法（允许 manifest | solution）；${available}`)
    }
    if (entry.only !== undefined && !KINDS.has(entry.only)) {
      throw new Error(`${where}的 only "${String(entry.only)}" 非法（允许 host-only | dual）；${available}`)
    }
    if (seenOutputs.has(entry.output)) {
      throw new Error(`${where}的 output "${entry.output}" 与前面条目重复；${available}`)
    }
    seenOutputs.add(entry.output)
    const materialFile = join(dir, entry.template)
    if (!existsSync(materialFile)) {
      throw new Error(`${where}指向的模板素材缺失：${relative(REPO_ROOT, materialFile)}；${available}`)
    }
  })
  return { dir, manifest }
}

/**
 * 解析命令行参数。
 *
 * 只有「缺必需参数 / 未知参数」算用法错误（exit 2）；名字、kind 或模板名的**值**不合法
 * （含未知 kind / 未知模板）算校验失败（exit 1），与 ③.3 的退出码契约一致。
 * @param {string[]} argv - `process.argv.slice(2)`。
 * @returns {{help: boolean, name?: string, kind?: string, template: string, dryRun: boolean, usageErrors: string[]}} 解析结果（`template` 已补缺省值）。
 */
function parseArgs(argv) {
  const result = { help: false, name: undefined, kind: undefined, template: undefined, dryRun: false, usageErrors: [] }
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
    } else if (arg === '--template') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        result.usageErrors.push(`--template 缺少取值（模板名，缺省 ${DEFAULT_TEMPLATE}）`)
      } else {
        result.template = value
        index += 1
      }
    } else if (arg.startsWith('--template=')) {
      const value = arg.slice('--template='.length)
      if (value === '') result.usageErrors.push(`--template 缺少取值（模板名，缺省 ${DEFAULT_TEMPLATE}）`)
      else result.template = value
    } else if (arg.startsWith('-')) {
      result.usageErrors.push(`无法识别的参数：${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length > 1) result.usageErrors.push(`只接受一个插件名，多出：${positional.slice(1).join(' ')}`)
  if (positional.length > 0) result.name = positional[0]
  if (result.template === undefined) result.template = DEFAULT_TEMPLATE
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
 *
 * 文件枚举完全由 `loadTemplate()` 返回的清单驱动：`only` 过滤 kind，`format` 保持既有
 * 后处理语义（`manifest` / `solution`），其余按占位符渲染后原样写出。
 * @param {string} name - 插件名（不含包名前缀）。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @param {object} rootManifest - 仓库根清单。
 * @param {{dir: string, manifest: TemplateManifest}} template - `loadTemplate()` 的结果。
 * @returns {{output: string, content: string}[]} 相对插件目录的路径与内容。
 */
function buildFiles(name, kind, rootManifest, template) {
  const tokens = buildTokens(name, kind, rootManifest)
  const files = []
  for (const entry of template.manifest.files) {
    if (entry.only !== undefined && entry.only !== kind) continue
    const templateFile = join(template.dir, entry.template)
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

  const templateName = parsed.template
  let template
  try {
    template = loadTemplate(templateName)
  } catch (error) {
    process.stderr.write(`[gen:plugin] ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  let files
  try {
    files = buildFiles(parsed.name, kind, readRootManifest(), template)
  } catch (error) {
    process.stderr.write(`[gen:plugin] 生成失败：${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  const packageName = `${PACKAGE_PREFIX}${parsed.name}`
  const relativeDir = relative(REPO_ROOT, targetDir)
  if (parsed.dryRun) {
    process.stdout.write(
      `[dry-run] 将创建 ${relativeDir}/（模板 ${templateName}，kind ${kind}），共 ${files.length} 个文件：\n`,
    )
    printFileSummaries(files, relativeDir)
    printNextSteps(packageName)
    return 0
  }

  for (const file of files) {
    const absolute = join(targetDir, file.output)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, file.content)
  }
  process.stdout.write(
    `已生成 ${relativeDir}/（模板 ${templateName}，kind ${kind}，${files.length} 个文件，包名 ${packageName}）：\n`,
  )
  printFileSummaries(files, relativeDir)
  printNextSteps(packageName)
  return 0
}

process.exitCode = main(process.argv.slice(2))
