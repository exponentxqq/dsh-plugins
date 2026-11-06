# Tasks

> 执行批次契约:`## N.` 组间严格串行;组内任务互不依赖、可并行(资源竞争时由执行侧先后调度);每任务描述引用 `code-design.md` 触达面条目编号;验证句均为第三方可核对命令。

## 1. 升级脚本增强

- [ ] 1.1 `scripts/upgrade-dsh.mjs` 新增 `schemasteryRequiredBy(target)`:经 `npmOutput` 查 `npm view @deepseek-ai/dsh-tools@<target> dependencies.@deepseek-ai/schemastery`,解析单个 tilde/caret 取精确版(非单一声明抛错含原文,与 `cordisRequiredBy` 同构),并在 `repointPlugin`/`repointWorkspace` 增加 schemastery 的 devDep 与豁免行重写分支(触达面 A10、决策 D5);验证:`node -e "const m=require('./scripts/upgrade-dsh.mjs')"` 退出码 0 后,在容器内以当前基线干跑 `docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && pnpm dsh:upgrade --print-installed'` 退出码 0,且 `grep -c schemasteryRequiredBy scripts/upgrade-dsh.mjs` ≥ 2

## 2. probe 升级与探测

- [ ] 2.1 在 dsh 容器内执行探测命令链(触达面 A1-A5 脚本部分,组要点②):先 `git status --porcelain` 确认仅原 3 个 openspec 脏文件,再依次 `pnpm dsh:upgrade 0.2.2-rc.1 --probe` → `pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0` → `DSH_MULTI_ROOT_COMPAT=warn pnpm --filter dsh-plugin-multi-root-workspace verify:all`(三条均以 `docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && …'` 执行,环境变量必须写在容器内层);验证:脚本 stdout 含 `[upgrade] baseline: 0.2.1-rc.5 → 0.2.2-rc.1`、`[upgrade] cordis pin: 4.1.0`、schemastery 重写 `3.18.5 → 3.19.0` 三行;`grep -c "BEGIN DSH probe overrides" pnpm-workspace.yaml` = 1;容器内 `cd plugins/multi-root-workspace && node -p "require('@deepseek-ai/dsh/package.json').version + ' ' + require('@deepseek-ai/cordis/package.json').version + ' ' + require('@deepseek-ai/schemastery/package.json').version"` 输出 `0.2.2-rc.1 4.1.0 3.19.0`;warn `verify:all` 退出码 0 且测试计数相对上轮基线(405 passed/5 skipped、compose 46/46、behavior 99/99、journey 60/60)的变化均有解释记录

## 3. 形状核对

- [ ] 3.1 cordis 4.1.0 形状核对(触达面 A10 关联证据面,组要点③-1):容器内 `pnpm --filter dsh-plugin-multi-root-workspace lint && pnpm --filter dsh-plugin-multi-root-workspace typecheck` 与 `pnpm -r run typecheck`;验证:全部退出码 0;若任一红,仅在 `src/compat/` 加结构探测式最小适配(禁止版本号分支)并把差异记录为执行留痕
- [ ] 3.2 zod 契约核对(决策 D4):容器内 `pnpm why -r zod`;验证:`cd plugins/multi-root-workspace && node -p "require('zod/package.json').version"` 与 `cd plugins/session-tool-toggle && node -p "require('zod/package.json').version"` 均输出 `4.4.3`
- [ ] 3.3 session format 核对(触达面 B1 结论输入):容器内 `cd plugins/multi-root-workspace && node --input-type=module -e "const m = await import('@deepseek-ai/dsh-session'); console.log(m.SESSION_FORMAT_VERSION)"`;验证:输出 `4`
- [ ] 3.4 新包只记录不接入(决策 D1 范围):`grep -rn "dsh-client-ui-context-menu" plugins/*/src | wc -l`;验证:输出 `0`(该包仅出现在 lockfile 与豁免)
- [ ] 3.5 安装树单一性核对:`docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && pnpm why -r @deepseek-ai/schemastery'`;验证:输出仅含 `3.19.0` 一个版本

## 4. 支持矩阵裁剪提升

