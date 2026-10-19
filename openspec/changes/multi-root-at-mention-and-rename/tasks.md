# Tasks

> 执行批次契约：`## N.` 组间严格串行（按编号执行），组内任务互不依赖可并行；每任务描述引用 `code-design.md` ① 触达面清单条目编号（A/B/C/D/E）。路径按改名后新目录书写。

## 1. 目录改名（零行为变化，先行）

- [ ] 1.1 `git mv plugins/dsh-plugin-multi-root-workspace plugins/multi-root-workspace` 并 `pnpm install` 刷新 lockfile（触达 A1/A2）；验证：`test ! -e plugins/dsh-plugin-multi-root-workspace && test -d plugins/multi-root-workspace` 退出码 0，且 `git diff --stat pnpm-lock.yaml` 只体现 importer key `plugins/multi-root-workspace`（依赖解析零变化）
- [ ] 1.2 更新仓级路径引用：根 `README.md`（L32/43/51/75 的 `&path:` 与相对链接）、`pnpm-workspace.yaml` 注释、`plugins/project-mcp/README.md:73` 与 `plugins/user-commands/README.md:99` 的相对链接（触达 A3/A4/A5；包名引用一律不动）；验证：`grep -rn 'plugins/dsh-plugin-multi-root-workspace' README.md pnpm-workspace.yaml plugins/project-mcp/README.md plugins/user-commands/README.md` 退出码 1（0 命中）
- [ ] 1.3 更新插件内路径引用：插件 `AGENTS.md:90`、`README.md`/`README.en.md`（vendored 路径与 `&path:`；上游 npm 包名/tarball 名/上游仓库名不改）、`docs/development/plugin-development-workflow.md:133`、`docs/troubleshooting/unsupported-dsh-release.md:87`、`docs/architecture/multi-root-workspace.md:48`（目录树标签 + 一句「目录名不带前缀、包名不变」说明）（触达 A6–A10）；验证：`grep -rn 'plugins/dsh-plugin-multi-root-workspace' plugins/multi-root-workspace --include='*.md' --exclude-dir=node_modules` 退出码 1，且 `grep -c 'dsh-plugin-multi-root-workspace' plugins/multi-root-workspace/README.md` 仍命中（包名引用保留）
- [ ] 1.4 全量门禁复验（触达 A11，lib/ 随构建重建）；验证：`grep -rn 'plugins/dsh-plugin-multi-root-workspace' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=lib . | grep -v 'openspec/changes/archive/'` 输出为空，且仓根 `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm docs:check` 全部退出码 0

## 2. 兼容契约三处同步

- [ ] 2.1 `plugins/multi-root-workspace/src/compat/dsh-version.ts` 的 `OPTIONAL_CORE_PACKAGES` 末尾追加 `'@deepseek-ai/dsh-file-reference'`、`'@deepseek-ai/dsh-file-reference-local'`（触达 B1）；验证：`grep -c "'@deepseek-ai/dsh-file-reference" plugins/multi-root-workspace/src/compat/dsh-version.ts` 输出 2
- [ ] 2.2 `plugins/multi-root-workspace/package.json` 三处：peerDependencies 两包 range 逐字等于 allowlist 拼接串（`0.1.5-rc.2 || 0.1.6-alpha.1 || … || 0.2.1-rc.2`）、peerDependenciesMeta 两项 optional、devDependencies 两包 `0.2.1-rc.2`（触达 B2/B3/B4）；验证：`pnpm install` 后 `pnpm --filter dsh-plugin-multi-root-workspace compat:check` 输出含 "agree" 且退出码 0，`pnpm dsh:check` 退出码 0
- [ ] 2.3 同步行数/行清单叙事：「六行→七行」与 `multi-root-file-references` 清单进 `docs/troubleshooting/unsupported-dsh-release.md`、`.agent/note/dsh-compat-contract.md` 与 `.en.md`、`docs/architecture/multi-root-workspace.md`、`docs/development/plugin-development-workflow.md`（十行→十一行 insert，两处）、插件 `AGENTS.md` 不变量 7 行清单（触达 B6/B7/B8/B9）；验证：`grep -rn 'multi-root-file-references' plugins/multi-root-workspace/docs plugins/multi-root-workspace/.agent/note plugins/multi-root-workspace/AGENTS.md` 命中 ≥6 处，`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0

## 3. 行实现与测试

- [ ] 3.1 新建 `plugins/multi-root-workspace/src/compat/file-reference-search.ts`（动态 import + `adaptFileReferenceLocal` 结构探针 + `AdditionalRootSearchCache` 缓存/剪枝/disposeAll + 降级 warn 一次）与 `plugins/multi-root-workspace/src/file-references.ts`（行：inject 门禁、`planAdditionalCandidates` 纯函数、`toDisplayPath`、wrapMethod 包装、I/O 后复验 scope、卸载恢复）（触达 C1/C2，签名见 code-design.md ③）；验证：`pnpm --filter dsh-plugin-multi-root-workspace typecheck` 退出码 0
- [ ] 3.2 接线三处：`cordis.patch.yml` 在 `multi-root-workspace-files` 与 `multi-root-command` 之间插行 `multi-root-file-references`（name `'dsh-plugin-multi-root-workspace/file-references'`，无 config）、`package.json` exports 加 `./file-references`、`tsdown.config.ts` host entry 加 `'src/file-references.ts'`（触达 C3/C4/C5）；验证：`pnpm --filter dsh-plugin-multi-root-workspace build` 退出码 0，`grep -n 'await import("@deepseek-ai/dsh-file-reference-local")' plugins/multi-root-workspace/lib/file-references.js` 命中 1 行且 `grep -c 'WorkspaceFileSearch = class' plugins/multi-root-workspace/lib/file-references.js` 输出 0（动态导入未被内联）
- [ ] 3.3 新建 `tests/file-references.spec.ts`（真 scope + 桩 provider：透传同引用同参、空 query 每根一条且顺序=scope、绝对钻入候选全 `startsWith(root/)`、前缀匹配用唯一前缀、裸模糊/相对不触发 acquire、撤销丢弃、卸载后 `Object.hasOwn(stub,'list')===false`、acquire 降级返 base）与 `tests/file-reference-search.spec.ts`（探针缺导出/常量类型错/构造抛错、config 是拷贝、同根 acquire 一次、retain/disposeAll、非 MODULE_NOT_FOUND warn 恰一次）（触达 D1/D2，断言清单见 code-design.md ⑤ 批次 C）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run tests/file-references.spec.ts tests/file-reference-search.spec.ts` 退出码 0
- [ ] 3.4 扩展既有测试：`tests/optional-peers.spec.ts` 加 file-reference-local 加载时刻断言（import barrel 与行模块后 `fileReferenceLoaded === false`）、`tests/patch.spec.ts` 期望 id 列表与 gated 数组加 `multi-root-file-references`、`scripts/smoke-compose.mjs` 的 `INSERTED` 同位置加项（触达 D3/D4/D5）；验证：`pnpm --filter dsh-plugin-multi-root-workspace exec vitest run tests/optional-peers.spec.ts tests/patch.spec.ts` 退出码 0

