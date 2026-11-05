# Design

> 深度契约六字段（①触达面 ②证据锚 ③接口与数据形状 ④决策 ⑤逐组要点 ⑥假设与未决项）由阶段 1.7 设计线产出，全文见本目录 `code-design.md`（落档副本为权威）；本文逐断言承载并给执行侧可读的浓缩版。收敛留痕见本目录 `diff-matrix.md`（Q1–Q4 与 E1–E8 权威）。

## Context

现行归属：`Attributor.update()`（`src/host/attribution.ts:66-96`）把全部根按 registry 顺序混排一张 `CanonicalRoot[]`，`attribute()` 逐层 `find` 首条命中——primary/granted 身份在建表时被丢弃，归属由 registry 顺序决定。本机实证（docker logs）：`cwd=…/dotfiles roots=5 visible=[dbx,figma,yunxiao]`（被 opc 抢注，bug）、`cwd=…/person/dsh-plugins roots=2 visible=[]`（被 dotfiles 抢注，同一 bug 第二实例）。红基线实测：现行实现跑回归夹具 `[B=/work/b（授予 /work/a）, A=/work/a]` 的 `attribute('/work/a')` 返回 `/work/b`。

约束（需求原文 + 收敛裁定）：`roots.ts`/`scan.ts` 零改动（serverName 先到先得仲裁依赖有序 root set）；isolation 三面单点派生自 `index.ts:97` 归属端口、自动跟随；发版后移（Q3）；web=link 先行验证（Q4）。

## Goals / Non-Goals

**Goals**：
- 归属规则确定性化：层内 primary 优先于 granted（Q1）、跨层最近层优先（Q1）、同层双授予按登记顺序取首者（Q2）、无命中 fail-closed
- 归属返回**完整根集合**且保持**登记拼写**（`serverNamesForRoots` 的 `roots.has(source.root)` 精确比较依赖，`mcp-manager.ts:164-168`）
- 规则写成 `attribution.ts` 模块注释同级设计说明（9 条必写，见 ⑤ 要点）

**Non-Goals**：
- 不改 scan 仲裁 / isolation 机制 / multi-root 插件 / 权威 spec（archive 时由 delta 合并）
- 不做共享根路径特判（Q2 裁定；commonRoots 退化边界仅写入设计说明）
- 不动 `package.json` 版本、不发版、不推送（Q3；P1 仅本地 commit）
- 不动 `session-tool-toggle` 的主根-only 归属（P4 另开评估）
- dotfiles 仓只列待改句不落地（G5 清单见下）

## Decisions

（完整版含反例见 `code-design.md` ④，D-0..D-9；此处逐条浓缩）

- **D-0 栈与 writer 留痕**：本包按 host-only 软插件处理（esbuild `build.mjs`、`lib/` 入库、无 `dsh.client`、无原生依赖）。**栈识别结论：writer skill = `dsh-plugin-writer`（用户指认，聚合层存在并已由设计线加载为其硬约束）**；探测证据：无 `pom.xml`/`nuxt.config.*`，依赖仅 `yaml` + devDeps `esbuild/oxlint/typescript/vitest`。执行侧与接续恢复从本节读取该结论。
- **D-1 语义（Q1）**：每层 `primary.get(c) ?? granted.get(c)`，逐层上溯不变。被否：primary 无条件优先（反例：本机 `~/.cache` 被外层 `/home/docker` 主根吞掉，超范围行为变化）；只认 primary（破坏既有 additional-root 用例与联动预期）；单表全局 tier 排序（远层 primary 压近层 granted，同 bug）。
- **D-2 形状**：`primary`/`granted` 两张同型 `Map<canonical, Attribution>`，tier 在读路径显式。被否：折叠单表（user-commands 现形，可证等价但 tier 藏进建表顺序——合并两轮为单循环时**本 bug 一字不差复活**）。
- **D-3 表内仲裁**：两表均**首写保留**（`!has → set`，= registry 顺序）。被否：覆盖式 set（双授予归最后登记者，与现行 `find` 首条及 scan 仲裁哲学相反）。
- **D-4 原子提交**：`update()` 本地建全量两表、末尾 `this.index = { primary, granted }` 一次赋值；`attribute()` 入口取一次快照走完上溯。反例：现行先赋 `workspaces` 后建表，重扫 await 间隙并发归属可读到跨世代答案。
- **D-5 返回值**：表项即 `Attribution`（`workspaceRoot` + `roots = workspace.roots` 原数组）。被否：canonical 拼写（`roots.has(source.root)` 全失配 → visible 恒空，比 bug 更糟）；浅拷贝（唯一消费者只读，零收益）。
- **D-6 不动 roots/scan**：被否「顺手改 root set 顺序修归属」——会改 serverName 胜者（冒烟 `probe-shared` 锚点）。
- **D-7 测试手法**：沿用 `fakeRealpath` 假表 + `workspace()` 构造，断言具体归属值。被否：tmpdir 真 realpath（随机器漂移）；只断言非 null（红基线也绿，无回归作用）。
- **D-8 文档示例**：新文案的 fail-closed 示例用未登记目录（如 `/etc`），不再用 `/tmp`（本机 `/tmp` 自 10-12 起是 opc 附加根，实测归 opc）；历史冒烟记录不改（P3）。
- **D-9 诊断行不改**：`roots=N visible=[…]` 形状不变；dsh-plugins 系修复前后无任何可观测差异（两工作区互相授予、根集合作为集合相同），该系变化只能靠单测证明（⑥ A6，E8 校正）。
- **执行环境**：直用主工作区（衔接点判据全不命中：工作区干净、无并行分支/worktree、无用户明示；本仓工件与代码同仓，隔离徒增分提复杂度）。创建于 2026-11-05

