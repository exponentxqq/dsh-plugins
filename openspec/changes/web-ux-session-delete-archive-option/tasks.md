# Tasks

> 执行批次契约：`## N.` 组间严格串行；组内任务互不依赖、可并行、不写同一文件。
> 任务描述中 `触达面 #N` 引用 `code-design.md` ① 触达面清单的条目编号。
> 验证命令均在仓库根执行；`--filter` 目标包为 `dsh-plugin-web-ux`。

## 1. 契约与配置地基

- [x] 1.1 线上契约演进（触达面 #1 实现 + #15 测试）：`src/contract.ts` 加 `DISPOSAL_MODES`/`DisposalMode`/`isDisposalMode()`、`DeleteRequest.mode` 必填、`readRequest()` 白名单加 `mode` 并校验取值、`DeletePreview.archiveRoot` 与 `parsePreview()` 校验、`FAILURE_CODES` 追加 `archive-unavailable`、头注释同步；`test/contract.test.ts` 补用例（合法 `{sessionId,mode:'archive'}`、缺 mode / `mode:'purge'` / `mode:42` 拒、`parsePreview` 缺/空 `archiveRoot` 拒、失败码集合断言）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/contract.test.ts` 退出码 0，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.host.json --noEmit` 退出码 0
- [x] 1.2 插件配置模块（触达面 #2 新建 + #10 + #16 测试 + #9 依赖部分）：`package.json` devDependencies 加 `"@deepseek-ai/schemastery": "3.18.5"` 并在仓库根 `pnpm install`；新建 `src/config.ts`（`WebUxConfig`、原生 Schemastery `Config`（`archiveRoot` 键）、`ArchiveRootContext`、`resolveArchiveRoot()`：缺省/空白→`homePath('archive','sessions')`、`~/`→`resolve(homedir,rest)`、绝对→`resolve`、相对/其它→warn 一次并回落）；`tsconfig.host.json` include 加 `src/config.ts`、`test/config.test.ts`；新建 `test/config.test.ts`（默认根、`~/x` 展开、绝对归一、相对回落且 warn 恰一次、`Config({})`/`Config({archiveRoot:'/x'})` 通过、`Config({archiveRoot:2})` 抛错）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/config.test.ts` 退出码 0，且 `grep -n "src/config.ts" plugins/web-ux/tsconfig.host.json` 命中
- [x] 1.3 双语文案（触达面 #7 + #21 测试）：`src/client/locales.ts` 按 `code-design.md` ③.7 新增 13 键（`dialog.description.archive`/`dialog.mode.legend`/`dialog.mode.archive`/`dialog.mode.delete`/`dialog.archive.target`/`dialog.warning.archive`/`dialog.summary.moveSize`/`dialog.confirm.archive`/`dialog.archiving`/`dialog.done.archive`/`dialog.warnings.archive`/`dialog.failed.archive`/`error.archive-unavailable`）zh/en 同补；`test/locale-parity.test.ts` required 列表补新键。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/locale-parity.test.ts` 退出码 0

## 2. 宿主纯流程与文件工厂

- [x] 2.1 迁移执行路径（触达面 #3 + #17 测试）：`src/delete-session.ts` —— `FileSystemOps` 扩 `mkdir`/`rename`/`copyFile` 三原语、`DeletePorts` 扩 `prepareArchive`/`archiveFiles`、`previewDelete()` 增 `archiveRoot` 入参（原样回声）、`createSessionFiles()` 增 `prepareArchive`/`archive`（复用 `locate()`、目标 `<archiveRoot>/<项目目录>/<会话id>`、`lstat(dest)` 存在即失败绝不覆盖、rename 优先、EXDEV 回退内部 `copyTree`（符号链接不复制失败保留源、任一失败不 rm 源、全成后 rm 源且失败记「已移动但源未删」）、`unlink` 投影缓存同 remove、警告串按 `code-design.md` ③.2 表）、新增 `archiveSession()`（`isAbsolute` 防御 + `prepareArchive` 失败映射 `archive-unavailable`）、抽出 `disposeAll()` 供删除/迁移共用（`deleteSession` 改调用且输出与现状逐字节一致）、模块头与 JSDoc 同步；`test/delete-session.test.ts` —— fake fs 扩 3 原语（mkdir 递归、rename 支持注入 EXDEV、copyFile 可注入中途失败）、fake 端口补两方法、既有 `previewDelete` 调用补 `archiveRoot` 并断言回声、新增 `code-design.md` G2.4 的 11 条用例矩阵。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-session.test.ts` 退出码 0，且既有 `deleteSession` 用例在不改断言的前提下全部通过

