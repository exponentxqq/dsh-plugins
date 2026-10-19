# Proposal

## Why

`@` 文件提及补全是 multi-root 插件唯一尚未覆盖多根 scope 的消费者 seam：上游 `ctx.fileReferences` 的本地提供方以会话 cwd（＝主根）为唯一索引根，模糊查询与目录钻入（含绝对路径查询的根逃逸检查）都触不到附属工作目录——用户在 composer 输入 `@` 看不到任何附加根内容。同时，插件目录 `plugins/dsh-plugin-multi-root-workspace` 是仓库四个插件中唯一目录名带 `dsh-plugin-` 前缀的，与其余三个（目录名无前缀、包名 `dsh-plugin-<目录名>`）不一致。

## What Changes

- **新增 additive 行 `multi-root-file-references`**：以 `multiRootCompat` 为前置门禁、`wrapMethod` 包装 `ctx.fileReferences.list` 公开方法，把附加根并入 `@` 候选——行为边界（阶段 1.5 已收敛）：
  - 空 query：原结果后追加每个 available 附加根一条绝对目录候选（尾斜杠钻入语义）；
  - 绝对路径 query 落在某附加根内：以该根为范围列目录，产出绝对路径候选；I/O 后复验 scope，根撤销即丢弃；
  - 绝对路径 query 是附加根前缀：前缀匹配追加根目录候选；
  - 裸模糊 query 与相对 query：**不干预**（上游主根语义原样，字节级透传）；
  - 无附加根：字节级透传；行卸载恢复方法描述符并释放检索实例。
- **检索载体**：动态 `import('@deepseek-ai/dsh-file-reference-local')` 复用其公开导出的 `WorkspaceFileSearch`（排除目录表 / 排名 / 逐段 `lstat` 拒 symlink 语义全继承），按 canonical 根缓存实例、每次调用剪枝；peer 缺席或装坏时降级为只出主根候选（装坏 warn 一次，不抛错）。
- **兼容契约三处同步**：`OPTIONAL_CORE_PACKAGES`、`peerDependencies`（exact allowlist 枚举 + optional 标记）、`devDependencies`（`0.2.1-rc.2` pin）加入 `@deepseek-ai/dsh-file-reference` 与 `@deepseek-ai/dsh-file-reference-local` 两包。
- **目录改名（BREAKING，仅安装锚点）**：`plugins/dsh-plugin-multi-root-workspace` → `plugins/multi-root-workspace`；npm 包名不变（`dsh-plugin-multi-root-workspace`），仓内全部路径引用同步更新；已安装 profile 需按新 `&path:plugins/multi-root-workspace` 重新 `add`（旧 tag 旧 path 仍可安装旧版本）。
- **文档与测试**：新开 ADR-0012（单主题）；架构文档、双语 README、AGENTS 不变量（新增第 11 条）、行数计数同步；行行为 / 适配层 / 加载时刻 / patch 组合四层测试与 smoke journey 的 `@` seam 断言。
- **发布**：两批次并入下一次 release `v1.3.0`（minor）。

## Capabilities

### New Capabilities

- `dsh-multi-root-file-references`: multi-root 插件的 `@` 文件提及补全多根覆盖——附加根候选的发现行为（空 query 根候选、绝对路径钻入与前缀匹配、裸模糊不跨根、撤销即失效、peer 缺席降级）及其兼容契约边界。

### Modified Capabilities

（无——目录改名是仓库结构变化，不改变任何既有 spec 的需求；本插件此前无任何 spec。）

## Impact

- **触达仓**：仅本仓 `dsh-plugins`（根仓文档/清单 + 插件目录全部改动）；上游 DSH 包只读核实，零修改（ADR-0002）。
- **代码**：插件新增 `src/file-references.ts`、`src/compat/file-reference-search.ts` 及配套测试；`cordis.patch.yml`、`package.json`、`tsdown.config.ts`、`src/compat/dsh-version.ts`、既有 `tests/optional-peers.spec.ts` / `tests/patch.spec.ts`、`scripts/smoke-compose.mjs` / `smoke-journey.mjs` 同步；全仓目录路径引用更新（README×2、AGENTS×2、pnpm-workspace 注释、邻插件 README 相对链接、docs 路径示例）；`pnpm-lock.yaml` importer 刷新。
- **依赖**：新增两个 optional peer（均为既有 DSH 家族包，发布版本覆盖支持矩阵全部 10 个 release；release-age 豁免已存在，无需新增）。
- **用户操作**：profile 侧安装命令的 `&path:` 变化（迁移说明写入根 README 与插件 README 升级段）。
- **已知限制（接受并文档化）**：绝对路径钻入后弹窗面包屑中间层点击回跳无效（上游 `crumbsFor` 相对语义限制）；附加根绝对路径含排除目录段名（如 `build`/`node_modules`）时钻入为空；部署覆盖 provider 检索参数时附加根仍用上游默认值。
