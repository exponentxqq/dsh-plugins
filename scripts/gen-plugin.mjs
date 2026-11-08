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
 * - 构建入口是 `@dsh-plugins/build-kit` 的薄入口，tsconfig 只 `extends` 根基准；
 * - 插件 README 是骨架全集（4 必备实节 + 5 类「如适用」HTML 注释 + `## 结构` 自由节）：
 *   端性声明行与 `## 双端结构` 节分别由 `ENDNESS` / `DUAL_SECTION` 两个 token 按 `--kind`
 *   **无条件**注入（`render()` 是逐 token 字面替换、没有 fail-closed，host-only 的
 *   `DUAL_SECTION` 必须是空串，否则生成物残留占位符字面量）。
 *
 * 本脚本**只写文件，不跑 git / pnpm**；写完打印 5 步后续命令。目标目录必须不存在，
 * 避免覆盖任何已有插件。
 *
 * 另有只读模式 `--check`：不生成插件，复用同一渲染路径（`buildTokens` → `buildFiles` →
 * `finalizeManifest`）产出每个软插件的期望 manifest，再与磁盘上的
 * `plugins/<name>/package.json` 按「规范键集合」逐键对账（契约见 residual-convergence
 * code-design ③.4）。无白名单文件、任何差异即失败（D10），因此模板与真实包不会双源漂移。
 *
 * 退出码：0 成功（`--check` 为全部一致）；1 校验失败（名字非法 / 目录已存在 / 未知 kind /
 * 未知模板 / 模板清单非法 / 素材缺失 / `--check` 发现差异）；2 用法错误（缺必需参数、未知 flag、
 * `--template` 缺值、`--check` 与 `--dry-run` 同给）。
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
  pnpm gen:plugin --check [--template <name>]

参数：
  <name>      kebab-case 插件名，不以 dsh-plugin- 开头（生成器补前缀）；目标目录必须不存在
  --kind      必填，无默认值：host-only（仅宿主半）| dual（宿主半 + 浏览器半）
  --template  模板名，缺省 ${DEFAULT_TEMPLATE}；取 templates/<name>/ 的目录名，件套清单为该目录的 template.json（--template=<name> 等价）
  --dry-run   只打印将创建的文件与内容摘要，不写盘
  --check     只读对账：不生成插件，逐个核对全部软插件的 package.json 与模板渲染出的 manifest 形态是否一致
              （不接受 <name> / --kind，形态由各包 dsh.client.platform 判定；与 --dry-run 互斥）
  --help, -h  显示本用法

示例：
  pnpm gen:plugin demo-host --kind host-only
  pnpm gen:plugin demo-dual --kind dual --template ${DEFAULT_TEMPLATE} --dry-run
  pnpm gen:plugin --check

退出码：0 成功（--check 为全部一致）；1 校验失败（名字非法 / 目录已存在 / 未知 kind / 未知模板 / 模板清单非法 / 素材缺失 / --check 发现差异）；2 用法错误。`

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
 * 只有「缺必需参数 / 未知参数 / `--check` 与生成参数混用」算用法错误（exit 2）；名字、kind
 * 或模板名的**值**不合法（含未知 kind / 未知模板）算校验失败（exit 1），与 ③.3 的退出码契约一致。
 *
 * `--check` 是只读模式，与生成参数互斥：它不接受 `<name>` / `--kind`（形态由各包
 * `dsh.client.platform` 判定），并与 `--dry-run` 同给即用法错误（两个只读模式二选一）。
 * @param {string[]} argv - `process.argv.slice(2)`。
 * @returns {{help: boolean, check: boolean, name?: string, kind?: string, template: string, dryRun: boolean, usageErrors: string[]}} 解析结果（`template` 已补缺省值）。
 */
function parseArgs(argv) {
  const result = {
    help: false,
    check: false,
    name: undefined,
    kind: undefined,
    template: undefined,
    dryRun: false,
    usageErrors: [],
  }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--check') {
      result.check = true
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
  if (result.check) {
    if (result.dryRun) {
      result.usageErrors.push('--check 与 --dry-run 互斥：两者都是只读模式，同一命令只能选一种')
    }
    if (result.name !== undefined) {
      result.usageErrors.push(`--check 不接受插件名（收到 "${result.name}"）：它按 plugins/* 枚举全部软插件对账`)
    }
    if (result.kind !== undefined) {
      result.usageErrors.push(`--check 不接受 --kind（收到 "${result.kind}"）：形态由各包的 dsh.client.platform 判定`)
    }
  }
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
 *
 * 件套按 kind 分化（与 `template.json` 的 `only` 逐条对应）：`vitest.config.ts` 与
 * `test/stubs/ui-primitives.tsx` 只出现在 dual——host-only 没有浏览器半，既不需要
 * primitives 替身，也不需要工厂测试配置（vitest 缺省 include 已覆盖 `test/smoke.test.ts`）。
 * @param {boolean} dual - 是否双端形态。
 * @returns {string} 目录树文本。
 */