## 3. 宿主实实体接线

- [x] 3.1 接线与分派（触达面 #4 + #18 测试）：`src/index.ts` —— `node:fs/promises` 增 `copyFile,mkdir,rename`、`node:os` 增 `homedir`、`nodeFileSystem` 补 3 原语、`HostPorts extends DeletePorts { archiveRoot }`、`createPorts(ctx, config)` 内 `resolveArchiveRoot`、`createDispatcher(ctx, config)` 按 `parsed.value.mode` 分派 `archiveSession`/`deleteSession`、`apply(ctx, config?)`、`export { Config }`；`test/index.test.ts` —— 全部 payload 补 `mode`，新增真实临时目录用例（预览回声缺省根与自定义根、归档执行断言 `existsSync(dest/...session.v4.jsonl.zstd)===true && existsSync(源)===false` 且缓存删除且 `fakeRegistry.calls` 序列、`archive-unavailable`（归档根父路径为普通文件）返回该码且 registry 零调用、delete 回归断言 `existsSync(home/archive)===false`、缺 mode 的 payload → `bad-request`）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/index.test.ts test/bundle.test.ts` 退出码 0
- [x] 3.2 构建与注册注释定稿（触达面 #9 description 部分 + #12 + #13）：`package.json` `description` 更新为 delete-or-archive 表述；`cordis.patch.yml` 注释说明 `archiveRoot` 为可选配置键且裸包名行形态不变；`build.mjs` 头注释补「Schemastery 由构建内联、external 仍只有 node:*」（构建逻辑零改动）。验证：`grep -n "archiveRoot" plugins/web-ux/cordis.patch.yml` 与 `grep -n "Schemastery" plugins/web-ux/build.mjs` 均命中，且 `git diff --stat plugins/web-ux/build.mjs` 显示无代码行改动（仅注释）

## 4. 浏览器半调用面与样式

- [x] 4.1 调用面携带模式（触达面 #5 + #19 测试）：`src/client/delete-client.ts` —— `DeleteClient.preview(sessionId, mode)` / `remove(sessionId, mode)`、内部 `call(endpoint, body: DeleteRequest)` 发送 `{sessionId, mode}`；`test/delete-client.test.ts` —— 断言两端点 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, {sessionId:'session-1', mode:'archive'})` 与 `mode:'delete'` 另一条、坏形状仍归一 `bad-response`。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-client.test.ts` 退出码 0
- [x] 4.2 模式区块样式（触达面 #8）：`src/client/delete.module.css` 增 `.modes`/`.modeRow`/`.modeText`/`.archiveTarget`（复用既有 `--dsw-alias-*` 令牌与静态兜底，同现有做法）。验证：`grep -c "modes\|modeRow\|modeText\|archiveTarget" plugins/web-ux/src/client/delete.module.css` ≥4，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.client.json --noEmit` 退出码 0

## 5. 浏览器半对话框

- [x] 5.1 模式单选与分支文案（触达面 #6 + #20 测试）：`src/client/DeleteSessionDialog.tsx` —— 导出 `DEFAULT_DISPOSAL_MODE='archive'`、`mode` 局部 state、`fieldset`+原生 radio（`deleting` 时 disabled，`previewing`/`failed` 不渲染）、预览只发一次（`client.preview(target.sessionId, DEFAULT_DISPOSAL_MODE)`）、确认调 `client.remove(target.sessionId, mode)`、按 mode 分支 description/体积行（`moveSize` vs `size`）/警示区（`archive` vs `irreversible`）/归档目标行（`dialog.archive.target` 带预览 `archiveRoot`）/确认按钮文案与危险色/进行中文案/完成与失败文案；`test/delete-dialog.test.tsx` —— fakeClient 的 preview 补 `archiveRoot`、断言默认档 radio checked 与「移动到归档目录」按钮、切换后「永久删除」+不可逆警示+「预计释放」、两模式确认分别 `remove('session-1','archive')`/`remove('session-1','delete')`、`deleting` 阶段 radio disabled、归档完成/失败文案、预览失败态无 radio。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-dialog.test.tsx` 退出码 0，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.client.json --noEmit` 退出码 0

