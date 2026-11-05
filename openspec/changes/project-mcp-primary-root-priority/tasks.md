# Tasks

> 执行批次契约：`## N.` 编号即执行顺序，**组间严格串行**；组内任务互不依赖可并行。每任务描述引用 `code-design.md` 触达面清单条目编号（H1/H2/TS1/DOC1）。发版与 acp/headless 升级为后移动作（Q3/Q4），见文末 Workflow follow-up。

## 1. 归属规则重写与产物重建

- [x] 1.1 按 code-design ③3.3 骨架重写归属模块（触达 H1 `plugins/project-mcp/src/host/attribution.ts`：删 `CanonicalRoot`/`workspaces`/`rootsOf`，增 `RootTable`/`RootIndex`/`EMPTY_INDEX`/`claim()`，两轮建表首写保留 + `this.index` 一次赋值，`attribute()` 快照 + 每层 `primary.get(canonical) ?? granted.get(canonical)`），模块头注释（L1-16，英文）改写为 9 条设计说明（两轮 why / 跨层最近 / 首写保留 / 登记拼写契约 / fail-closed / 软依赖退化 / commonRoots 边界 / 与 scan 分工 / title 仅显示）；导出形状（`RealpathIo`/`Attribution`/`Attributor`）零变化，仅 `workspaceRoot` JSDoc 改「赢家：层内主根优先、跨层最近层优先」；验证：`pnpm --filter dsh-plugin-project-mcp typecheck` 与 `lint` 均 exit 0，`grep -c "this.table" plugins/project-mcp/src/host/attribution.ts` 输出 0，`grep -c "!table.has(canonical)" plugins/project-mcp/src/host/attribution.ts` 输出 1，`grep -n "primary.get(canonical) ?? granted.get(canonical)" plugins/project-mcp/src/host/attribution.ts` 恰 1 行
- [x] 1.2 重建入库产物（触达 H2 `plugins/project-mcp/lib/index.js`）；验证：`pnpm --filter dsh-plugin-project-mcp build` exit 0 且打印 built `lib/index.js`，随后在仓库根执行 `node --input-type=module -e 'const m = await import("./plugins/project-mcp/lib/index.js"); console.log(Object.keys(m).sort().join(","))'` 输出 `apply,inject,name`，且 `grep -c "table.push({ canonical" plugins/project-mcp/lib/index.js` 输出 0

## 2. 归属测试补充

- [x] 2.1 在 `plugins/project-mcp/test/attribution.test.ts`（触达 TS1）追加 5 条用例（命名与断言逐字照 code-design G2：主根压倒更早登记的授予方→`/work/a`；子目录同规则；近层附加根胜远层主根→`/work/b`；双授予按登记顺序→`/work/b1`；granted 复述主根无害→归 `/work/a` 且 `roots` 原样），既有 7 条一字不改，全部沿用 `fakeRealpath` 假表手法（fake 表须含 cwd 到 `/` 每一级与所有 root 的 canonical）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/attribution.test.ts` 输出 12 passed，仓库根 `pnpm test` 退出 0（无跨插件回归）；红基线佐证：组 1 未实施时用例 1 必红（现行实现返回 `/work/b`）

## 3. 插件 README 归属判定段同步

- [x] 3.1 重写 `plugins/project-mcp/README.md` L55-56「归属判定/可见集合」（触达 DOC1，逐字文案照 code-design G3：每层分两轮、同层主根优先、跨层最近层优先、双授予按登记顺序、到根无命中则无归属；L56 补「归属只决定谁赢，不改变赢者可见范围；返回根集合保持登记拼写」与「与 scan 仲裁的分工」一句），历史冒烟记录（L115/136/149）不动（P3）；验证：`grep -n "每一层分两轮" plugins/project-mcp/README.md` 恰 1 行（L55），`grep -c "最近命中" plugins/project-mcp/README.md` 输出 0

## 4. web profile 实机验证（link 先行，acp/headless 暂缓）

- [x] 4.1 装载性与重启验证（P2 已裁定约时重启承载 web profile 的 dsh 进程）：先 `docker exec dsh dsh --profile web --dump-config-schema` exit 0，与用户约时重启后开新会话逐项断言——cwd `~/develop/dotfiles` 会话日志含 `roots=2 visible=[]`（修复前 `roots=5 visible=[dbx,figma,yunxiao]`）且 prompt 的 `## MCP resource servers` 段无 dbx/figma/yunxiao；cwd `~/develop/company/opc` 会话日志 `roots=5 visible=[dbx,figma,yunxiao]` 且任一 `mcp__dbx__*` 可调、`list_mcp_resources` 含 dbx；回归抽查各开新会话：`~/develop/company/web/cloud-the-sky` → `roots=2 visible=[]`、`/home/docker/.cache` 与 `/tmp` → `roots=5`（仍归 opc）、`/etc` → `roots=none`（fail-closed）；dotfiles 会话三面抽查（工具面无 `mcp__dbx__*`、名字面无三台、资源面拒绝文案与上游 unavailable 同形）；`/mcp-reload` 回执计数无新增失败/跳过；验证：上述命令输出与日志逐条贴进变更记录（`docker logs dsh 2>&1 | grep 'isolation: cwd='` 摘录）；注意 dsh-plugins 系与修复前同形不可区分，不作断言

## 5. 本地提交（不 push 不打 tag）

- [x] 5.1 逐路径 add 本变更四文件并本地 commit（P1 裁定：`git add plugins/project-mcp/src/host/attribution.ts plugins/project-mcp/test/attribution.test.ts plugins/project-mcp/README.md plugins/project-mcp/lib/index.js`，提交信息中文概括「修复会话归属被附加根抢注：层内主根优先」；**不得** add 工作区非本变更残留 `pnpm-lock.yaml` 与 `plugins/demo-echo/`，**不** push、**不**打 tag）；验证：`git status --porcelain` 中上述四文件不再出现于未暂存区，`git log -1 --format=%s` 为该提交信息，`git tag --points-at HEAD` 输出为空

## Workflow follow-up

- 发版批次（Q3 后移）：版本号取用与变更日志口径届时拍板（收敛记录见 `diff-matrix.md` Q3）→ `pnpm release <版本>` → 容器内 `git push origin main --tags`（release 会拒绝脏工作区并统一重建产物）
- acp/headless 升级（Q4 暂缓）：`docker exec dsh dsh plugin --profile <p> add "github:exponentxqq/dsh-plugins#v<新tag>&path:plugins/project-mcp"`（现为 v1.1.1 真实拷贝；project-mcp 无原生依赖无 allowBuilds 表态）→ 装后 `--dump-config-schema` + 按 tasks 组 4 断言口径逐 profile 抽查
- dotfiles 仓落地（另行处理）：按本目录 `design.md`「触达面 DOC2」与 `code-design.md` G5 的待改句清单改写 `dsh/README.md` L304-305，落地后 `grep -n "只有 opc 工作区" dsh/README.md` 无输出、`grep -n "只有归属 opc 工作区" dsh/README.md` 恰 1 行
- 兄弟插件归属语义对齐评估（P4 另开变更）：`session-tool-toggle` 归属只认主根（服务「工作区默认档」键，语义本就是主根，未必缺陷），与 project-mcp/user-commands 的 tiered 规则不一致是现状
- 归档：任务全部完成后按 OpenSpec 流程 archive（delta 合并入权威 spec）
