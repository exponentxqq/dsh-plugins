# `templates/default/` —— `pnpm gen:plugin` 的缺省模板（**不是包**）

本目录是 `pnpm gen:plugin` 的缺省件套（`--template` 不写时即选它），目录本身**不是 workspace 包**
（插件清单素材叫 `package.json.tmpl`，生成器只写文件、不跑 git / pnpm）。跨模板的通用约定——目录结构、
目录命名规则、清单 schema、生成器参数与退出码、版本事实来源——见
[`templates/README.md`](../README.md)。

## 件套表

下表即 `ls -R templates/default/` 的逐个对应（12 个文件 + 自述清单 `template.json`）；
「生成物」列由 `template.json` 的 `output` 定义，`—` 表示不进入生成物。

| 模板文件 | 生成物 | 说明 |
| --- | --- | --- |
| `template.json` | —（自身清单） | 11 条目件套清单：`template` / `output` / `format?` / `only?`；顺序即生成顺序，本表与它逐条对应 |
| `package.json.tmpl` | `package.json` | 只含结构与 `catalog:` / `workspace:*` 引用；`version` 取仓库根 `package.json#version`，`engines.node` 取根 `engines.node`，`dsh.engines.dsh` 与 DSH peer 由 `scripts/dsh-baseline.mjs` 的 `softDshRange()` 现取现派生（`only: dual` 时补 `exports["./client"]`、`dsh.client`、`test-kit` devDep 与双 `tsc -p` 的 `typecheck`） |
| `cordis.patch.yml` | `cordis.patch.yml` | 裸包名 insert 行 + 头注释模板 |
| `build.mjs` | `build.mjs` | `@dsh-plugins/build-kit` 薄入口（AR4 形态）；`dual` 时补 `cssClassPrefix`（由插件名各分段首字母派生，可手改——它是保产物字节的旋钮，`build-kit` 对双端插件必填） |
| `tsconfig.json` | `tsconfig.json` | 只汇总 `references` 的 solution；`dual` 形态把 `tsconfig.client.json` 加进 references |
| `tsconfig.host.json` | `tsconfig.host.json` | 宿主半 tsconfig：只 `extends` 根基准 `tsconfig.plugin.base.json` |
| `tsconfig.client.json` | `tsconfig.client.json` | 浏览器半 tsconfig：只 `extends` 根基准；仅 `dual` 生成 |
| `vitest.config.ts` | `vitest.config.ts` | node 环境 + 测试组；jsdom 按用例文件头开启 |
| `src/index.ts` | `src/index.ts` | 宿主半入口（`name` / `inject` / `apply` 三件套） |
| `src/client/index.ts` | `src/client/index.ts` | 浏览器半入口；仅 `dual` 生成 |
| `test/smoke.test.ts` | `test/smoke.test.ts` | 包形状 + 产物形状（ModuleLoader 壳 / 自包含）；产物断言需先 build |
| `plugin-README.md.tmpl` | `README.md` | 插件 README 骨架（显式占位；模板自述不复用为插件 README） |
| `README.md` | —（本文件） | 模板自述：件套表与两条硬约束，不进入生成物 |

## 两条硬约束

1. **清单唯一来源**：本模板的件套清单只在 `template.json`——生成器不扫描目录，`--dry-run` 的输出
   与真实写入因此逐条一致；新增 / 改名 / 删除模板文件必须同批改清单，缺文件或未知键由
   `loadTemplate()` fail-closed 拒绝。
2. **生成物开箱即绿**：本模板生成的骨架开箱通过 `lint / typecheck / build / test` 与
   `pnpm dsh:check`；改动件套后须用 `host-only` 与 `dual` 两种 kind 各演练一次
   （`--dry-run` 看文件表 + 真实生成跑一遍全链）。
