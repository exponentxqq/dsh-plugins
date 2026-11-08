# `templates/default/` —— `pnpm gen:plugin` 的缺省模板（**不是包**）

本目录是 `pnpm gen:plugin` 的缺省件套（`--template` 不写时即选它），目录本身**不是 workspace 包**
（插件清单素材叫 `package.json.tmpl`，生成器只写文件、不跑 git / pnpm）。跨模板的通用约定——目录结构、
目录命名规则、清单 schema、生成器参数与退出码、版本事实来源——见
[`templates/README.md`](../README.md)。

## 件套表

下表即 `ls -R templates/default/` 的逐个对应（13 个文件 + 自述清单 `template.json`）；
「生成物」列由 `template.json` 的 `output` 定义，`—` 表示不进入生成物。

| 模板文件 | 生成物 | 说明 |
| --- | --- | --- |
| `template.json` | —（自身清单） | 12 条目件套清单：`template` / `output` / `format?` / `only?`；顺序即生成顺序，本表与它逐条对应 |
| `package.json.tmpl` | `package.json` | 只含结构与 `catalog:` / `workspace:*` 引用；`version` 取仓库根 `package.json#version`，`engines.node` 取根 `engines.node`，`dsh.engines.dsh` 与 DSH peer 由 `scripts/dsh-baseline.mjs` 的 `softDshRange()` 现取现派生（`only: dual` 时补 `exports["./client"]`、`dsh.client`、`test-kit` devDep 与双 `tsc -p` 的 `typecheck`）。`dtsOwned`（声明产物归属）是**手工项**：需要 `.d.ts` 的 dual 包自行在 manifest / tsconfig 里声明 `exports[*].types` 与 `declaration`，`gen:plugin` 不生成 |
| `cordis.patch.yml` | `cordis.patch.yml` | 裸包名 insert 行 + 头注释模板 |
| `build.mjs` | `build.mjs` | `@dsh-plugins/build-kit` 薄入口（AR4 形态）；`dual` 时补 `cssClassPrefix`（由插件名各分段首字母派生，可手改——它是保产物字节的旋钮，`build-kit` 对双端插件必填） |
| `tsconfig.json` | `tsconfig.json` | 只汇总 `references` 的 solution；`dual` 形态把 `tsconfig.client.json` 加进 references |
| `tsconfig.host.json` | `tsconfig.host.json` | 宿主半 tsconfig：只 `extends` 根基准 `tsconfig.plugin.base.json` |
| `tsconfig.client.json` | `tsconfig.client.json` | 浏览器半 tsconfig：只 `extends` 根基准，`include` = `src/client` + `test/**/*.tsx` + `test/stubs/**/*.tsx`（N8：dual 的组件测试与 primitives 替身进类型检查，否则新写的第一份组件测试永不被 `tsc` 检查）；仅 `dual` 生成 |
| `vitest.config.ts` | `vitest.config.ts` | 测试配置薄声明（3 行）：只 import `@dsh-plugins/test-kit/vitest` 的工厂并 `export default defineWebTestConfig({ root: import.meta.dirname })`——node 环境、`esbuild.jsx: 'automatic'` 与 primitives alias 接缝都固定在工厂里；仅 `dual` 生成（host-only 没有浏览器半，vitest 缺省 include 已覆盖 `test/smoke.test.ts`） |
| `src/index.ts` | `src/index.ts` | 宿主半入口（`name` / `inject` / `apply` 三件套） |
| `src/client/index.ts` | `src/client/index.ts` | 浏览器半入口；仅 `dual` 生成 |
| `test/smoke.test.ts` | `test/smoke.test.ts` | 包形状 + 产物形状（ModuleLoader 壳 / 自包含）；产物断言需先 build |
| `test/stubs/ui-primitives.tsx` | `test/stubs/ui-primitives.tsx` | `@deepseek-ai/dsh-client-ui-primitives` 的测试替身薄入口：一行 `export * from '@dsh-plugins/test-kit/ui-primitives'`（并集实现在 test-kit；本包独有形状用 re-export + 具名覆盖）；仅 `dual` 生成 |
| `plugin-README.md.tmpl` | `README.md` | 插件 README **骨架全集**：4 必备实节（`## 定位` 首行 `端性：…` / `## 安装到 profile` / `## 构建与测试` / `## 许可`）+ 5 类「如适用」HTML 注释 + `## 结构` 自由节；两个端性 token 由 `buildTokens()` 无条件注入（见下节）。「如适用」只以注释承载、不生成空节——空壳节会被文档门禁判红（模板自述不复用为插件 README） |
| `README.md` | —（本文件） | 模板自述：件套表与两条硬约束，不进入生成物 |

## README 骨架的两个 token

`plugin-README.md.tmpl` 里的端性部分由 `scripts/gen-plugin.mjs` 的 `buildTokens()` **无条件**注入
（`render()` 是逐 token 字面替换、没有 fail-closed：缺键不会报错，只会把占位符原样留在生成物里）：

| token | `--kind dual` | `--kind host-only` |
| --- | --- | --- |
| `{{ENDNESS}}` | `双端` | `host-only` |
| `{{DUAL_SECTION}}` | `## 双端结构` 整节（标题 + 双端说明占位正文），落在 `## 结构` 之后 | 空串——整行消失，生成物无 `## 双端结构` 节（端性闭环） |

骨架形态 = 4 个必备实节（`## 定位` 首行 `端性：…` / `## 安装到 profile` / `## 构建与测试` /
`## 许可`）+ 5 类「如适用」HTML 注释（`## 配置` / `## 双端结构` / `## 已知限制`·`## 排障` /
`## 非目标` / `## 与其他插件的关系`）+ 1 个自由节（`## 结构`）；注释对人可见、对文档门禁不可见，
所以「提醒但不强制」不会产出空壳节。

## 两条硬约束

1. **清单唯一来源**：本模板的件套清单只在 `template.json`——生成器不扫描目录，`--dry-run` 的输出
   与真实写入因此逐条一致；新增 / 改名 / 删除模板文件必须同批改清单，缺文件或未知键由
   `loadTemplate()` fail-closed 拒绝。
2. **生成物开箱即绿**：本模板生成的骨架开箱通过 `lint / typecheck / build / test` 与
   `pnpm dsh:check`，插件 README 生成即符合文档骨架（4 必备节 + 端性声明闭环）；改动件套后
   须用 `host-only` 与 `dual` 两种 kind 各演练一次，并让生成物过 `pnpm docs:check`
   （`--dry-run` 看文件表 + 真实生成跑一遍全链）。