## 4. 文档（描述已实现形状）

- [ ] 4.1 新建 `docs/decisions/ADR-0012-additional-root-file-references.md`（Status Accepted / Date 2026-10-19；Context、Decision：行形态/主根来源/检索载体/空 query/绝对钻入/裸模糊不合并/optional peer 与门禁、Alternatives、Consequences 含三条已知限制：面包屑回跳/排除目录段名/检索参数默认值、Related Documents；绝对路径示例放代码围栏）并更新 `docs/decisions/README.md` 与 `README.en.md` 索引（触达 E1/E2）；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0 且 `grep -c 'ADR-0012' plugins/multi-root-workspace/docs/decisions/README.md` 输出 ≥1
- [ ] 4.2 `docs/architecture/multi-root-workspace.md` 加 §6.2「@ 文件提及补全」小节（seam/包装方式/行为矩阵/主根来源/动态导入/已知限制）并在 §1 消费路径图加 `@ 提及 → ctx.fileReferences` 一行（触达 E3）；验证：`grep -n '6.2' plugins/multi-root-workspace/docs/architecture/multi-root-workspace.md` 命中且 `grep -c 'fileReferences' 该文件` ≥2，docs:check 退出码 0
- [ ] 4.3 双语 README：使用方法加「@ 文件提及」段、项目结构加两新文件、已知限制加三条（面包屑/排除段名/裸模糊不跨根）并「六行→七行」、smoke 计数占位（按组 5 实跑回填）；插件 `AGENTS.md` 不变量 7 计数更新并新增不变量 11（@ 补全 additive 发现增强边界）（触达 E4/E5/E6）；验证：`pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0 且 `grep -c 'Eleven invariants' plugins/multi-root-workspace/AGENTS.md` 输出 1

## 5. 冒烟与整体验证（需运行中的 dsh 环境）

- [ ] 5.1 `scripts/smoke-journey.mjs` web leg 加两段断言：候选断言（空 query 出根目录候选、`${extra}/` 钻入候选全绝对、裸模糊 `README` 不含附加根）置于 `observed.granted` 赋值后；撤销断言（`/workspace-folders remove 1` 成功 + 候选消失）置于既有 `observed.channelView` 赋值**之后**；check 段加 5 条断言（触达 D6）；验证：`pnpm --filter dsh-plugin-multi-root-workspace build && pnpm --filter dsh-plugin-multi-root-workspace smoke:compose && pnpm --filter dsh-plugin-multi-root-workspace smoke:journey` 退出码 0（含 5 条新 @ 断言全绿，既有断言无一变红）
- [ ] 5.2 按 smoke journey 实跑结果回填 README×2 的 smoke 计数，并在根 README 安装段与插件 README 升级段写迁移说明（按新 `&path:plugins/multi-root-workspace` 重新 add；旧 tag 旧 path 可装旧版本）（触达 E4/D6 收尾 + 分歧 3）；验证：`grep -n 'path:plugins/multi-root-workspace' README.md plugins/multi-root-workspace/README.md` 命中新 path，docs:check 退出码 0
- [ ] 5.3 全仓发布前自检；验证：仓根 `pnpm verify` 退出码 0（或 `pnpm dsh:check` + 各插件 verify:all），且人工核对记录写入变更目录验证记录：`docker exec dsh dsh --profile web` 起新会话 → `/workspace-folders add <附加根>` → composer 输入 `@` 看到根候选 → 钻入 → remove 后候选消失

## Workflow follow-up

- 发布：仓根 `pnpm release 1.3.0`（先自动跑 dsh:check；tag 推送后 profile 按新 path 安装）。
- profile 侧迁移：移除旧安装后 `docker exec dsh dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.3.0&path:plugins/multi-root-workspace"`；`koffi` allowBuilds 表态按包名不受影响。
- 归档：实施与验收满足后走 `openspec archive`（spec delta 并入 `openspec/specs/dsh-multi-root-file-references/`）。