## 触达面清单（① 浓缩，全文见 code-design.md ①）

| 条目 | 文件（仓） | 改动 |
| --- | --- | --- |
| H1 | `根仓·plugins/project-mcp/src/host/attribution.ts` | 重写：删 `CanonicalRoot`/`workspaces`/`rootsOf`，增 `RootTable`/`RootIndex`/`EMPTY_INDEX`/`claim()`；两轮建表 + 一次提交 + 快照读；模块注释（L1-16，英文）改写为 9 条设计说明 |
| H2 | `根仓·plugins/project-mcp/lib/index.js` | `pnpm --filter dsh-plugin-project-mcp build` 重建（入库产物；web link 加载它，不重建则实机验证看不到变化） |
| TS1 | `根仓·plugins/project-mcp/test/attribution.test.ts` | +5 用例（见组 2），既有 7 条一字不改 |
| DOC1 | `根仓·plugins/project-mcp/README.md` | L55-56「归属判定」段重写（逐字文案见 code-design G3）+「与 scan 仲裁的分工」一句 |
| DOC2 | `dotfiles 仓·dsh/README.md` | **只列待改句不落地**：L304-305「只有 opc 工作区（主根，或以 opc 为附加根）的会话可见 `mcp__dbx__*`」→ 建议「只有**归属 opc 工作区**的会话可见……（`~/develop/dotfiles` 是独立工作区，不再因被 opc 授为附加根而看到 dbx）」 |
| SPEC1 | `根仓·openspec/changes/project-mcp-primary-root-priority/specs/dsh-project-mcp/spec.md` | 落档产物（本变更 delta，不进执行批次） |

明确不改：`roots.ts`、`scan.ts`、`isolation.ts`、`prompt-isolation.ts`、`index.ts`、`mcp-manager.ts`、`package.json` 版本、`cordis.patch.yml`、`build.mjs`、multi-root-workspace、权威 spec、dotfiles 仓。

## 接口与数据形状（③ 浓缩）

对外接口**零变化**：`RealpathIo` / `Attribution { workspaceRoot, roots }` / `Attributor { constructor, update, attribute }` 导出形状不变（仅 `workspaceRoot` 的 JSDoc 改「赢家：层内主根优先、跨层最近层优先」）；`index.ts:97` 端口不变；**无新配置键/环境变量/端口**。模块内：`type RootTable = ReadonlyMap<string, Attribution>`；`interface RootIndex { primary, granted }`；`update()` 两轮 `claim()`（每表首写保留）→ `this.index` 一次赋值；`attribute()` 快照 + 每层 `primary.get(canonical) ?? granted.get(canonical)`。TS 骨架见 `code-design.md` ③3.3（可直接落地）。

不变式（须写进模块注释）：`roots[0] === primaryRoot`（granted 轮从 `slice(1)` 起）；同 tier 首写保留、跨 tier 由 `??` 保证 primary 先；granted 表收进与 primary 同 canonical 条目无害（**不得**加去重——会动摇 registry 顺序语义）；表项只读共享、`roots` 保持登记拼写；软依赖降级（multi-root 缺席 → granted 表空 → primary-only，无特判）；commonRoots 已知边界（启用后共享根层 granted 首命中 = registry 首个工作区，是裁定结果不是 bug）。