function structureTree(dual) {
  const lines = [
    'src/index.ts                  宿主半入口：导出 name / inject / apply',
  ]
  if (dual) lines.push('src/client/index.ts           浏览器半入口：座位 / 事件桥从这里开始')
  lines.push('test/smoke.test.ts            包形状 + 产物形状冒烟（产物断言需先 build）')
  if (dual) {
    lines.push('test/stubs/ui-primitives.tsx  primitives 测试替身（一行 re-export 到 test-kit）')
  }
  lines.push(
    'build.mjs                     薄构建入口（策略在 @dsh-plugins/build-kit）',
    'cordis.patch.yml              bundle 注册行（裸包名 insert）',
    'tsconfig.host.json            宿主工程（只 extends 根基准）',
  )
  if (dual) lines.push('tsconfig.client.json          浏览器工程（只 extends 根基准）')
  lines.push(
    `tsconfig.json                 solution 文件（${dual ? '两个工程' : '宿主工程'}的汇总，IDE 用）`,
  )
  if (dual) lines.push('vitest.config.ts              测试配置（工厂薄声明，node 环境）')
  lines.push(
    `package.json                  清单：dsh.bundle.patch${dual ? ' / dsh.client' : ''} / 脚本 / catalog 依赖`,
    'README.md                     本文件',
  )
  return lines.join('\n')
}

/**
 * `{{DUAL_SECTION}}` 的 dual 取值：`## 双端结构` 整节（标题 + 占位正文）。
 *
 * 骨架全集的端性闭环（`docs/decisions/ADR-0003-doc-system-layers-and-gates.md` §2、
 * residual-convergence code-design ③.5 细则 3）：声明 `双端` 时本节必备，声明
 * `host-only` 时不得出现。模板里只留一行占位符，节内容由生成器按 kind 注入：
 * `render()` 是逐 token 字面替换、没有 fail-closed，故 host-only 必须传空串，
 * 否则生成物会残留 `{{DUAL_SECTION}}` 字面量。
 * @type {string}
 */
const DUAL_SECTION_TEXT = [
  '## 双端结构',
  '',
  '本包为**双端**形态：宿主半（`src/`，Node 侧服务 / 事件 / 命令）与浏览器半（`src/client/`，',
  'Web 侧座位与渲染）分目录实现，两半由 `package.json` 的 `dsh.client.platform: web` 声明与',
  '同一行裸包名 insert 行同装（丢裸包名行 = 浏览器半静默消失）。',
  '',
  '- 宿主半入口 `src/index.ts`：导出 `name` / `inject` / `apply`，承载宿主侧逻辑；',
  '- 浏览器半入口 `src/client/index.ts`：座位注册与事件桥，产物为 `lib/client.js`；',
  '- 两半的分工、座位契约与事件桥细节写在这里（占位，按真实实现补全）。',
].join('\n')

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
 *
 * `ENDNESS` / `DUAL_SECTION` 是骨架全集的端性闭环，**无条件**出现在返回值里：`render()`
 * 是逐 token 字面替换、未提供的 token 不报错而原样残留，故 host-only 也必须拿到
 * `DUAL_SECTION: ''`（空串渲染后该行消失）而不是缺键。
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
    ENDNESS: kindLabel,
    DESCRIPTION: `DSH 插件（${kindLabel}）：${name} —— 请替换为定位与能力的一句话说明。`,
    VERSION: rootManifest.version,
    NODE_RANGE: rootManifest.engines.node,
    DSH_RANGE: softDshRange(),
    CSS_CLASS_PREFIX_OPTION: dual ? `, cssClassPrefix: '${cssClassPrefix(name)}'` : '',
    CLIENT_TSCONFIG_NOTE: dual ? ' / tsconfig.client.json' : '',
    TYPECHECK_CLIENT: dual ? ' && tsc -p tsconfig.client.json --pretty false' : '',
    BUILD_CLIENT: dual ? ' + lib/client.js' : '',
    STRUCTURE_TREE: structureTree(dual),
    DUAL_SECTION: dual ? DUAL_SECTION_TEXT : '',
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