- [ ] 4.1 改 `plugins/multi-root-workspace/src/compat/dsh-version.ts`(触达面 A6,决策 D3):L34 数组 11→3 项 `['0.2.1-rc.2', '0.2.1-rc.5', '0.2.2-rc.1']`;验证:`grep -c "'0.2.1-rc.2', '0.2.1-rc.5', '0.2.2-rc.1'" plugins/multi-root-workspace/src/compat/dsh-version.ts` = 1 且 `grep -c "0\.1\.5-rc\.2" plugins/multi-root-workspace/src/compat/dsh-version.ts` = 0
- [ ] 4.2 同步 multi-root `package.json` 的 21 项 DSH peer 为同一串(触达面 A5):用 code-design 组 3 的 node 单行脚本批量重写;验证:`node -e "const m=require('./plugins/multi-root-workspace/package.json');const p=Object.entries(m.peerDependencies).filter(([n])=>n.startsWith('@deepseek-ai/dsh'));console.log(p.length, new Set(p.map(([,v])=>v)).size)"` 输出 `21 1` 且 cordis peer 仍为 `>=4.0.1 <5.0.0`
- [ ] 4.3 ADR-0009 追加「支持矩阵裁剪与提升(2026-11-06)」节(触达面 B3,决策 D7):置于实测段后、`## Related Documents` 前,含裁剪理由(11→3)、warn 探测计数、cordis 4.1.0/schemastery 3.19.0/zod 4.4.3/session format 4 形状结论、零适配结论(依组 3 结果);验证:`grep -n "2026-11-06" plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` 命中新节标题,且 `git diff plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` 无历史节删除行

## 5. 收口对账

- [ ] 5.1 移除 probe overrides 并对账豁免(触达面 A2,组要点⑤):容器内 `pnpm dsh:upgrade 0.2.2-rc.1`(不带 --probe)→ `pnpm install --frozen-lockfile`(若报 OUTDATED_LOCKFILE 则 `--no-frozen-lockfile` 后确认 `git diff pnpm-lock.yaml` 无变化)→ `pnpm dsh:check`,按 missing/stale 输出人工增删豁免条目(预期新增 `dsh-client-ui-context-menu@0.2.2-rc.1`、schemastery 行 `3.19.0`)后重跑;验证:`grep -c "BEGIN DSH probe overrides" pnpm-workspace.yaml` = 0;`pnpm dsh:check` 退出码 0 且末行为 `[dsh:check] baseline, pins, soft ranges, allowlist, lockfile and installed tree agree`;`pnpm --filter dsh-plugin-multi-root-workspace compat:check` 退出码 0 且输出含 `[compat] allowlist: 0.2.1-rc.2, 0.2.1-rc.5, 0.2.2-rc.1`

## 6. 全量代码验证

