# Tasks

> 条目编号（如「#25」）指本变更目录 `code-design.md` ① 触达面清单的文件项；行号与实现细节以其为权威。
> 组间严格串行执行；组内任务互不依赖、可并行。验证句均为第三方可核对断言。

## 1. 执行前置核验

- [ ] 1.1 核验规划工件齐备与基线：确认本变更目录含 proposal/design/tasks/specs 四件套与 `code-design.md`、`diff-matrix.md` 两材料，且未触碰在途变更；验证：`test -f openspec/changes/unify-workspace-config-entry/code-design.md && test -f openspec/changes/unify-workspace-config-entry/diff-matrix.md && openspec validate --all` 退出码 0，且 `git status --porcelain openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog` 无输出

## 2. holder 骨架与类型权威

- [ ] 2.1 创建 `plugins/workspace-config/` 全部骨架文件（#1–#5、#12、#14、#20、#21：package.json 双端声明与 d.ts exports、cordis.patch.yml 裸包名行、build.mjs（build = build:types + esbuild 双端）、tsconfig×4（client 发射 d.ts）、src/index.ts no-op 锚点、src/client/contract.ts 座位契约唯一权威、locales.ts 双语 7 键、css-modules.d.ts、.oxlintrc.json、vitest.config.ts、test/stubs 骨架、README）；验证：`node -e "const p=require('./plugins/workspace-config/package.json'); if(p.dsh.client.platform!=='web'||!p.exports['./client'].types) process.exit(1)"` 退出码 0，且 `grep -c "workspace-config.section" plugins/workspace-config/src/client/contract.ts` ≥ 1
- [ ] 2.2 根 README 插件一览加 workspace-config 行并补四包同装说明（#23）；验证：`grep -n "dsh-plugin-workspace-config" README.md` 命中且所在段落含「四包同装」（或同义表述）字样

## 3. 首次构建与仓级门禁

- [ ] 3.1 安装依赖、完成首次构建并落产物断言：`pnpm install` 更新 lockfile（#22），`pnpm --filter dsh-plugin-workspace-config build` 产出三件（lib/index.js 仅 node:*、lib/client.js 带 loader 壳、lib/types/client/index.d.ts），编写 `test/bundle.test.ts` manifest 断言（#19），随后跑 `pnpm dsh:check && pnpm -r typecheck && pnpm -r test` 全绿；验证：`test -f plugins/workspace-config/lib/types/client/index.d.ts && test "$(grep -c 'window.__ModuleLoader__.load' plugins/workspace-config/lib/client.js)" -eq 1 && pnpm --filter dsh-plugin-workspace-config test` 退出码 0

## 4. 分节座位运行时 PoC（前置风险门）

- [ ] 4.1 用真 `dsh-client-ui-renderer` + cordis Context 在 jsdom 实证 children 声明 / only 过滤 / label 双态（字符串与 thunk）/ 后装补跑四断言（#18），PoC 常驻为回归哨兵，并把结果回填本变更 design.md「运行时实证」小节；任一断言失败立即停批上浮，不自行改方案；验证：`pnpm --filter dsh-plugin-workspace-config test -- section-seat.poc` 退出码 0，且 `grep -c "运行时实证" openspec/changes/unify-workspace-config-entry/design.md` ≥ 1

## 5. 入口与弹窗壳（实现 + 测试一体）

- [ ] 5.1 实现打开桥、nav 投影、触发按钮、弹窗壳、样式与装配（#7–#11、#13：open-store 布尔快照、sections 双版本记忆投影、trigger 宽态 ellipsis/折叠 28px/aria 恒在/禁 flex:none、dialog 为 Modal headless + children 声明 + renderSlot only + 空态 + 关闭态渲染 null、index.ts 两处软注册 try/catch），并补组件测试与 stubs、扩展 bundle.test 座位断言（#15–#17、#20）；验证：`pnpm --filter dsh-plugin-workspace-config typecheck && pnpm --filter dsh-plugin-workspace-config test` 退出码 0，且 `test "$(grep -o 'workspace-config\.section' plugins/workspace-config/lib/client.js | wc -l)" -ge 2` 且 `test "$(grep -r 'flex: none' plugins/workspace-config/src/client | wc -l)" -eq 0`

## 6. 三插件分节迁移（组内三包并行）