## 6. 文档与构建产物

- [x] 6.1 用户文档（触达面 #11）：`plugins/web-ux/README.md` —— 「删除已归档会话」章节增「处置模式」（单选默认迁移、两模式文案差异）与迁移范围（只搬日志目录、保留项目层级、投影缓存删除、附件不动）、新增「归档目录与手工找回」（缺省 `$DSH_HOME/archive/sessions`、`archiveRoot` 配置样例、`mv` 找回命令、插件不提供恢复入口）、半失败警告与手工处理、拒绝码表加 `archive-unavailable`、非目标加「不做恢复 GUI」、宿主 import 例外（Schemastery 内联）、tsconfig 清单、`--dump-config-schema` 说明、版本迁移回滚说明。验证：`grep -n "archiveRoot\|archive/sessions\|移动到归档目录" plugins/web-ux/README.md` 三处均命中
- [x] 6.2 重建构建产物（触达面 #14）：`pnpm --filter dsh-plugin-web-ux build` 重建 `lib/index.js` 与 `lib/client.js` 并保持入库。验证：`git status --porcelain plugins/web-ux/lib` 显示两文件已更新，且 `node -e "import('./plugins/web-ux/lib/index.js').then(m=>{if(typeof m.Config!=='function')process.exit(1);console.log(JSON.stringify(m.Config({archiveRoot:'/tmp/x'})))})"` 打印 `{"archiveRoot":"/tmp/x"}`

## 7. 终验

- [x] 7.1 包级全量自检：`pnpm --filter dsh-plugin-web-ux verify:all`（lint → typecheck → build → test）退出码 0；产物自包含复核：`node -e "const s=require('node:fs').readFileSync('plugins/web-ux/lib/index.js','utf8');const w=[...new Set([...s.matchAll(/(?:from\s+\"|require\(\")([^\"]+)\"/g)].map(m=>m[1]))];console.log(JSON.stringify(w))"` 只打印 `node:*` 形态条目（esbuild 依赖路径注释不算）。验证：两条命令退出码 0 且后一条输出不含非 `node:` 模块词

## 附录：执行期留痕

