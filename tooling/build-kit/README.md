# `@dsh-plugins/build-kit`

六个软插件（`project-mcp` / `user-commands` / `zcode-plan` / `session-tool-toggle` /
`web-ux` / `workspace-config`）共用的**构建期**骨架：esbuild 宿主半、浏览器半、
CSS modules 编译、产物守卫。它把原先六份 `build.mjs` 里逐字重复的骨架收敛为单一
实现，薄入口只声明**不可从包事实推导的差异**。

- 私有包（`private: true`，`version: 0.0.0`），不发布、无 `files`；
- 只有 `lint` / `test` 两条脚本（决策 #1：它不构建自己，`pnpm -r build` 自动跳过）；
- 唯一运行时依赖是 `esbuild`；不引入任何 `@deepseek-ai/*` 依赖（AR2 前瞻）。

> **依赖版本**：全部走 `pnpm-workspace.yaml` 的 catalog——`esbuild`（dependencies）与
> `vitest` / `oxlint`（devDependencies）都是 `catalog:` 引用，本包不写字面量版本；
> 工具链册由人工升，`pnpm dsh:upgrade` 只重写 DSH 基线册，不碰这一册。

## 薄入口长什么样

```js
// plugins/zcode-plan/build.mjs（最简）
import { buildPlugin } from '@dsh-plugins/build-kit'
await buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })
```

六个包的薄入口参数（迁移后）：

| 包 | 薄入口参数 |
| --- | --- |
| project-mcp | `{ root, cjsRequireShim: true }` |
| user-commands | `{ root, hostExternals: ['@deepseek-ai/dsh-llm'], cjsRequireShim: true }` |
| zcode-plan | `{ root, cjsRequireShim: true }` |
| session-tool-toggle | `{ root, cssClassPrefix: 'stt', cjsRequireShim: true }` |
| web-ux | `{ root, cssClassPrefix: 'wux' }` |
| workspace-config | `{ root, cssClassPrefix: 'wsc' }` |

## 旋钮语义

`buildPlugin(options)` 的选项：

| 旋钮 | 类型 | 默认 | 语义 |
| --- | --- | --- | --- |
| `root` | `string` | 必填 | 调用方包目录（薄入口传 `import.meta.dirname`）；产物固定写到 `<root>/lib` |
| `hostExternals` | `string[]` | `[]` | 追加到 `['node:*']` 之后的宿主外置词。编码「哪个依赖必须与宿主共用实例」的运行时判断（如 `@deepseek-ai/dsh-llm`），**不可推导** |
| `cjsRequireShim` | `boolean` | `false` | 宿主产物是否注入真实 `require` banner。编码「产物里是否会出现 CJS `require`」的依赖图属性，**不可推导**；守卫会在「有 `__require` 无 shim」时让构建失败 |
| `clientExternals` | `string[]` | 见下 | 覆盖浏览器半默认 module-table 清单。默认 `react` / `react-dom` / `react-dom/client` / `react/jsx-runtime` / `react/jsx-dev-runtime` / `@deepseek-ai/dsh-client-ui-primitives` |
| `cssClassPrefix` | `string` | 双端必填 | 作用域类名前缀（`stt` / `wux` / `wsc`）；**保产物字节**的旋钮，迁移前后类名与 `data-dsh-css` 不变 |
| `clean` | `'auto' \| 'full' \| 'js-only'` | `'auto'` | `auto` 由 `dtsOwned` 推导：自持 d.ts 用 `js-only`（只删 `lib/index.js`、`lib/client.js`，保住 `lib/types/`），否则 `full`（整目录重建） |

`buildPlugin` 的返回值是接口断言的一部分：

```js
{ packageName, kind: 'host' | 'dual', dtsOwned, artifacts: ['lib/index.js', ...] }
```

## 从包事实推导（不引入新 manifest 键）

| 事实来源 | 推导结果 |
| --- | --- |
| `manifest.name` | `packageName`（同时是 ModuleLoader 的 `id` 与 esbuild 的诊断名） |
| `manifest.dsh.client?.platform === 'web'` | `kind = 'dual'`；入口 `<root>/src/client/index.ts` 缺失则抛错（fail-fast，不降级为 host——旧版各双端 `build.mjs` 同此语义） |
| `<root>/src/index.ts` 存在 | 宿主入口（缺则抛错——每个软插件都必须有宿主半锚点） |
| `Object.values(manifest.exports ?? {}).some(e => e.types)` | `dtsOwned = true` → `clean = 'js-only'`，否则 `'full'` |