- [ ] 6.1 multi-root-workspace：删 footer 注册（#25）、Dialog 剥壳为 WorkspaceFoldersSection（#26）、样式族裁剪（#27）、locale 新键（#28）、devDep 加 holder（#29）、测试断言迁移（#30–#31）、AGENTS 不变量 5 与文档/ADR-0013 同步（#32–#34）、重建 lib（#35）；验证：`test "$(grep -r 'sidebar.footer.action' plugins/multi-root-workspace/src | wc -l)" -eq 0 && pnpm --filter dsh-plugin-multi-root-workspace typecheck && pnpm --filter dsh-plugin-multi-root-workspace test && pnpm --filter dsh-plugin-multi-root-workspace docs:check` 退出码 0
- [ ] 6.2 session-tool-toggle：删 footer 注册并新增分节注册与 locale.bind（#36）、WorkspaceEntry 拆解导出 WorkspaceDefaultsSection（dialog 形态保留工作区下拉，#37）、seats 常量替换（#38）、样式裁剪与新键（#39–#40）、依赖收敛（#41）、测试断言迁移与新增用例含「与 /tools 共用状态」回归（#42–#44）、README 与 lib（#46）；验证：`test "$(grep -rE 'sidebar\.footer\.action|FOOTER_SEAT|FOOTER_ID|FOOTER_ORDER' plugins/session-tool-toggle/src | wc -l)" -eq 0 && test "$(grep -c 'dsh-client-ui-sidebar' plugins/session-tool-toggle/package.json)" -eq 0 && pnpm --filter dsh-plugin-session-tool-toggle typecheck && pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0
- [ ] 6.3 web-ux：删 footer trigger 与 manager overlay 两注册及常量（#47）、SessionManagerDialog 剥壳为 SessionManagerSection（五阶段内联、client 缺席渲染空态、close 接座位 owner，#48）、删 SessionManagerTrigger 与 session-manager-store（#49–#50）、样式与 locale（#51–#52）、依赖收敛（#53）、测试断言迁移与用例改造（#54–#57）、README 与 lib（#58）；验证：`test "$(grep -rE 'sidebar\.footer\.action|MANAGER_TRIGGER|MANAGER_OVERLAY' plugins/web-ux/src | wc -l)" -eq 0 && test "$(grep -c 'dsh-client-ui-sidebar' plugins/web-ux/package.json)" -eq 0 && pnpm --filter dsh-plugin-web-ux typecheck && pnpm --filter dsh-plugin-web-ux test` 退出码 0

## 7. 集成回归与组合矩阵

- [ ] 7.1 四格安装组合矩阵单测（全装 / 只 holder 空态 / 只贡献方×3 不触发不报错 / 后装 holder 补跑——落点为各包既有 fake-ctx 测试扩展）后跑全仓递归门禁；验证：`pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm dsh:check` 退出码 0，且三包共同断言 `for p in multi-root-workspace session-tool-toggle web-ux; do test "$(grep -c 'dsh-plugin-workspace-config' "plugins/$p/lib/client.js")" -eq 0 || echo "FAIL $p"; done` 无 FAIL 输出

## 8. link: 安装演练（真机前置）

- [ ] 8.1 以 link: 把 holder 装入 profile 并断言装载（#24 之外不改 profile 其他内容）；验证：`docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/workspace-config` 后 `test "$(docker exec dsh dsh plugin --profile web list | grep -c 'dsh-plugin-workspace-config@link:')" -eq 1` 且 `docker exec dsh dsh --profile web --dump-config-schema | grep -c 'workspace-config'` ≥ 1；随后提示用户重启 profile

## 9. 真机双形态验收与冒烟留档

- [ ] 9.1 从 `docker logs dsh` 取 token 链接进 GUI，逐项走查：宽栏 256px 单入口完整可见 + a11y 树按钮名、折叠 56px 图标完整居中、三节功能面（Folders 增删别名 / 默认档读写与工作区下拉切换并与 /tools 状态一致 / 会话管理三 tab 与批量语义）、迁移回归（Files tab 入口、/workspace-folders、/tools、行菜单删除与 500 弹窗不叠放）、降级反例（禁用 stt 后节消失无报错、禁用 holder 后 footer 无入口且 web-ux 会话管理不可达符合约定）、Menu portal 复验（Escape 先关菜单再关弹窗）、D16（running 中关闭即关闭）；结果按「步骤/结论/证据」落 `plugins/workspace-config/artifacts/workspace-config-smoke.md`（#21）；验证：`test -f plugins/workspace-config/artifacts/workspace-config-smoke.md && test "$(grep -c 'PASS' plugins/workspace-config/artifacts/workspace-config-smoke.md)" -ge 12`

## 10. 收口

- [ ] 10.1 收口自检：核对本变更 tasks 全勾、`openspec validate unify-workspace-config-entry --strict` 退出码 0、`pnpm verify` 退出码 0、`node scripts/release.mjs 1.6.0 --dry-run` 仅打印不产生 git 变更（本次**不打 tag**，版本与 tag 留待下一批变更统一发布）；验证：四条命令退出码 0，且 `git status --porcelain | grep -c "openspec/changes/unify-workspace-config-entry"` > 0