// ---------------------------------------------------------------------------
// --check：manifest 形态对账（residual-convergence code-design ③.4）
// ---------------------------------------------------------------------------

/** DSH 元数据约定的图标文件名：manifest 的 `icon` 字段必须指向包内真实文件。 */
const ICON_FILE = 'icon.svg'

/** 类型产物 glob：只有 `dtsOwned` 包声明（模板里对其它包是无害空集）。 */
const DTS_GLOB = 'lib/**/*.d.ts'

/** `dtsOwned` 包的浏览器半类型入口（`exports["./client"].types`）。 */
const CLIENT_TYPES_EXPORT = './lib/types/client/index.d.ts'

/**
 * 列出参与对账的软插件目录。
 *
 * 判定与 AR3 同源：`plugins/*` 下没有精确契约文件 `src/compat/dsh-version.ts` 的包即软插件
 * （multi-root 是唯一硬插件，不参与对账）。
 * @returns {{dir: string, dirName: string}[]} 目录绝对路径与目录名，按目录名排序。
 */
function listSoftPlugins() {
  if (!existsSync(PLUGINS_ROOT)) return []
  return readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PLUGINS_ROOT, entry.name, 'package.json')))
    .filter((entry) => !existsSync(join(PLUGINS_ROOT, entry.name, 'src', 'compat', 'dsh-version.ts')))
    .map((entry) => ({ dir: join(PLUGINS_ROOT, entry.name), dirName: entry.name }))
    .sort((left, right) => (left.dirName < right.dirName ? -1 : left.dirName > right.dirName ? 1 : 0))
}

/**
 * 判断包是否自己拥有类型产物（`exports[*].types` 存在）。
 *
 * 与 `scripts/check-architecture.mjs` 的 AR3 推导、`build-kit` 的 `dtsOwned` 同源：
 * 拥有 d.ts 的包（当前只有 workspace-config）才声明 `files` 里 `lib/**` 目录的 `*.d.ts`，
 * 并带 `exports["./client"].types`。
 * @param {object} manifest - 包清单。
 * @returns {boolean} 是否存在任意 `types` 导出。
 */
function hasOwnTypeExports(manifest) {
  let found = false
  /**
   * 递归扫描 `exports` 的任意层级。
   * @param {unknown} value - 当前节点。
   */
  const walk = (value) => {
    if (found || value === null || typeof value !== 'object') return
    if (typeof value.types === 'string') {
      found = true
      return
    }
    for (const nested of Object.values(value)) walk(nested)
  }
  walk(manifest.exports)
  return found
}

/**
 * 判断是否为普通对象（`null` / 数组 / 基本类型都不算）。
 * @param {unknown} value - 待判定值。
 * @returns {boolean} 是否为普通对象。
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 递归按键排序的 JSON 文本：只用于深比较，与对象键序无关。
 * @param {unknown} value - 任意 JSON 值（`undefined` 表示该层键不存在）。
 * @returns {string} 规范化文本。
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/**
 * 值的可读写法（`undefined` 表示该层键不存在，用 `fallback` 点明缺失语义）。
 * @param {unknown} value - 键值。
 * @param {string} fallback - `undefined` 时的展示文本。
 * @returns {string} 展示文本。
 */
function describeValue(value, fallback) {
  return value === undefined ? fallback : JSON.stringify(value)
}

/**
 * 比对一条键路径并把差异收进 `issues`（空差异不入账）。
 * @param {string[]} issues - 差异收集器。
 * @param {string} packageName - 包名（错误行前缀）。
 * @param {string} keyPath - 键路径（如 `exports["./src/*"]`）。
 * @param {unknown} expected - 期望值（`undefined` = 期望不存在）。
 * @param {unknown} actual - 实际值（`undefined` = 实际缺失）。
 */
function pushIssue(issues, packageName, keyPath, expected, actual) {
  if (expected === undefined && actual === undefined) return
  if (canonicalJson(expected) === canonicalJson(actual)) return
  issues.push(
    `${packageName}: ${keyPath} 期望 ${describeValue(expected, '（不存在）')}，实际 ${describeValue(actual, '（缺失）')}`,
  )
}

