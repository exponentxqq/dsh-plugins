# Tasks

> 执行批次契约：`## N.` 组间严格串行；组内任务互不依赖、可并行、不写同一文件。
> 任务描述中 `触达面 #N` 引用 `code-design.md` ① 触达面清单的条目编号。
> 验证命令均在仓库根执行；`--filter` 目标包为 `dsh-plugin-web-ux`。

## 1. 契约与配置地基

- [ ] 1.1 线上契约演进（触达面 #1 实现 + #15 测试）：`src/contract.ts` 加 `DISPOSAL_MODES`/`DisposalMode`/`isDisposalMode()`、`DeleteRequest.mode` 必填、`readRequest()` 白名单加 `mode` 并校验取值、`DeletePreview.archiveRoot` 与 `parsePreview()` 校验、`FAILURE_CODES` 追加 `archive-unavailable`、头注释同步；`test/contract.test.ts` 补用例（合法 `{sessionId,mode:'archive'}`、缺 mode / `mode:'purge'` / `mode:42` 拒、`parsePreview` 缺/空 `archiveRoot` 拒、失败码集合断言）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/contract.test.ts` 退出码 0，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.host.json --noEmit` 退出码 0
- [ ] 1.2 插件配置模块（触达面 #2 新建 + #10 + #16 测试 + #9 依赖部分）：`package.json` devDependencies 加 `"@deepseek-ai/schemastery": "3.18.5"` 并在仓库根 `pnpm install`；新建 `src/config.ts`（`WebUxConfig`、原生 Schemastery `Config`（`archiveRoot` 键）、`ArchiveRootContext`、`resolveArchiveRoot()`：缺省/空白→`homePath('archive','sessions')`、`~/`→`resolve(homedir,rest)`、绝对→`resolve`、相对/其它→warn 一次并回落）；`tsconfig.host.json` include 加 `src/config.ts`、`test/config.test.ts`；新建 `test/config.test.ts`（默认根、`~/x` 展开、绝对归一、相对回落且 warn 恰一次、`Config({})`/`Config({archiveRoot:'/x'})` 通过、`Config({archiveRoot:2})` 抛错）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/config.test.ts` 退出码 0，且 `grep -n "src/config.ts" plugins/web-ux/tsconfig.host.json` 命中
- [ ] 1.3 双语文案（触达面 #7 + #21 测试）：`src/client/locales.ts` 按 `code-design.md` ③.7 新增 13 键（`dialog.description.archive`/`dialog.mode.legend`/`dialog.mode.archive`/`dialog.mode.delete`/`dialog.archive.target`/`dialog.warning.archive`/`dialog.summary.moveSize`/`dialog.confirm.archive`/`dialog.archiving`/`dialog.done.archive`/`dialog.warnings.archive`/`dialog.failed.archive`/`error.archive-unavailable`）zh/en 同补；`test/locale-parity.test.ts` required 列表补新键。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/locale-parity.test.ts` 退出码 0

## 2. 宿主纯流程与文件工厂

- [ ] 2.1 迁移执行路径（触达面 #3 + #17 测试）：`src/delete-session.ts` —— `FileSystemOps` 扩 `mkdir`/`rename`/`copyFile` 三原语、`DeletePorts` 扩 `prepareArchive`/`archiveFiles`、`previewDelete()` 增 `archiveRoot` 入参（原样回声）、`createSessionFiles()` 增 `prepareArchive`/`archive`（复用 `locate()`、目标 `<archiveRoot>/<项目目录>/<会话id>`、`lstat(dest)` 存在即失败绝不覆盖、rename 优先、EXDEV 回退内部 `copyTree`（符号链接不复制失败保留源、任一失败不 rm 源、全成后 rm 源且失败记「已移动但源未删」）、`unlink` 投影缓存同 remove、警告串按 `code-design.md` ③.2 表）、新增 `archiveSession()`（`isAbsolute` 防御 + `prepareArchive` 失败映射 `archive-unavailable`）、抽出 `disposeAll()` 供删除/迁移共用（`deleteSession` 改调用且输出与现状逐字节一致）、模块头与 JSDoc 同步；`test/delete-session.test.ts` —— fake fs 扩 3 原语（mkdir 递归、rename 支持注入 EXDEV、copyFile 可注入中途失败）、fake 端口补两方法、既有 `previewDelete` 调用补 `archiveRoot` 并断言回声、新增 `code-design.md` G2.4 的 11 条用例矩阵。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-session.test.ts` 退出码 0，且既有 `deleteSession` 用例在不改断言的前提下全部通过

## 3. 宿主实实体接线