## 逐任务组实现要点（⑤，与 tasks.md 组 1–5 一一对应）

- **组 1（H1+H2）**：按骨架重写 + 模块注释 9 条（两轮次序与「授予是访问权不是所有权」的 why、跨层最近、首写保留、登记拼写与 `ServerSource.root` 契约、fail-closed、软依赖退化、commonRoots 边界、与 scan 分工、title 仅显示术语）；重建产物。出口：`typecheck`/`lint`/`build` exit 0 + import 冒烟出 `apply,inject,name` + 旧实现 grep 归零（`table.push({ canonical` lib 0 处、`this.table` src 0 处）+ `!table.has(canonical)` 1 处 + `primary.get(canonical) ?? granted.get(canonical)` 1 行。
- **组 2（TS1）**：5 条用例命名与断言逐字见 `code-design.md` G2（bug 回归 `'/work/a'`、子目录、Q1 近层 `/work/b`、Q2 双授予 `/work/b1`、E5 复述主根）；红基线 = 组 1 未实施时用例 1 必红。出口：`vitest run test/attribution.test.ts` 12 passed + 根仓 `pnpm test` 无跨插件回归。
- **组 3（DOC1）**：只改 L55-56（逐字文案见 code-design G3）；历史冒烟记录不动（P3）。出口：`grep -n "每一层分两轮" README.md` 1 行、`grep -c "最近命中" README.md` 0。
- **组 4（G6，只 web）**：前置 = 组 1 build；`docker exec dsh dsh --profile web --dump-config-schema` exit 0 → 与用户约时重启承载 web 的 dsh 进程（P2）→ 新会话断言：dotfiles `roots=2 visible=[]`（修复前 `roots=5 visible=[dbx,figma,yunxiao]`）、opc `roots=5 visible=[dbx,figma,yunxiao]`、回归抽查（cloud-the-sky `roots=2`、`.cache`/`/tmp` `roots=5`、`/etc` `roots=none`）、三面抽查、`/mcp-reload` 计数正常。注意：dsh-plugins 系与修复前同形不可区分（A6），不写入断言。
- **组 5（P1）**：本批本地 commit——逐路径 add `src/host/attribution.ts`、`test/attribution.test.ts`、`README.md`、`lib/`（**不碰**工作区非本变更残留 `pnpm-lock.yaml`、`plugins/demo-echo/`），commit 不 push 不打 tag。

## Risks / Trade-offs

- [表更新撕裂] → D-4 一次赋值 + 走读快照（rescan 自身有串行队列，撕裂窗仅在 update await 与并发 attribute 之间）
- [granted 复述 primary] → primary 轮先查使其无害；用例 5 锚定；禁止「顺手去重」
- [行为变化面外溢到其他机器] → 「granted 目录同时是别家 primary」的部署会归属迁移；发版说明点名（后移动作）；本机实测变化面恰为两处 bug（dotfiles 系、dsh-plugins 系），其余 0 变化
- [web 重启中断会话] → P2 约时执行；存量会话跟随路径不变（工具面下次 `tools/change`、资源面下次 `agent/created`）
- [deny 计数随部署漂移] → dotfiles 会话只断言 `roots=2 visible=[]`，不断言 deny=N
- [dsh-plugins 系变化无实机观测手段] → 只靠单测证明（A6）；实机验收不含该系

## Migration Plan

- 部署：组 1–3 完成后 web profile 即就绪（link 安装，重启生效）；acp/headless 升级步骤已文档化（`docker exec dsh dsh plugin --profile <p> add "github:exponentxqq/dsh-plugins#v<新tag>&path:plugins/project-mcp"`，现 1.1.1 拷贝、peer `>=0.2.1-rc.5 <0.3.0` 不阻塞），**执行时点由后续发版批次决定**（Q3/Q4）
- 回滚：还原 `attribution.ts` 并重建即可（无数据迁移、无配置清理、无新配置键）
- dotfiles 侧：按 DOC2 待改句清单另行落地（本仓交付物 = 本节 + `code-design.md` G5）

## Open Questions

（无——阶段 1.5 收敛 Q1–Q4 与阶段 1.7 上浮 P1–P4 均已由用户裁定；P4 兄弟插件对齐另开变更评估）