/**
 * 复用生成路径渲染一个插件的期望 manifest。
 *
 * 期望值来自 `buildFiles()` 产出的 `package.json`（内部即 `buildTokens` → 模板占位符渲染 →
 * `finalizeManifest`），不另造第二份渲染逻辑：模板改了，对账口径自动跟着改。
 * @param {string} name - 插件名（包名去掉 `dsh-plugin-` 前缀）。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @param {object} rootManifest - 仓库根清单。
 * @param {{dir: string, manifest: TemplateManifest}} template - 已加载的模板。
 * @returns {object} 期望的 `package.json` 解析结果。
 */
function renderExpectedManifest(name, kind, rootManifest, template) {
  const manifestFile = buildFiles(name, kind, rootManifest, template).find((file) => file.output === 'package.json')
  if (manifestFile === undefined) {
    throw new Error(`模板 ${template.manifest.name} 没有产出 package.json（缺 output 为 package.json 的 manifest 条目）`)
  }
  return JSON.parse(manifestFile.content)
}

/**
 * 核对一个插件的清单形态（规范键集合，见 code-design ③.4 表）。
 *
 * 比较面只有规范键路径：`type` / `main` / `license` / `exports` 各子路径 /
 * `dsh.bundle.patch` / `dsh.engines.dsh` / `dsh.client.platform`（dual）/
 * `peerDependencies["@deepseek-ai/dsh"]` / `files`；`version` / `description` /
 * `devDependencies` / `scripts` / `dsh.client.inject` / 额外 peer 等逐包天然不同的键不比较。
 * `exports` 是例外：子路径按**并集**逐条比较，多出的子路径（如已删的 `"./src/*"`）同样失败
 * （D10：无白名单，任何差异即失败）。
 *
 * 三条 conditional（N11）以集合形态落地：icon 存在 ⇒ `icon.svg` 进期望 `files` 且文件真实存在；
 * `dtsOwned` ⇒ `lib/**` 下的 `*.d.ts` 进期望 `files`、`exports["./client"].types` 有期望值；
 * dual ⇒ 期望 manifest 带 `exports["./client"]`（实际缺失即差异）。
 * @param {string} packageName - 包名。
 * @param {object} actual - 磁盘上的 `package.json`。
 * @param {object} expected - 模板渲染出的期望 manifest。
 * @param {string} dir - 插件目录（icon 文件存在性用）。
 * @param {'host-only' | 'dual'} kind - 插件形态。
 * @returns {string[]} 差异行（空数组 = 一致）。
 */
function manifestShapeIssues(packageName, actual, expected, dir, kind) {
  const issues = []
  const dtsOwned = hasOwnTypeExports(actual)
  const hasIcon = actual.icon !== undefined

  // 规范键：顶层三项；dsh 与 DSH peer 的期望值由模板渲染产物现取（版本范围因此仍来自 dsh-baseline.mjs）。
  pushIssue(issues, packageName, 'type', expected.type, actual.type)
  pushIssue(issues, packageName, 'main', expected.main, actual.main)
  pushIssue(issues, packageName, 'license', expected.license, actual.license)
  pushIssue(issues, packageName, 'dsh.bundle.patch', expected.dsh?.bundle?.patch, actual.dsh?.bundle?.patch)
  pushIssue(issues, packageName, 'dsh.engines.dsh', expected.dsh?.engines?.dsh, actual.dsh?.engines?.dsh)
  if (kind === 'dual') {
    pushIssue(issues, packageName, 'dsh.client.platform', expected.dsh?.client?.platform, actual.dsh?.client?.platform)
  } else if (actual.dsh?.client !== undefined) {
    pushIssue(issues, packageName, 'dsh.client', undefined, actual.dsh.client)
  }
  pushIssue(
    issues,
    packageName,
    'peerDependencies["@deepseek-ai/dsh"]',
    expected.peerDependencies?.['@deepseek-ai/dsh'],
    actual.peerDependencies?.['@deepseek-ai/dsh'],
  )

  // exports：按子路径并集比较（键序无关）；dtsOwned 的类型入口是手工项，补进期望值。
  const expectedExports = {}
  if (isPlainObject(expected.exports)) Object.assign(expectedExports, expected.exports)
  if (kind === 'dual' && dtsOwned && isPlainObject(expectedExports['./client'])) {
    expectedExports['./client'] = { ...expectedExports['./client'], types: CLIENT_TYPES_EXPORT }
  }
  const actualExports = isPlainObject(actual.exports) ? actual.exports : {}
  const subpaths = [...new Set([...Object.keys(expectedExports), ...Object.keys(actualExports)])].sort()
  for (const subpath of subpaths) {
    pushIssue(
      issues,
      packageName,
      `exports[${JSON.stringify(subpath)}]`,
      expectedExports[subpath],
      actualExports[subpath],
    )
  }

  // files：只比集合形态（数组字面量集合相等），不断言 glob 命中的实体文件存在。
  const expectedFiles = new Set(Array.isArray(expected.files) ? expected.files : [])
  if (dtsOwned) expectedFiles.add(DTS_GLOB)
  else expectedFiles.delete(DTS_GLOB)
  if (hasIcon) expectedFiles.add(ICON_FILE)
  else expectedFiles.delete(ICON_FILE)
  const expectedFileList = [...expectedFiles].sort()
  if (!Array.isArray(actual.files)) {
    pushIssue(issues, packageName, 'files', expectedFileList, actual.files)
  } else {
    pushIssue(issues, packageName, 'files', expectedFileList, [...actual.files].sort())
  }

  // N11：icon 是条件事实而不是白名单例外——有 icon 就必须指向包内真实文件（否则 DSH 元数据读取抛错）。
  if (hasIcon && typeof actual.icon !== 'string') {
    pushIssue(issues, packageName, 'icon', '包内相对文件路径', actual.icon)
  } else if (hasIcon && !existsSync(join(dir, actual.icon))) {
    issues.push(`${packageName}: icon 期望 文件 "${actual.icon}" 存在，实际 缺失`)
  }
  return issues
}