`deriveStrategy(manifest, root = process.cwd())` 暴露同一推导（第二个参数只用于
判定入口是否存在，纯单测可传临时目录）。

## 产物字节基准

宿主半与浏览器半都把 esbuild 的 `absWorkingDir` 钉到**包目录**，而不是依赖
`process.cwd()`：esbuild 的默认值取的是模块被 import 那一刻的 cwd，钉住后「从哪个
目录触发构建」不再影响产物里 `// path` 注释的相对基准。这是迁移期能与已提交
`lib/` 逐字节比对（G1 验证）的前提，也是 `pnpm --filter <包> build` 之外直接调用
`buildPlugin` 时行为不变的原因。

## 导出

| 导出 | 说明 |
| --- | --- |
| `buildPlugin(options)` | 编排器：读包清单 → 推导 → 清理 → 宿主半 → 浏览器半（dual）→ 产物守卫 |
| `deriveStrategy(manifest, root?)` | 包事实推导（`kind` / `dtsOwned` / 入口路径） |
| `cssModuleContents({ source, relativePath, packageName, classPrefix })` | **纯函数**：CSS module → `{ contents, classMap }` |
| `cssModulesPlugin({ root, packageName, classPrefix })` | esbuild 插件：`*.module.css` 交给上面的纯函数 |
| `moduleLoaderShell({ packageName, code })` | 把 CJS bundle 包进 `window.__ModuleLoader__.load({ id, factory })` 壳 |
| `indentBlock(text, levels)` | 按制表符层级缩进（空行不加尾随空白） |
| `assertNoDynamicRequire(code, shimEnabled)` | 产物含 `__require(` 但未开 shim → 抛 F3 解释 |
| `assertNoInternalWord(code)` | 产物含 `@dsh-plugins/` → 抛错（内部包必须内联） |
| `DEFAULT_CLIENT_EXTERNALS` / `CJS_REQUIRE_BANNER` / `HOST_BASE_EXTERNALS` | 常量（外部词清单 / banner 文案 / 宿主基础外置词） |

`assertSelfContained(words, externals)` 已删除：它是无调用方的死导出（README 早先声称它由
`bundle.test.ts` / `check-artifacts.mjs` 调用，实际全仓零调用）。词集合级的自包含判据收口到
子路径 `@dsh-plugins/build-kit/artifact-contract`（下一节）——build 期没有词法器，kit 不再保留
抛出式的重复实现。

## CSS modules 的两条硬规则

1. **防重护栏固定按「包 + 模块」双维度**：`data-dsh-plugin` + `data-dsh-css`。
   只按包名查询会让同包第二个 module 的样式永不注入（v1.4.0 的 delete 样式即因此
   从未生效）；`session-tool-toggle` 目前只有 1 个 css module，所以历史 bug 不可见，
   单测把修复钉住。
2. **类名只在选择器前奏重写**：`url("./x.svg")` 与 at-rule 前奏
   （`@media (min-width: 640px)`）不会被误改。

## 产物守卫在什么时候跑

`buildPlugin` 对**每一份落盘产物**跑代码级守卫：

- 宿主半：`assertNoDynamicRequire` + `assertNoInternalWord`；
- 浏览器半：`assertNoInternalWord`（浏览器半固定 CJS 输出，不产 `__require` 壳）。

守卫失败时先删掉该产物再抛错：`lib/` 随仓库提交，不能把未过守卫的字节留在工作区。

词集合级的自包含判据**不在 build 期**（build 期没有词法器，重复实现没有增量）：
它由包内 `bundle.test.ts` 在产物落盘后对**已构建的字节**断言，见下一节。

## 产物契约断言：`@dsh-plugins/build-kit/artifact-contract`

双端插件的 `test/bundle.test.ts` 的结构层断言（ModuleLoader 壳 / require 面 / 宿主半
自包含）原先在三份测试里逐字重复；本次变更把它们收敛为子路径
`@dsh-plugins/build-kit/artifact-contract` 下的四个**无状态纯函数**：

