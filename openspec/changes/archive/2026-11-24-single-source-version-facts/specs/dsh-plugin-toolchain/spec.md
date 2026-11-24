# Spec Delta

## MODIFIED Requirements

### Requirement: 配置与依赖版本单一来源

六个软插件 SHALL 共享根级编译基准 `tsconfig.plugin.base.json`（各包 tsconfig 仅以 `extends` 声明 include/files 差异，MUST NOT 重新声明基准编译选项或携带 `composite`）；类型检查 MUST 以非 emit 的 `-p` 调用完成。lint 配置 SHALL 收敛为根级 `.oxlintrc.json`，其忽略 pattern MUST 与配置文件所在目录无关。工具链依赖（esbuild/typescript/vitest/oxlint/@types/* 等）版本 SHALL 由 pnpm 默认 catalog 单一声明；DSH 家族与 cordis、schemastery 的 devDependencies SHALL 以命名 catalog `dsh` 引用，其值由基线升级脚本单点重写。软插件 manifest 中的 DSH 族声明与 catalog 实际值不一致 SHALL 构成检查失败；同一工具链键在各包 MUST 解析到同一版本。发布版本 SHALL 只写在 workspace 根 `package.json#version`：全部插件包（与 tooling 包一致）的 `version` SHALL 恒为 `0.0.0`，发布流程 MUST NOT 改写任何插件清单的 `version`；根清单版本 MUST 是精确 semver，且插件清单偏离 `0.0.0` SHALL 构成检查失败（安装锚点是 git tag；豁免键因此恒为 `<包名>@0.0.0`）。脚手架生成的清单 `version` SHALL 恒为 `0.0.0`，不得从根清单派生。

#### Scenario: 某包工具链版本漂移

- **WHEN** 某软插件把 `typescript` 从 `catalog:` 改回字面量版本且与 catalog 值不同
- **THEN** 结构检查失败，报出该包与该键

#### Scenario: tsconfig 重新携带基准选项

- **WHEN** 某包 `tsconfig.host.json` 重新声明了基准已有的编译选项或加回 `composite`
- **THEN** 类型检查或结构检查失败

#### Scenario: 插件清单版本偏离 0.0.0

- **WHEN** 任一插件的 `package.json#version` 被写回发布版本号
- **THEN** `pnpm dsh:check` 第 11 项失败并指明该包

#### Scenario: release 不触碰插件清单

- **WHEN** 执行 `pnpm release <版本> --dry-run`
- **THEN** 只打印根清单 `<旧> → <新>`，无任何插件清单条目

#### Scenario: 脚手架清单版本恒 0.0.0

- **WHEN** 以当前模板生成新插件
- **THEN** 生成清单的 `version` 为 `0.0.0`，且 `pnpm gen:plugin --check` 通过

## ADDED Requirements

### Requirement: 活文档零版本字面量

文档门禁 SHALL 提供 `version-literals` 检查：活文档（根 README / AGENTS、docs 活分区、`openspec/specs/`、`tooling/`、`templates/`、各插件 README 与 AGENTS 及其 docs 活分区）中出现完整 semver 字面量 SHALL 构成失败；pattern SHALL 排除占位常量 `0.0.0` 与 IP 地址形态。记录域（ADR 取证正文、评估档案、`.agent/note/`、研究参考、根 `CHANGELOG.md`）SHALL 经路径子串豁免；版本事实在活文档中 SHALL 以「指向单源（如 `scripts/dsh-baseline.mjs`、`pnpm dsh:check` 首行）或 git tag」的方式表达。双薄入口（仓级与 multi-root 包内）SHALL 启用本检查。

#### Scenario: 活文档版本字面量被拦截

- **WHEN** 任一受检活文档写入具体版本号（裸版本、`v` 前缀、范围串或依赖 pin 形态）
- **THEN** `pnpm docs:check` 的 `version-literals` 逐条报出文件、行与字面量

#### Scenario: 单源表述与占位值不触发

- **WHEN** 活文档改写为「当前值看 `pnpm dsh:check` 首行」类表述，或出现 `0.0.0` 占位与 IP 地址
- **THEN** `version-literals` 通过

#### Scenario: 记录域豁免

- **WHEN** ADR 取证正文或根 `CHANGELOG.md` 出现历史版本号
- **THEN** `version-literals` 按豁免清单放行