- [ ] 3.1 接线与分派（触达面 #4 + #18 测试）：`src/index.ts` —— `node:fs/promises` 增 `copyFile,mkdir,rename`、`node:os` 增 `homedir`、`nodeFileSystem` 补 3 原语、`HostPorts extends DeletePorts { archiveRoot }`、`createPorts(ctx, config)` 内 `resolveArchiveRoot`、`createDispatcher(ctx, config)` 按 `parsed.value.mode` 分派 `archiveSession`/`deleteSession`、`apply(ctx, config?)`、`export { Config }`；`test/index.test.ts` —— 全部 payload 补 `mode`，新增真实临时目录用例（预览回声缺省根与自定义根、归档执行断言 `existsSync(dest/...session.v4.jsonl.zstd)===true && existsSync(源)===false` 且缓存删除且 `fakeRegistry.calls` 序列、`archive-unavailable`（归档根父路径为普通文件）返回该码且 registry 零调用、delete 回归断言 `existsSync(home/archive)===false`、缺 mode 的 payload → `bad-request`）。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/index.test.ts test/bundle.test.ts` 退出码 0
- [ ] 3.2 构建与注册注释定稿（触达面 #9 description 部分 + #12 + #13）：`package.json` `description` 更新为 delete-or-archive 表述；`cordis.patch.yml` 注释说明 `archiveRoot` 为可选配置键且裸包名行形态不变；`build.mjs` 头注释补「Schemastery 由构建内联、external 仍只有 node:*」（构建逻辑零改动）。验证：`grep -n "archiveRoot" plugins/web-ux/cordis.patch.yml` 与 `grep -n "Schemastery" plugins/web-ux/build.mjs` 均命中，且 `git diff --stat plugins/web-ux/build.mjs` 显示无代码行改动（仅注释）

## 4. 浏览器半调用面与样式

- [ ] 4.1 调用面携带模式（触达面 #5 + #19 测试）：`src/client/delete-client.ts` —— `DeleteClient.preview(sessionId, mode)` / `remove(sessionId, mode)`、内部 `call(endpoint, body: DeleteRequest)` 发送 `{sessionId, mode}`；`test/delete-client.test.ts` —— 断言两端点 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, {sessionId:'session-1', mode:'archive'})` 与 `mode:'delete'` 另一条、坏形状仍归一 `bad-response`。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-client.test.ts` 退出码 0
- [ ] 4.2 模式区块样式（触达面 #8）：`src/client/delete.module.css` 增 `.modes`/`.modeRow`/`.modeText`/`.archiveTarget`（复用既有 `--dsw-alias-*` 令牌与静态兜底，同现有做法）。验证：`grep -c "modes\|modeRow\|modeText\|archiveTarget" plugins/web-ux/src/client/delete.module.css` ≥4，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.client.json --noEmit` 退出码 0

## 5. 浏览器半对话框

- [ ] 5.1 模式单选与分支文案（触达面 #6 + #20 测试）：`src/client/DeleteSessionDialog.tsx` —— 导出 `DEFAULT_DISPOSAL_MODE='archive'`、`mode` 局部 state、`fieldset`+原生 radio（`deleting` 时 disabled，`previewing`/`failed` 不渲染）、预览只发一次（`client.preview(target.sessionId, DEFAULT_DISPOSAL_MODE)`）、确认调 `client.remove(target.sessionId, mode)`、按 mode 分支 description/体积行（`moveSize` vs `size`）/警示区（`archive` vs `irreversible`）/归档目标行（`dialog.archive.target` 带预览 `archiveRoot`）/确认按钮文案与危险色/进行中文案/完成与失败文案；`test/delete-dialog.test.tsx` —— fakeClient 的 preview 补 `archiveRoot`、断言默认档 radio checked 与「移动到归档目录」按钮、切换后「永久删除」+不可逆警示+「预计释放」、两模式确认分别 `remove('session-1','archive')`/`remove('session-1','delete')`、`deleting` 阶段 radio disabled、归档完成/失败文案、预览失败态无 radio。验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-dialog.test.tsx` 退出码 0，且 `pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.client.json --noEmit` 退出码 0

## 6. 文档与构建产物

- [ ] 6.1 用户文档（触达面 #11）：`plugins/web-ux/README.md` —— 「删除已归档会话」章节增「处置模式」（单选默认迁移、两模式文案差异）与迁移范围（只搬日志目录、保留项目层级、投影缓存删除、附件不动）、新增「归档目录与手工找回」（缺省 `$DSH_HOME/archive/sessions`、`archiveRoot` 配置样例、`mv` 找回命令、插件不提供恢复入口）、半失败警告与手工处理、拒绝码表加 `archive-unavailable`、非目标加「不做恢复 GUI」、宿主 import 例外（Schemastery 内联）、tsconfig 清单、`--dump-config-schema` 说明、版本迁移回滚说明。验证：`grep -n "archiveRoot\|archive/sessions\|移动到归档目录" plugins/web-ux/README.md` 三处均命中
- [ ] 6.2 重建构建产物（触达面 #14）：`pnpm --filter dsh-plugin-web-ux build` 重建 `lib/index.js` 与 `lib/client.js` 并保持入库。验证：`git status --porcelain plugins/web-ux/lib` 显示两文件已更新，且 `node -e "import('./plugins/web-ux/lib/index.js').then(m=>{if(typeof m.Config!=='function')process.exit(1);console.log(JSON.stringify(m.Config({archiveRoot:'/tmp/x'})))})"` 打印 `{"archiveRoot":"/tmp/x"}`

## 7. 终验

- [ ] 7.1 包级全量自检：`pnpm --filter dsh-plugin-web-ux verify:all`（lint → typecheck → build → test）退出码 0；产物自包含复核：`node -e "const s=require('node:fs').readFileSync('plugins/web-ux/lib/index.js','utf8');const w=[...new Set([...s.matchAll(/(?:from\s+\"|require\(\")([^\"]+)\"/g)].map(m=>m[1]))];console.log(JSON.stringify(w))"` 只打印 `node:*` 形态条目（esbuild 依赖路径注释不算）。验证：两条命令退出码 0 且后一条输出不含非 `node:` 模块词
