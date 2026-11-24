# Tasks

## 1. 基线单源

- [x] 1.1 `plugins/multi-root-workspace/src/compat/dsh-version.ts` 删字面量改 import 单源并 re-export（导出面不变）
- [x] 1.2 `scripts/check-dsh-compat.mjs` 改 import 基线与派生范围，删 `readStringLiteral` / `softRange`
- [x] 1.3 `scripts/upgrade-dsh.mjs` 删 `repointRuntimeBaselines` 与调用、日志；头注释与尾注同步
- [x] 1.4 `scripts/dsh-baseline.mjs` / `.d.mts` 注释改述单源消费面
- [x] 1.5 `scripts/check-dsh-baseline.mjs` 新增第 10 项（字面量唯一 + import 断言）与第 11 项（发布版本契约）
- [x] 1.6 重建 multi-root `lib/`，确认 chunk 内联单源值、声明 re-export

## 2. 发布契约

- [x] 2.1 七插件 `package.json#version` → `0.0.0`
- [x] 2.2 `scripts/release.mjs` 目标收敛为根清单；头注释写明代价；回滚段只涉产物
- [x] 2.3 `scripts/gen-plugin.mjs` + `templates/default/package.json.tmpl` 的 `VERSION` 恒 `0.0.0`；`templates/README.md` 禁令段同步

## 3. 文档门禁与清零

- [x] 3.1 内核 `doc-checks.mjs` 新增第 15 项 `version-literals`（共享 `VERSION_LITERAL_PATTERN`、`exemptions.versionLiterals`）
- [x] 3.2 双薄入口启用并配记录域豁免；`doc-checks.d.mts` 类型同步
- [x] 3.3 `doc-checks.selftest.mjs` 补四类样本（多形态 FAIL / 单源表述 PASS / 占位与 IP PASS / 记录域豁免 PASS）
- [x] 3.4 活文档清零：根 README/AGENTS、tooling、templates、六个插件 README、multi-root 全套 docs、openspec 两个 spec（示例值符号化）
- [x] 3.5 新建根 `CHANGELOG.md`（lib 入库 / 目录改名 / web-ux 三次能力 tag / 模型目录备忘）
- [x] 3.6 记录域注记：`.agent/note` 覆盖注、ADR-0009 修订注、ADR-0001/0003 追注

## 4. zcode-plan 模型清单 profile 优先

- [x] 4.1 `route-config.ts`：`effectiveRoute` / `declaredRouteOf` / `routeModelIds`；install 只补缺失键、幂等判据改合并深等；日志区分来源
- [x] 4.2 `status.ts` / `index.ts` / `commands.ts`：路由行按传入清单渲染，清单按「profile 声明优先、未声明回落默认」实读
- [x] 4.3 测试：X7-4 反转、新增 P1–P3 / D1–D2；status / commands fixture 同步
- [x] 4.4 模型目录恢复三条（glm-5.4 置首、glm-5.3 纯文本回退、glm-5.3-flash）：真源、测试、README、migration、主规格、lib 重建、profile patch 同步
- [x] 4.5 README：install 语义、模型段、手工路由 YAML 标注为自定义主路径

## 5. 决策记录与规范

- [x] 5.1 新建 `docs/decisions/ADR-0004-single-source-version-facts.md`，登记进索引与根 AGENTS
- [x] 5.2 本变更 specs delta 三份（dsh-baseline / dsh-plugin-toolchain / dsh-zcode-plan）
- [ ] 5.3 `openspec-archive-change`（复核通过后执行，本次不归档）