- [ ] 6.1 multi-root enforce 全矩阵(组要点⑥):容器内 `pnpm --filter dsh-plugin-multi-root-workspace verify:all`(不设 DSH_MULTI_ROOT_COMPAT);验证:退出码 0;kernel:probe 的 skip 必须附原因;smoke 三段计数记录
- [ ] 6.2 仓库级构建与测试(组要点⑥):容器内 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`;验证:退出码 0;`git status --porcelain` 中 `openspec/` 仍只有原 3 个脏文件

## 7. 文档同步

- [ ] 7.1 改 `plugins/multi-root-workspace/AGENTS.md` H3 段(触达面 B1):支持列表三项 + dev pin `0.2.2-rc.1` + 0.2.2-rc.1 形状结论;验证:`grep -c "0\.2\.2-rc\.1" plugins/multi-root-workspace/AGENTS.md` ≥ 1 且 `grep -c "0\.1\.5-rc\.2" plugins/multi-root-workspace/AGENTS.md` 为历史叙述行(当前支持列表不再以 0.1.x 开头)
- [ ] 7.2 改 multi-root `README.md` 与 `README.en.md`(触达面 B2):支持列表三项、dev pin、补 Node `>=24.9.0` 环境要求一句(双语同步);验证:`grep -c "24\.9\.0" plugins/multi-root-workspace/README.md plugins/multi-root-workspace/README.en.md` 各 ≥1;`grep -c "0\.1\.5-rc\.2" plugins/multi-root-workspace/README.md plugins/multi-root-workspace/README.en.md` 各 0
- [ ] 7.3 改 `plugins/multi-root-workspace/docs/development/plugin-development-workflow.md`(触达面 B4):基线样例、命令样例改 `0.2.2-rc.1`、「20 项 DSH peer」改「三项」;验证:`grep -c "20 项 DSH peer" plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` = 0 且 `grep -c "0\.2\.2-rc\.1" plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` ≥ 3
- [ ] 7.4 改 `.agent/note/dsh-compat-contract.md` 与 `.en.md`(触达面 B5):数组、peer 串、dev pin、升级命令样例、形状结论;L140 zod 对齐记载保留不动;验证:`grep -c "0\.2\.1-rc\.2 || 0\.2\.1-rc\.5 || 0\.2\.2-rc\.1" plugins/multi-root-workspace/.agent/note/dsh-compat-contract.md plugins/multi-root-workspace/.agent/note/dsh-compat-contract.en.md` 各 1
- [ ] 7.5 改根 `README.md` 与 `AGENTS.md` 基线行(触达面 B6,收敛 Q2 顺带修正历史漂移):`0.2.1-rc.2` → `0.2.2-rc.1`,README「五个软插件」改「六个」;验证:`grep -n "0\.2\.1-rc\.2\|0\.2\.1-rc\.5" README.md AGENTS.md` 无输出

## 8. 终态复验

- [ ] 8.1 文档与产物终态断言(组要点⑥⑦收口):容器内 `pnpm docs:check && pnpm dsh:check`;验证:均退出码 0;`git diff --stat -- 'plugins/*/lib'` 只含 4 个插件(multi-root 的 compat chunk/d.ts/index.js 与 web-ux/session-tool-toggle/zcode-plan 的 schemastery 内联),project-mcp/user-commands/workspace-config 的 lib 零 diff;`git status --porcelain` 中 `openspec/` 仍只有原 3 个脏文件

## 9. web profile 官方包升级与非中断验收

- [ ] 9.1 profile 升级与验收命令链(触达面 C1/C2,决策 D6,组要点⑧):先记录基线四项计数(incompatible=4、schema stderr=24 行、multi-root- 行=0、bundles=20),再 `docker exec dsh dsh plugin --profile web add --save-exact @deepseek-ai/dsh-browser-use@0.2.2-rc.1 @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.2.2-rc.1`,随后逐项核对;验证:`docker exec dsh sh -lc 'sed -n 31,32p ~/.dsh/profiles/web/package.json'` 两行均为 `"0.2.2-rc.1"`(无 `^`);`docker exec dsh dsh plugin --profile web list 2>&1 | grep -c "incompatible with dsh"` = 0;`--dump-config-schema` stderr ≤21 行且不含 multi-root;`--dump-config` 中 `multi-root-` 去重 id 数 = 11;node_modules 四包版本前三行 `0.2.2-rc.1`、第四行 `1.12.0`(override 保留,Q-D);bundles 长度 = 20;仓库内 `node --input-type=module -e "const m=await import('./plugins/multi-root-workspace/lib/compat.js');console.log(m.classifyInstallation().verdict, m.classifyInstallation().release)"` 输出 `supported 0.2.2-rc.1`

## 10. 重启后验收

- [ ] 10.1 操作者在会话外执行 `docker restart dsh`(分歧点 Q-A:重启中断当前 GUI 会话,agent 只给命令与判据),重启后 agent 核对;验证:`docker exec dsh dsh --version` = `0.2.2-rc.1`;`docker exec dsh dsh plugin --profile web list 2>&1 | grep -c incompatible` = 0;`docker exec dsh sh -lc 'ls -t ~/.dsh/logs/startup-*.log | head -1 | xargs grep -c "not a supported release"'` = 0;UI 冒烟:设置→插件列表无 incompatible 警示、侧栏「工作区配置」弹窗四分节齐、`/workspace-folders` 可用、browser-use 工具可用

## 11. 按路径隔离提交

- [ ] 11.1 仓库改动单独提交(分歧点 Q-E:不等在途 project-mcp 变更,禁止 `git add -A`):仅 `git add` 本变更触达的仓库路径(基线/脚本/workspace/lockfile/七插件/文档);验证:`git status --porcelain` 提交后仅剩原 3 个 project-mcp 脏文件;`git log -1 --stat` 不含 `openspec/changes/project-mcp-isolation-enforcement/` 任何路径;提交信息含 `0.2.2-rc.1` 与「基线升级」字样