| 函数 | 判据 | issue 文案要点 |
| --- | --- | --- |
| `loaderShellIssues({ packageName, source })` | `lib/client.js` 必须含 `window.__ModuleLoader__.load({`、`id: "<packageName>"`、`factory: (require) => {` 三条字面量标记 | 点名缺哪一条标记 |
| `requireSurfaceIssues({ packageName, expected, required, imported })` | `required` 与 `expected` **精确集合相等**；`imported` 无 `node:*`；`imported` 无包名子串（自引用） | 分别报「多余/缺失」「node: 泄漏」「自引用」 |
| `hostSelfContainmentIssues({ packageName, words, externals = ['node:*'] })` | 宿主半（`lib/index.js`）模块词都能被「内建 / 相对块 / 外部词」覆盖——`selfContainmentIssues` 判据 + 包名/产物名前缀 | 列出未覆盖词（去重） |
| `selfContainmentIssues({ words, externals })` | 低层原语：相对块恒合法；`node:*` 需命中 externals；裸内建名仅当 externals 含 `node:*`；通配与包名子路径匹配 | 保留原 `assertSelfContained` 的三段失败文案 |

约定：入参是**词数组**（由 `scripts/lib/artifacts.mjs` 的词法器产出，R9 单源），出参是
issue 列表——空数组 = 通过；每条 issue 自带包名、产物名与期望/实际，失败时不需要调用方
再拼上下文。`selfContainmentIssues` 是低层原语（无包名），保留原 `assertSelfContained` 的
失败文案；需要身份前缀时用 `hostSelfContainmentIssues`。

消费形态（三份 `test/bundle.test.ts` 的结构层断言；INLINED/ABSENT 标记、css 注入器计数、
座位字面量等包独有断言仍留包内）：

```ts
expect(loaderShellIssues({ packageName: PACKAGE_NAME, source })).toEqual([])
expect(requireSurfaceIssues({
  packageName: PACKAGE_NAME,
  expected: CLIENT_REQUIRES,
  required: requiredWords(source),
  imported: importedWords(source),
})).toEqual([])
expect(hostSelfContainmentIssues({
  packageName: PACKAGE_NAME,
  words: importedWords(readArtifact(ROOT, 'index.js')),
})).toEqual([])
```

纪律：本模块是纯 `.mjs`、零依赖（只用 `node:module` 的 `isBuiltin`）、**不读盘**、不 import
vitest、不 import `scripts/lib`——词法仍是 `scripts/lib/artifacts.mjs` 的单一实现，kit 不反向
import（R6 / R9）。正面与负面用例在 `test/artifact-contract.test.mjs`（壳缺标记、词集多一少一、
`node:` 泄漏、自引用、未覆盖词、文案片段不误判各有用例）。

## 什么不该进 kit

| 不属于这里 | 归属 |
| --- | --- |
| 多入口 / 多 format / 代码分块 / `tsdown` 路线（`multi-root-workspace`） | 该包自己的 `tsc + tsdown` 构建（C2：不纳入统一构建）；不迁移的理由与未来迁移通过标准见[评估档案](../../docs/assessments/multi-root-build-unification.md) |
| 运行期共享源码（归属内核、watcher、日志、根集合） | `tooling/host-kit`（TS，被 esbuild 内联） |
| 测试夹具底座（ui-primitives 并集、locale-parity） | `tooling/test-kit` |
| 座位契约**类型**（`WorkspaceConfigSectionSeat` 等） | `tooling/contracts`（纯类型包） |
| 发布 / 版本同步 / tag | `scripts/release.mjs` |
| 依赖版本目录（catalog） | `pnpm-workspace.yaml`（G2） |
| 某个包的私有构建分支 | 不要加旋钮——先证明它是**包事实**，否则留在该包的薄入口之外 |

判据：**构建期死代码且六包语义一致**才进 kit；任何 per-package 语义分叉都应该
回到调用点，而不是在共享包里写 `if (packageName === …)`。

## 自测

```bash
pnpm --filter @dsh-plugins/build-kit test   # css 双模块去重 / 壳形状 / 守卫四格 / 产物契约正面+负面
pnpm --filter @dsh-plugins/build-kit lint
```

单测全部是纯函数调用或临时目录里的 esbuild 小 fixture，不触碰本仓任何插件产物。