- **R1**（2026-11-04，组1收尾）：**host/client tsc 全绿是组间过渡态，不是组1失败**。1.1 契约先行把 `DeleteRequest.mode` / `DeletePreview.archiveRoot` 必填化后，调用方在适配前必然报错：`src/delete-session.ts:149`（归组2 任务 2.1 适配）、`test/delete-dialog.test.tsx` 两处（归组5 任务 5.1 适配）。连锁面：任务 1.1 的勾选**推迟**到 2.1 完成后按完整验证句（contract vitest + host tsc）复核——其自身文件已 vitest 49/49 绿、聚焦 tsc 与 oxlint 绿；2.1/3.1/5.1 的验证句天然覆盖各自过渡缺口；组3 收尾时 host tsc 应全绿、组5 收尾时 client tsc 应全绿，否则按本条反向排查漏适配。
- **R1 复核①**（2026-11-04，组2收尾）：2.1 后 host tsc 诊断收敛为 3 条、全部位于 `src/index.ts`（TS2554 previewDelete 增参 ×1、FileSystemOps 缺 3 原语 ×1、DeletePorts 缺 2 方法 ×1）——缺口转移确认，**1.1 完整验证句的复核随之推迟到组3 任务 3.1 完成后**；`delete-session.ts` 与其测试自身零诊断。另：design.md G2「既有 8 用例」与 HEAD 实际「7 条」不符，属规划期笔误，以实测 7 条为准（终形态化已记录）。
- **R1 复核②（收口）**（2026-11-04，组3收尾）：3.1 适配后 host tsc 退出码 0（0 诊断），1.1 完整验证句复核通过（contract vitest 49/49 + host tsc 绿），1.1 补勾选。R1 闭环：后续组不得再以「契约过渡态」解释 host tsc 红튼。
- **R2**（2026-11-04，组3收尾）：三项审核裁定——①组3 起两子代理将既有英文注释块整体转写为简体中文（build.mjs / cordis.patch.yml / index.ts，纯注释零行为变化），依据仓根 AGENTS.md「代码注释一律简体中文」与本变更 src 侧中文先例，**裁定保持不回退**（连锁面：后续组涉及注释时同口径，不再重复上浮）；②3.1 实现保留 index.ts 既有 try 包裹 createPorts（design ③.4 伪码为 try 外），归档根解析意外抛错仍映射 `internal`，裁定接受并已写入 G3 终形态；③3.1 增补 1 条任务原文未列的断言（`Config` 从包入口可调用），作 A10 导出形状守卫，裁定接受。
- **R1 复核③（client 侧收口）**（2026-11-04，组5收尾）：5.1 适配后 client tsc 退出码 0（基线 4 条过渡诊断全清），4.2 的 tsc 子句随之转绿、补勾选。R1 全链闭环（host ✓ 组3、client ✓ 组5）。
- **R3**（2026-11-04，组5收尾）：四项审核裁定——①radio 除 fieldset 级 disabled 外逐 input 显式 disabled（HTML IDL 不反射 fieldset 禁用，测试可观察性需要；视觉降级仍由 `.modes:disabled` 承担，语义不变）；②危险色不做 css module 单测断言（仓内 `test/stubs/ui-primitives.tsx` 哲学：视觉归真组件；实现为 `archiving ? undefined : css.danger`，仅 delete 档挂）；③预览失败态文案走 mode 分支显示「归档未能完成：…」（③.6 字面要求；「预览失败却报归档失败」的语义歧义留档，如需区分属另一次变更）；④done 阶段单选随预览清空消失（与 ③.6 一致）。均裁定接受。
- **R4**（2026-11-04，组6收尾）：**版本基线偏差裁定**——design.md Migration Plan 写「回滚到 v1.4.0」，系规划期事实；落档后仓库已发布 v1.5.0（`git show v1.5.0:plugins/web-ux/lib/index.js` 实测不含 `archiveRoot`，即 v1.5.0 亦无本能力），README 因此写「当前已发布的 v1.5.0 及更早版本都没有本能力」、小节名「版本迁移（含迁移归档）」，未写死未发布 tag。回滚行为口径与设计一致（旧宿主对带 mode 请求预览即 `bad-request`、刷新恢复、已迁移数据留在归档目录不受影响）。裁定接受；发布 tag 确定后如需可改写。
- **R5**（2026-11-04，组7收尾）：**esbuild 注释路径随 cwd 变化（非阻塞，发布无风险）**——直接 `node plugins/web-ux/build.mjs`（cwd=仓库根）时产物中的文件路径注释为 `// plugins/web-ux/src/...`，而规范入口 `pnpm --filter dsh-plugin-web-ux build`（cwd=包目录）为 `// src/...`，仅注释字节差（index +78B/client +270B）、无语义差异；`scripts/release.mjs` 走 `pnpm build`，与 verify:all 同口径，发布路径不受影响。连锁面：**重建产物一律用规范入口 `pnpm --filter dsh-plugin-web-ux build`**，勿从仓库根直跑 build.mjs；7.1 已实测规范入口两次构建 sha256 逐字节一致（index `86e7bd8b…`、client `a72c5f25…`）。

## 附录：沉淀回流清单（spec-done 六要素汇报的工件源）

| 项 | 去向 |
|---|---|
| design.md（执行环境块 + G1–G5 终形态化） | 未提交，随本变更实现提交入库 |
| tasks.md（12/12 勾选 + 附录 R1–R5） | 未提交，随本变更实现提交入库 |
| code-design.md / decisions.md | 执行期零改动（组段终形态按 design.md ⑤ 维护，实质等同落档副本维护） |
| /tmp/spec-flow/progress.md 等临时材料 | 易失、不入库、不进提交 |
| dotfiles 工作流仓（spec-workflow.yaml 映射等） | 执行期零改动 |
| 未提交待决（非本变更触达面，建议项）：lib/ 纳入 oxlint 忽略以消产物 warning | 留给用户裁决，不入本次提交 |
- **审核裁决（终局）**（2026-11-04，auto 停留呈证点）：用户裁决 **停止**——实现不提交、流程终止。当前预期态：**12/12 勾选 + 实现零提交**（auto 模式收尾提交被用户否决，工作区改动保留），与「auto 收尾才提交，未提交属预期」的恢复纪律一致；接续时按 spec-workflow 恢复协议第 3 步对现存 diff 复跑验证句核对，勿重派已完成任务。project-mcp-name-resource-isolation 的并行改动全程未触碰。