/**
 * `--check` 入口：逐个软插件对账（无白名单，任一差异即 exit 1）。
 * @param {string} templateName - 对账基准模板名（缺省 `default`）。
 * @returns {number} 退出码：0 全部一致；1 有差异或无法渲染。
 */
function runCheck(templateName) {
  let template
  try {
    template = loadTemplate(templateName)
  } catch (error) {
    process.stderr.write(`[gen-plugin] ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  const hasManifestEntry = template.manifest.files.some(
    (entry) => entry.output === 'package.json' && entry.format === 'manifest',
  )
  if (!hasManifestEntry) {
    process.stderr.write(
      `[gen-plugin] 模板 ${templateName} 没有 output 为 package.json 的 manifest 条目，无法对账\n`,
    )
    return 1
  }
  const rootManifest = readRootManifest()
  const plugins = listSoftPlugins()
  if (plugins.length === 0) {
    process.stderr.write('[gen-plugin] 没有发现任何软插件（plugins/* 下没有 package.json）\n')
    return 1
  }

  const issues = []
  for (const plugin of plugins) {
    let actual
    try {
      actual = JSON.parse(readFileSync(join(plugin.dir, 'package.json'), 'utf8'))
    } catch (error) {
      issues.push(
        `${plugin.dirName}: package.json 期望 可解析的 JSON，实际 ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
    const packageName = typeof actual.name === 'string' && actual.name.length > 0 ? actual.name : plugin.dirName
    if (!packageName.startsWith(PACKAGE_PREFIX)) {
      issues.push(
        `${packageName}: name 期望 以 "${PACKAGE_PREFIX}" 前缀开头（生成器按去前缀后的名字渲染模板），实际 "${packageName}"`,
      )
      continue
    }
    const shortName = packageName.slice(PACKAGE_PREFIX.length)
    const nameError = validateName(shortName)
    if (nameError !== null) {
      issues.push(
        `${packageName}: name 期望 dsh-plugin-<kebab-case>（生成器按此名渲染模板），实际 "${packageName}"：${nameError}`,
      )
      continue
    }
    const kind = actual.dsh?.client?.platform === 'web' ? 'dual' : 'host-only'
    let expected
    try {
      expected = renderExpectedManifest(shortName, kind, rootManifest, template)
    } catch (error) {
      issues.push(
        `${packageName}: 期望 manifest 渲染失败（${error instanceof Error ? error.message : String(error)}）`,
      )
      continue
    }
    issues.push(...manifestShapeIssues(packageName, actual, expected, plugin.dir, kind))
  }

  if (issues.length > 0) {
    for (const issue of issues) console.error(issue)
    return 1
  }
  console.log(`[gen-plugin] ${plugins.length} 个软插件的 manifest 与模板形态一致`)
  return 0
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
  if (parsed.check) return runCheck(parsed.template)
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
