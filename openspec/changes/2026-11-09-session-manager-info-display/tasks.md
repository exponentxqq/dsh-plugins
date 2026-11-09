# Tasks

> 触达条目编号指随档 `code-design.md` ① 触达面清单（1.1 源码 / 1.2 测试 / 1.3 产物 / 1.4 规范与文档）；组间严格串行，组内任务互不写同一文件。

## 1. 契约与读取器基座

- [ ] 1.1 扩展 `MigratedEntry` 两个可选字段（`title?`/`createdAt?`，存在即合法、缺失即不写键）与 `parseMigratedListing` 对应校验，并在契约测试补三分用例（存在合法接受 / 缺失无键 / 空串、零、负值、非有限数拒绝并带字段名）（触达 ①1.1 `plugins/web-ux/src/contract.ts`、①1.2 `plugins/web-ux/test/contract.test.ts`）；验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/contract.test.ts` 退出码 0，且用例含「结果对象不含 `title` 键」断言（`'title' in value === false`）
- [ ] 1.2 新建纯逻辑读取器：规范日志文件名挑选、zstd 帧边界惰性扫描（FHD 位域按上游判据、结构性异常即止不抛）、逐帧解压、首个 `session/title` 提取、header `createdAt` 提取、两段压缩前缀（128KiB→512KiB）与 256KiB 文本预算；新建对应测试（含 `createZstdCompress()` 流式帧断言 FHD bit5=0 覆盖 Window_Descriptor 分支）并把新源码与用例纳入 host 编译（触达 ①1.1 `plugins/web-ux/src/session-log-title.ts`〔新建〕、①1.2 `plugins/web-ux/test/session-log-title.test.ts`〔新建〕、①1.2 `plugins/web-ux/tsconfig.host.json`）；验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/session-log-title.test.ts` 退出码 0，且 `grep -nE "from 'node:" plugins/web-ux/src/session-log-title.ts` 无输出

## 2. 宿主接线

- [ ] 2.1 `migrated.ts` 枚举后置标题探测（`MigratedPorts` 增可选 `log` 端口、并发上限 3、探测永不抛且零新增 warning，结果条件展开并入条目）+ `index.ts` 的 `node:zlib`/`node:fs` 适配器（特性探测 `zstdDecompressSync`，缺失则端口缺省）+ 流程与真链路测试扩展（fake `log` 端口断言字段携带/缺省/失败降级/并发与读取次数上限；真实 zstd 帧拼接走 `list-migrated` 断言 `title`/`createdAt`）+ 宿主产物重建（触达 ①1.1 `plugins/web-ux/src/migrated.ts`、①1.1 `plugins/web-ux/src/index.ts`、①1.2 `plugins/web-ux/test/migrated.test.ts`、①1.2 `plugins/web-ux/test/index.test.ts`、①1.3 `plugins/web-ux/lib/index.js`）；验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/migrated.test.ts test/index.test.ts` 退出码 0，且 `pnpm --filter dsh-plugin-web-ux build` 后 `grep -c "zstd" plugins/web-ux/lib/index.js` 命中 ≥1

## 3. client 纯派生

- [ ] 3.1 新建 `display-format.ts`（`shortCodeOf` 16 字符短码 / `tailSegmentOf` POSIX·Win32·根·空四分 / `formatCompactTimestamp` 当年省年、跨年全日期、返回 `{text,full}`，纯函数零 React）与测试；扩展 model 行字段（`SessionRowViewInput` +`cwd?`/`parentId?`；`SessionRowView` +`cwd`/`projectDirTail`/`isFork`；`MigratedRowView` +`title`/`titleSource`/`createdAt`/`workspaceTitle`/`shortId`）与过滤函数族（`ManagerFilters`/`withTabFilter`/`normalizeFilterQuery`/`filterSessionRows`/`filterMigratedRows`，大小写不敏感、跨 tab 独立、全选与动作输入按可见行投影）及测试；新用例纳入 client 编译（触达 ①1.1 `plugins/web-ux/src/client/display-format.ts`〔新建〕、①1.2 `plugins/web-ux/test/display-format.test.ts`〔新建〕、①1.2 `plugins/web-ux/tsconfig.client.json`、①1.1 `plugins/web-ux/src/client/session-manager-model.ts`、①1.2 `plugins/web-ux/test/session-manager-model.test.ts`）；验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/display-format.test.ts test/session-manager-model.test.ts` 退出码 0，且 `grep -rnE "from 'node:|zstd" plugins/web-ux/src/client/` 无输出

## 4. 视图与样式文案

- [ ] 4.1 两行式行渲染（首行 Checkbox 唯一可访问名 + 徽标、次行 `.rowMetaRow` 弱化 meta：短码 id · 工作区名/目录 · 体积 · 紧凑时间）、域 tab 计数徽标（`aria-hidden`）、过滤框与过滤空态、已迁移 tab 归档根行、迁移时间主显 + 创建时间并入悬停、`selectedTabLabel` 助手改按可访问名断言；CSS 类名契约同步；locales 新增 6 键×2 语言；组件与 locale-parity、bundle 断言（宿主含 `node:zlib`、client 不含）扩展；client 产物重建（触达 ①1.1 `plugins/web-ux/src/client/SessionManagerDialog.tsx`、①1.1 `plugins/web-ux/src/client/session-manager.module.css`、①1.1 `plugins/web-ux/src/client/locales.ts`、①1.2 `plugins/web-ux/test/session-manager-dialog.test.tsx`、①1.2 `plugins/web-ux/test/locale-parity.test.ts`、①1.2 `plugins/web-ux/test/bundle.test.ts`、①1.3 `plugins/web-ux/lib/client.js`）；验证：`pnpm --filter dsh-plugin-web-ux exec vitest run test/session-manager-dialog.test.tsx test/locale-parity.test.ts test/bundle.test.ts` 退出码 0，且 `grep -c "aria-hidden" plugins/web-ux/src/client/SessionManagerDialog.tsx` 命中 ≥1

## 5. 文档

- [ ] 5.1 更新 `plugins/web-ux/README.md`「会话管理」节：行展示字段、两行式布局、过滤与域计数、归档根显示、标题提取机制与已知限制（尽力显示、约 6% 可能陈旧、约 0.5% 回退短码）（触达 ①1.4 `plugins/web-ux/README.md`）；验证：`pnpm docs:check` 退出码 0，且 `grep -n "已知限制\|尽力显示" plugins/web-ux/README.md` 有命中

## 6. 门禁验证

- [ ] 6.1 全量门禁回归（触达 ①1.3 全部产物核对）；验证：`pnpm --filter dsh-plugin-web-ux verify:all` 退出码 0，且根目录 `pnpm spec:check`、`pnpm dsh:check` 依次退出码 0
