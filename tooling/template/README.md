# `tooling/template/` —— `pnpm gen:plugin` 的模板素材（**不是包**）

这个目录**不是 workspace 包**：清单文件故意叫 `package.json.tmpl` 而不是 `package.json`，
所以 `pnpm install` / `pnpm -r` 永远不会把它当成包。`pnpm-workspace.yaml` 的 `packages`
也刻意逐条列 `tooling/<name>`、不用 `tooling/*`——`dsh:check` 两侧共同守着这件事：
AR7 管 `packages` 清单（`tooling/template` 不得出现），AR2 的 tooling 包扫描管
「这个目录里不得出现真 `package.json`」。

## 与 `pnpm gen:plugin` 的关系

`scripts/gen-plugin.mjs`（`pnpm gen:plugin <name> --kind host-only|dual`）读取本目录，
把 `{{…}}` 占位符替换后写到 `plugins/<name>/`。生成器只写文件，**不跑 git / pnpm**；
写完打印 5 步后续命令（install → lint → typecheck → build+test → dsh:check）。

| 模板文件 | 生成物 | 说明 |
| --- | --- | --- |
| `package.json.tmpl` | `package.json` | 只含结构与 `catalog:` / `workspace:*` 引用；`version` 取仓库根 `package.json#version`，`engines.node` 取根 `engines.node`，`dsh.engines.dsh` 与 DSH peer 由 `scripts/dsh-baseline.mjs` 的 `softDshRange()` 现取现派生（`--kind dual` 时补 `exports["./client"]`、`dsh.client`、`test-kit` devDep 与双 `tsc -p` 的 `typecheck`） |
| `build.mjs` | `build.mjs` | `@dsh-plugins/build-kit` 薄入口（AR4 形态）；`--kind dual` 时补 `cssClassPrefix`（由插件名各分段首字母派生，可手改——它是保产物字节的旋钮，`build-kit` 对双端插件必填） |
| `tsconfig.host.json` / `tsconfig.client.json` / `tsconfig.json` | 同名文件 | 两个子工程只 `extends` 根基准（`tsconfig.json` 是只汇总 references 的 solution）；`tsconfig.client.json` 仅 `dual` 生成 |
| `vitest.config.ts` | `vitest.config.ts` | node 环境 + 测试组；jsdom 按用例文件头开启 |
| `cordis.patch.yml` | `cordis.patch.yml` | 裸包名 insert 行 + 头注释模板 |
| `src/index.ts` / `src/client/index.ts` | 同名文件 | 宿主半三件套；浏览器半仅 `dual` 生成 |
| `test/smoke.test.ts` | `test/smoke.test.ts` | 包形状 + 产物形状（ModuleLoader 壳 / 自包含）；产物断言需先 build |
| `plugin-README.md.tmpl` | `README.md` | 插件 README 骨架 |

## 两条硬约束

1. **模板里不得出现 DSH 族 / 工具链的版本字面量**：一律 `catalog:` / `catalog:dsh`，
   DSH 派生值由基线现算（`openspec/changes/optimize-architecture/tasks.md` 9.1 的 grep 验证句守着这一条）。
2. **模板文件清单在生成器里是一张显式表**，不扫描目录：新增/改名模板文件必须同步
   `scripts/gen-plugin.mjs`，`--dry-run` 的输出才会与真实写入逐条一致。

模板目录本身的 README（本文件）不复用为插件 README：生成物用显式占位的
`plugin-README.md.tmpl`，两者职责不同（一个是「模板怎么用」，一个是「插件长什么样」）。
