# 代码级蓝图（阶段 1.7）— project-mcp 会话归属改为 primary root 优先

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由 `line-a.md` / `line-b.md` / `diff-matrix.md` 收敛，**本文不复读**；本文只把已定结论翻译成可施工的代码形状。
> 输入已逐字读全：`line-a.md`（168 行）、`line-b.md`（263 行）、`diff-matrix.md`（84 行，Q1–Q4 与 E1–E8 权威，本蓝图不推翻）。
> 事实基线（2026-11-05 只读核实）：根仓 `dsh-plugins` @ `ae4ef9b`、tag `v1.5.0`；目标子包 `plugins/project-mcp`。工作区另有**非本变更**残留：` M pnpm-lock.yaml`、`?? plugins/demo-echo/`（不触碰、不 add）。
> 测试基线实测：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/attribution.test.ts` → **7/7 全绿**（3.2.7，node v22.18.0 仅 engine 警告）。
> 行号口径：以当前工作区 HEAD 为准（同一文件改动后行号会漂移，落档以「函数名 + 关键片段」定位）。
> `dsh-plugin-writer` 已加载；本包是 **host-only 软插件**（esbuild `build.mjs`、`lib/` 入库、无 `dsh.client`、无原生依赖），其硬约束留痕于 **D-0**，产物/装载性约束落在 **H2 / G1 / G6**（F3/F4/F12）。

---

## ① 触达面清单

**仓归属**：源码、测试、产物、插件文档全部落在 **根仓 `dsh-plugins` 的子包 `plugins/project-mcp/`**；规范 delta 落在**根仓** `openspec/changes/`；dotfiles 仓**只列句、不落地**。
标注法：`根仓·` = `/home/xuqinqin/develop/person/dsh-plugins/<路径>`（子包再冠 `plugins/project-mcp/`）；`dotfiles 仓·` = `/home/xuqinqin/develop/dotfiles/<路径>`。下表每条都带仓前缀，不再靠小节标题推断。

### 1.1 宿主源码（子包 project-mcp）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| H1 | `根仓·plugins/project-mcp/src/host/attribution.ts` | 归属规则重写：混排单表 → **分层双表 + 每层两轮** | 删 `CanonicalRoot`（L41-44）、`private workspaces`（L50-51）、`rootsOf()`（L103-105）；新增 `RootTable`/`RootIndex`/`EMPTY_INDEX` 与 `claim()`；`update()`（L66-76）分两轮建表（primary 轮 → granted 轮，均**首写保留**），末尾**一次赋值**提交 `this.index`；`attribute()`（L83-96）入口取一次 `index` 快照，每层 `primary.get(canonical) ?? granted.get(canonical)`，命中即原样返回表项；`canonical()`（L112-118）原样保留；模块注释（L1-16）改写为设计说明 |
| H2 | `根仓·plugins/project-mcp/lib/index.js` | 重建产物（**入库产物**，`git ls-files` 已跟踪） | `pnpm --filter dsh-plugin-project-mcp build` 重生成。现产物 L7375-7405 仍是混排表旧实现；web profile 是 `link:` 指向本仓、`main` = `lib/index.js` —— **不重建则实机验证看不到任何变化** |

### 1.2 测试（子包 project-mcp）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| TS1 | `根仓·plugins/project-mcp/test/attribution.test.ts`（现 7 用例） | 补 5 条归属用例（bug 回归 + Q1/Q2/E5 锚定） | 沿用 `fakeRealpath`（L17-25）与 `workspace()`（L28-30）；新增 5 条（见 ⑤ G2 逐条命名与断言），现有 7 条**一字不改**；双向授予（E7）不另立用例 |

### 1.3 文档

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| DOC1 | `根仓·plugins/project-mcp/README.md` | 「归属判定」段同步（U1/R2 已裁定必改） | L55 重写为「每层先主根后附加根 + 跨层最近层优先 + 双授予按登记顺序 + 无命中无归属」；L56 补「归属只决定谁赢 / 根集合保持登记拼写」；建议在 L56 后加一条「与 scan 仲裁的分工」。其余段（三面隔离、降级矩阵、冲突仲裁）**不动** |
| DOC2 | `dotfiles 仓·dsh/README.md` | **只列待改句，不落地** | L304-305 现行句 + 建议改写（见 ⑤ G5）；同节 L310-312 的 scan 机制描述仍准确，不改 |

### 1.4 规范落档（根仓 dsh-plugins，**落档阶段产物，不进本执行批次**）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| SPEC1 | `根仓·openspec/changes/project-mcp-primary-root-priority/specs/dsh-project-mcp/spec.md`（新建） | 「工作区可见性隔离」Requirement 的 **MODIFIED delta** | L107 归属判定句改写为两轮语义（正文见 ③3.5）；新增 4 个 Scenario（主根压倒附加根 / 仅附加根 / 近层附加根胜远层主根 / 双授予按登记顺序），其余既有 Scenario 原样保留；同目录另落 `proposal.md` / `design.md` / `tasks.md` / `decisions.md`，`diff-matrix.md` 由收敛留痕复制 |

### 1.5 明确不改（核实后判定，避免误伤）

| 文件 / 面 | 为什么不改 | 证据 |
|---|---|---|
| `src/host/roots.ts` | 有序 root set（primary 恒在首位）是 scan 的 serverName 先到先得**仲裁序**，约束 1 明令零变化 | roots.ts:28-36；scan.ts:1-20 |
| `src/host/scan.ts` | 扫描/解析/仲裁/共享根去重全不动；opc 会话仍应看到其全部根（含 dotfiles 根）下未来的 `.dsh/mcp/` | scan.ts:1-20、scan.ts:158 |
| `src/host/index.ts` | `attribute` 端口形状与调用点（L91/L97）不变；`workspaceRoots()` 一次读数、`update` 先于 `scanServers` 的顺序已保证同一快照 | index.ts:91、:97、:128-137 |
| `src/host/isolation.ts` | 三面（tool / name / resource）单点派生自 `ports.attribute(cwd)`，归属改判自动跟随（C4，读码复核） | isolation.ts:478-483、:382-389、:419-421、:262-272 |
| `src/host/prompt-isolation.ts` | 名字面只读 `visibleFor(agent)`（同源 `tracked.visible`） | prompt-isolation.ts:371、:498 |
| `src/host/mcp-manager.ts` | `serverNamesForRoots` 的 `roots.has(source.root)` 精确比较**要求根集合保持登记拼写**——这正是 H1 不返回 canonical 拼写的理由 | mcp-manager.ts:164-168 |
| `plugins/multi-root-workspace/**` | 非目标：registry / `granted()` / 存储语义不动 | — |
| `package.json`（版本）、`cordis.patch.yml`、`build.mjs` | Q3 先不发版：不动版本、不动声明与构建脚本 | package.json:4 `1.5.0`、:53-57 |
| `openspec/specs/dsh-project-mcp/spec.md`（权威 spec） | OpenSpec 变更在 archive 时由 delta 合并，执行期不直接改权威 spec | 仓 `AGENTS.md`「OpenSpec 工作流」 |
| dotfiles 仓 | 需求明确「dotfiles 侧另行处理」 | — |

---

## ② 证据锚

### 2.1 根因与现状（逐条 file:line）

| 面 | 事实 | 位置 |
|---|---|---|
| 混排建表 | `update()` 对每个 workspace 的**每个 root** 按 registry 顺序 `table.push({ canonical, workspaceRoot })`，primary/granted 身份在建表时被丢弃 | attribution.ts:66-76（:72 `table.push`） |
| 首条命中 | `attribute()` 每层 `this.table.find(r => r.canonical === canonical)`，数组首条胜 | attribution.ts:83-96（:89 `find`） |
| 逐层上溯 | `path.resolve` → `canonical` → 该层不存在则跳过 → `dirname` 到 `/` | attribution.ts:85-95 |
| 失败语义 | `canonical()` 捕获 realpath 异常 → 该根不入表 / 该层不匹配 | attribution.ts:112-118 |
| 根集合回填 | `rootsOf(workspaceRoot)` 按 primaryRoot 拼写回查完整根集合（workspace 消失 → `[]`） | attribution.ts:103-105 |
| 有序根集合（不动） | `roots = [workspace.path, ...granted 去重]`，primary 恒首位 | roots.ts:28-36 |
| 仲裁依赖顺序 | 模块注释声明「registry 顺序 → 主根先于附加根 → 文件名排序」是契约 | scan.ts:1-20（:6-10） |
| 根匹配拼写 | `serverNamesForRoots` 用 `roots.has(server.source.root)` 精确比较；`source.root` 是 scan 的登记拼写 | mcp-manager.ts:164-168；scan.ts:158 |
| 归属唯一端口 | `attribute: async (cwd) => (await attributor.attribute(cwd))?.roots ?? null` | index.ts:97 |
| 同一快照 | `workspaceRoots(ctx)` 一次读数，`attributor.update` 先于 `scanServers` | index.ts:129-132 |
| 三面同源 | `reconcile` 由 `roots` 算 `visible`；guard / 名字面 / 资源面读同一 `tracked.visible` | isolation.ts:480-483、:382-389、:419-421、:262-272；prompt-isolation.ts:498 |
| 会话 cwd 来源 | `agent.session.header.cwd`，`attach` 时捕获一次 | index.ts:164-169 |
| 诊断行形状 | `isolation: cwd=… roots=N visible=[…] … deny=N […]`（**不打印归属主根**） | isolation.ts:625-630 |
| 空表早退 | `cwd === '' \|\| this.table.length === 0` → null | attribution.ts:84 |
| 同规则先例（兄弟插件） | user-commands 已按「主根认领压倒附加根认领、同层按登记顺序」实现（两遍认领、单 owner 表） | user-commands/src/host/attribution.ts:56-94、:16-18 |
| 入库产物仍是旧实现 | `lib/index.js` 中 `table.push({ canonical, workspaceRoot })` / `this.table` | lib/index.js:7375-7405 |
| 产物即运行面 | `main: lib/index.js`；web profile 的 `node_modules/dsh-plugin-project-mcp` 是指向本仓子包的 symlink | package.json:10；`readlink -f` 本轮实测 |
| 权威 spec 条文 | 「以会话创建时的 cwd 逐级向上找最近的已登记根（canonical 路径比较）」 | openspec/specs/dsh-project-mcp/spec.md:107（Requirement 标题 :105） |
| 插件 README 现状 | 「逐级向上…**最近命中**的那个根所属工作区即该会话的归属」 | README.md:55-56 |
| dotfiles 待改句 | 「**只有 opc 工作区**（主根，或以 opc 为附加根）的会话可见 `mcp__dbx__*`」 | dotfiles/dsh/README.md:304-305 |

### 2.2 本轮独立实测（只读脚本，未改任何文件）

**(a) 红基线（回归用例在现行实现上必红）**：用现行 `Attributor` + 身份 realpath 假表，workspaces 顺序 `[B=/work/b（授予 /work/a）, A=/work/a（自身主根）]`，`attribute('/work/a')` → `{"workspaceRoot":"/work/b","roots":["/work/b","/work/a"]}`（期望 `/work/a`）。脚本见附 A 第 1 行。

**(b) 拟实现夹具全通过**：a1 / a2 / 仅 granted / c / d / e / fail-closed / 嵌套 primary 共 8 条，逐条断言值见 ⑤ G2 与附 A。

**(c) 真实 registry 变化面**（容器 `$DSH_HOME=/home/docker/.dsh` 的 `workspace.json` + `multi_root_workspace.json` 快照，按 `workspaceIds` 序展开 13 个工作区 / 23 个根，两套实现同 io 对照）：

| 会话 cwd | 现行归属（roots 数） | 拟实现归属（roots 数） | 变化 |
|---|---|---|---|
| `~/develop/dotfiles`（及 `zsh` 子目录） | **opc**（5） | **dotfiles**（2） | ✅ 本 bug |
| `~/develop/person/dsh-plugins`（及 `plugins/project-mcp`） | **dotfiles**（2） | **dsh-plugins**（2） | ✅ E1（日志同形，见 ⑥ A6） |
| `~/develop/company/opc`、`opc/src` | opc（5） | opc（5） | 不变 |
| `/home/docker` | /home/docker（4） | /home/docker（4） | 不变 |
| `/home/docker/.cache`（及 `/x`） | opc（5） | opc（5） | 不变（Q1 近层赢；反例见 D-1） |
| `/tmp`、`/tmp/foo` | opc（5） | opc（5） | 不变（Q2） |
| `~/develop/apigen` | opc（5） | opc（5） | 不变 |
| `~/develop/company/web/cloud-the-sky` | cloud-the-sky（2） | 同（2） | 不变 |
| `~/develop/company/web/ship-v2` | ship-v2（1） | 同（1） | 不变 |
| `/etc`（未登记目录） | null | null | fail-closed 不变 |

**结论**：变化面 = **dotfiles 系 + dsh-plugins 系**，与 E1 一致；其余 0 变化（与 line-b 原型结论一致，并补上了 E1 对 dsh-plugins 的更正）。

**(d) 兄弟插件规则现况**：`user-commands` 已是 tiered 规则（与本变更目标一致，形状为折叠单表）；`session-tool-toggle` 的归属只认主根、不参与 granted（现状差异见 ⑥ A8 / 待决 P4）。

---

## ③ 接口与数据形状

### 3.1 推导链（before → after）

```
before: update() ──混排──▶ table: CanonicalRoot[] ──find 首条──▶ { workspaceRoot, rootsOf() }
after:  update() ──primary 轮──▶ primary: Map<canonical, Attribution>
                 ──granted 轮──▶ granted: Map<canonical, Attribution>
                 ──一次赋值──▶ index = { primary, granted }
        attribute() ──逐层──▶ index.primary.get(c) ?? index.granted.get(c) ──▶ Attribution（表项原样）
```

### 3.2 对外接口（**零变化**）

```ts
export interface RealpathIo { realpath(path: string): Promise<string> }        // attribution.ts:22-30
export interface Attribution {
  readonly workspaceRoot: string    // 赢家的登记拼写主根
  readonly roots: readonly string[] // 赢家的完整根集合（登记拼写，= scan 同一份）
}                                                                             // attribution.ts:33-38
export class Attributor {
  constructor(io: RealpathIo)
  update(workspaces: readonly WorkspaceRoots[]): Promise<void>
  attribute(cwd: string): Promise<Attribution | null>
}                                                                             // attribution.ts:47-96
```

- `index.ts:97` 的端口 `attribute(cwd): Promise<readonly string[] | null>` 不变；`isolation.ts` 三个面的读取点**零改动**（C4）。
- `WorkspaceRoots` / `MultiRootGrant`（types.ts:67-73 / :52-65）不变。
- 全仓仅 `index.ts` 与 `test/attribution.test.ts` 引用本模块（`grep -rn "from '../src/host/attribution"` 仅测试一处）。
- **无新配置键、无新环境变量、无新端口**（Q2：不做路径特判，因此也没有共享根名单/黑名单）。

### 3.3 模块内新增 / 删除（project-mcp 私有）

```ts
/** 一张根表：canonical 根 → 认领它的工作区的答案。两表同型，差别只在 tier。 */
type RootTable = ReadonlyMap<string, Attribution>

/** 一次 update 提交的整份索引；attribute 入口取一次快照，走完整个上溯。 */
interface RootIndex {
  readonly primary: RootTable
  readonly granted: RootTable
}
const EMPTY_INDEX: RootIndex = { primary: new Map(), granted: new Map() }

class Attributor {
  private index: RootIndex = EMPTY_INDEX

  async update(workspaces: readonly WorkspaceRoots[]): Promise<void> {
    const claims = workspaces.map((workspace) => ({
      workspace,
      claim: { workspaceRoot: workspace.primaryRoot, roots: workspace.roots },
    }))
    const primary = new Map<string, Attribution>()
    const granted = new Map<string, Attribution>()
    // 第一轮：主根。同一 canonical 只认第一个登记者（registry 顺序）。
    for (const { workspace, claim } of claims) await this.claim(primary, workspace.primaryRoot, claim)
    // 第二轮：附加根。roots[0] 按契约就是主根，从 slice(1) 起。
    for (const { workspace, claim } of claims) {
      for (const root of workspace.roots.slice(1)) await this.claim(granted, root, claim)
    }
    this.index = { primary, granted } // 一次赋值 = 原子提交（D-4）
  }

  private async claim(table: Map<string, Attribution>, candidate: string, claim: Attribution): Promise<void> {
    const canonical = await this.canonical(candidate)
    if (canonical !== undefined && !table.has(canonical)) table.set(canonical, claim) // 首写保留（D-3）
  }

  async attribute(cwd: string): Promise<Attribution | null> {
    const index = this.index
    if (cwd === '' || (index.primary.size === 0 && index.granted.size === 0)) return null
    let current = path.resolve(cwd)
    for (;;) {
      const canonical = await this.canonical(current)
      if (canonical !== undefined) {
        const hit = index.primary.get(canonical) ?? index.granted.get(canonical) // 层内两轮（D-1）
        if (hit !== undefined) return hit
      }
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }
}
```

删除：`CanonicalRoot`、`private workspaces`、`rootsOf()`。不变式（必须写进模块注释）：

1. `roots[0] === primaryRoot` 由契约保证（types.ts:71、roots.ts:30-36），granted 轮从 `slice(1)` 起；
2. 同一 canonical 在**同一 tier 内**首写保留（= registry 顺序）；跨 tier 由 `attribute()` 的 `??` 保证 primary 先；
3. `granted` 表即使收进与某 primary 同 canonical 的条目（授予方复述 / symlink 同指）也无害——primary 轮先命中；**不得**为此加"去重"逻辑（会动摇 registry 顺序语义，见 W7/E5）；
4. 表项就是 `Attribution`，只读共享；`roots` 保持 `workspace.roots` 原数组（登记拼写，mcp-manager.ts:164-168 依赖）；
5. 软依赖降级：`multiRootRegistry` 缺席 → 每个 workspace 只有 `roots=[primary]` → granted 表空 → 自然退化为 primary-only，**无特判**（E6）；
6. commonRoots 已知边界：若未来启用，每个工作区都会持有共享根 → granted 轮在该层首命中 = registry 首个工作区；这是既定裁定的自然结果，不是 bug（Q2）。

### 3.4 真实 registry 下的索引内容（示例；本机 canonical 与拼写同值）

| 表 | key（canonical） | 值（`Attribution`） |
|---|---|---|
| primary | `/home/xuqinqin/develop/dotfiles` | `{ workspaceRoot: '…/dotfiles', roots: ['…/dotfiles', '…/person/dsh-plugins'] }` |
| granted | `/home/xuqinqin/develop/dotfiles` | `{ workspaceRoot: '…/company/opc', roots: [opc, dotfiles, apigen, ~/.cache, /tmp] }`（被 primary 轮压制） |
| primary | `/home/xuqinqin/develop/person/dsh-plugins` | `{ workspaceRoot: '…/dsh-plugins', roots: ['…/dsh-plugins', '…/dotfiles'] }` |
| granted | `/home/xuqinqin/develop/person/dsh-plugins` | `{ workspaceRoot: '…/dotfiles', roots: ['…/dotfiles', '…/dsh-plugins'] }`（被压制） |
| granted | `/tmp` | opc 的 claim（该层无 primary → 命中） |

### 3.5 spec delta 建议正文（SPEC1；落档阶段写入，不在本批次执行）

替换 `openspec/specs/dsh-project-mcp/spec.md:107` 的归属判定句：

> 归属判定：以会话创建时的 cwd 逐级向上做 canonical 路径比较；每一层 MUST 先匹配全部已登记工作区的**主根**，该层无主根命中时 MUST 再匹配**附加根**（granted）——同一 canonical 目录上，主根认领 MUST 压倒附加根认领；层与层之间 MUST 维持最近层优先（近层的附加根命中优先于远层的主根命中）；同一 canonical 目录被多个工作区授予为附加根时 MUST 按工作区登记顺序取首个。找不到任何归属时 MUST 对该会话拒绝全部项目 MCP 能力（fail-closed）。

新增 4 条 Scenario（正文见 ⑤ G4），既有 6 条 Scenario 原样保留；Requirement 其余句子（可见范围、应拒集合口径、profile 级不受影响）**不动**。

### 3.6 配置键

**无**。本变更不新增/不修改任何插件配置键（`cordis.patch.yml` 与 `package.json` 的 `dsh` 段零变化）。

---

## ④ 决策记录

> 格式：**决策** → 被否方案与理由 → **反例**（一个能让被否方案当场破功的具体场景）。

### D-0 栈与 writer 约束留痕（事实留档）

- **决策**：按 **host-only 软插件**处理（`plugins/project-mcp`：esbuild `build.mjs`、`lib/index.js` 入库、无 `dsh.client`、无原生依赖、`engines.dsh` 由基线派生）。
- **证据**：package.json:4/:10/:53-57；build.mjs 头注释（self-contained、`yaml` 打包、mcp-client 不打包）；`dsh-plugin-writer` §3 表 host-only 行。
- **约束**：不动声明/构建脚本；`lib/` 是提交物（F4）；`pnpm build` 绿 ≠ 可装载，装载性以 `--dump-config-schema` 为准（F12）；发布不属于本 skill（Q3 后移）。
- **被否**：按双端模板补 `dsh.client` / `lib/client.js`。**反例**：本包无浏览器半，加了只会制造 F1 类问题（patch 挂裸包名但缺产物）且无任何 UI 收益。

### D-1 语义：层内 primary 优先、跨层最近层优先（Q1 已裁定，不重开）

- **决策**：`attribute()` 每层 `primary.get() ?? granted.get()`；逐层上溯不变。
- **被否 A：primary 无条件优先**（先全层扫 primary，再扫 granted）。**反例**：本机 `/home/docker/.cache` 是 opc 显式授予的根，嵌在 `/home/docker`（os 的 primary）之内；无条件优先会把 `~/.cache` 下所有会话改判 os（②2.2(c) 实测该目录归 opc，若按 A 会变），属超范围行为变化，且让"把嵌套目录授予别的工作区"在实施上失效。
- **被否 B：归属只认 primary**。**反例**：既有用例「attributes a session inside an additional root」与 opc→dotfiles 的既有联动预期会被打回；超出本 bug 修复范围。
- **被否 C：建表时把所有 primary 排到所有 granted 之前**（单表全局排序）。**反例**：远层 primary 压过近层 granted，`/home/docker/.cache` 同样被外层 `/home/docker` 吞掉，逐层语义消失。

### D-2 形状：两张表 + 每层 `??`，而非「两遍认领折叠成一张 owner 表」

- **决策**：`primary` / `granted` 两张同型表，tier 在**读路径**显式。
- **被否：折叠单表**（先认领全部 primary，再补 granted 未认领项；`user-commands/src/host/attribution.ts:56-94` 就是这一形状）。二者**可证明等价**：匹配是 canonical 精确相等，tier 只解同一 canonical 的并列，折叠在建表期就解掉；但折叠把 tier 藏进"两遍的顺序"里。**反例**：把两遍认领合并成「逐个 workspace 先认领主根、再认领它的附加根」的一遍循环（最自然的重构），在 registry 顺序 B 先于 A 时，B 的 granted 会先认领 `/work/a` 并因首写保留而赢——**本 bug 一字不差地复活**；而两表版本里 granted 只能进 granted 表，读路径的 `??` 让 primary 仍然先命中。故语义照 Q1、形状取显式两表；user-commands 的等价实现在本批**不改**（待决 P4）。
- **被否：单表 + 条目带 tier 字段、`find` 时两级过滤**。理由：仍是 O(roots) 线性查找，且 tier 要写成两层谓词，可读性更差。

### D-3 表内仲裁：首写保留（E5），不覆盖

- **决策**：两张表都 `if (!table.has(canonical)) table.set(...)`。
- **被否：覆盖式 `set`**（line-b 草图 `primaryTable.set` 的写法）。**反例**：同一 canonical 被 B1、B2 双授予（本机 dotfiles 被 opc 与 /home/docker 双授予），覆盖式归**最后**登记者（`/home/docker`），与现行混排表 `find` 首条（`opc`）及 scan 的 registry 顺序仲裁哲学相反；spec 场景「双授予按登记顺序」也会失败。

### D-4 原子提交 + 走读快照，防撕裂

- **决策**：`update()` 本地建全量两表，末尾 `this.index = { primary, granted }` 一次赋值；`attribute()` 入口 `const index = this.index` 取一次快照走完整个上溯。
- **证据**：`update()` 由 `performRescan` 调用、`rescan()` 有串行队列（index.ts:128-154），因此不存在两个 update 并发；撕裂窗口只在 `update`（await 中）与并发的 `attribute()` 之间。
- **被否：沿用现行「先赋 `this.workspaces`、await 建表后再赋 `this.table`」**。**反例**：realpath 是 await，重扫期间一个 `agent/created` 的 `attribute()` 可能读到"新 workspaces + 旧 table"——`rootsOf()` 会拿旧命中的 workspaceRoot 去新数组里查，返回新根集合甚至空数组；归属答案与可见根集合来自两个世代。本次把 `workspaces` 并进索引，必须一次提交（U6/E5 同源）。
- **被否：每次 `attribute()` 各字段现读 `this.index`**。**反例**：多级上溯中途恰好 `update()` 提交，近层用旧表、远层用新表，答案不属于任何一个世代。

### D-5 返回值：赢家的完整根集合、登记拼写、表项原样返回

- **决策**：claim 的 `roots` = `workspace.roots` 原样（`roots.ts` 拼写）；`attribute()` 直接返回表项；**不改** `Attribution` 字段名/类型、不加 canonical 字段（仅把 `workspaceRoot` 的 JSDoc 改为「赢家：层内主根优先、跨层最近层优先」）。原 `rootsOf()` 的 `[]` 退化分支随之消失——表项与根集合来自同一快照，该分支不可达。
- **被否：返回 canonical 根集合或只返回主根**。**反例**：`isolation.reconcile` 用 `new Set(roots)` 传给 `serverNamesForRoots`，后者 `roots.has(server.source.root)` 精确比较，而 `source.root` 是 scan 用登记拼写写的（scan.ts:158）——改成 canonical 拼写会让**所有** root 匹配失败，visible 恒空，隔离变成全屏蔽（比当前 bug 更糟）。
- **被否：返回浅拷贝防调用方改写**。理由：字段全 `readonly`，唯一消费者只读；每次归属多一次分配，收益为零（见 ⑥ U4）。

### D-6 不动 roots.ts / scan.ts（约束 1）

- **决策**：root set 顺序与 scan 仲裁零改动；归属的 tier 与 scan 的 order 是两套口径，互不改写。
- **被否：在 `workspaceRoots()` 里把 granted 排到 primary 前/后以"顺手修"归属**。**反例**：`serverName` 先到先得是按根序裁定的，改序会改变同名服务器的胜者（README 冒烟里 `probe-shared` 的胜者就是该顺序的锚点），直接违反约束 1 与已发布行为。
- **被否：让 attribution 与 scan 共用一张"归属表"**。**反例**：scan 必须走完 grantor 的全部根（opc 仍要看到 dotfiles 根下未来的配置），attribution 只需要"谁赢"；共用会把"按会话过滤"塞进声明式扫描，破坏 `/mcp-reload` 的全量重扫语义。

### D-7 测试：沿用 fake realpath 表，不加真实目录依赖

- **决策**：5 条新用例都用 `fakeRealpath` + `workspace()`，断言 `workspaceRoot`（必要时连同 `roots`）。
- **被否：用 tmpdir + 真 `fs.realpath`**。**反例**：CI/容器里 `/tmp` 可能是 symlink、目录权限不同，用例会随机器漂移；且现有 7 条已确立该手法（含 symlink 用例），保持同构才能一眼看出是同一规则。
- **被否：只断言"不抛错/非 null"，不断言具体归属**。**反例**：那样 a1 在现行实现上也会"绿"（现行返回 `/work/b` 也满足非 null），起不到回归作用（②2.2(a) 的红基线即证）。

### D-8 文档示例：不再用 `/tmp` 当「无归属」示例

- **决策**：新写的归属文案与验收示例用「未登记目录（如 `/etc`）」或「无 `.dsh/mcp` 的工作区」，不用 `/tmp`。
- **被否：沿用 README 既有「`/tmp`（无归属）」记录**。**反例**：本机 `/tmp` 自 2026-10-12 起是 opc 显式授予的附加根（`multi_root_workspace.json`），②2.2(c) 实测归属 opc（roots=5）；继续拿它当 fail-closed 例子会把排障者引向错误结论。
- **注**：历史冒烟表如何处置见待决 **P3**（U2 只覆盖"独立 DSH_HOME 实例"那张表，README:136/149 是真实宿主记录，另论）。

### D-9 诊断行不改

- **决策**：`isolation.report` 的 `roots=N visible=[…]` 形状不变（不打印归属主根）。
- **被否：加打印 workspaceRoot**。**反例**：验证 dotfiles 修复只需 `roots=5 → roots=2` 与 `visible=[]`；打印主根会改变既有日志契约（README:73 与冒烟脚本依赖该形状），而 dsh-plugins 系的变化本来就同形不可区（⑥ A6），多一个字段也救不了它——那里必须靠单测。

---

## ⑤ 逐任务组实现要点

> 与 tasks 建议分组 **G1..G6 ↔ T1..T6** 一一对应；组间串行。`vitest` 走 esbuild 转译**不做类型检查**，类型面在 G1 出口与 G2 出口各跑一次 `typecheck` 即可。

### G1 — 归属规则重写 + 模块注释设计说明（对应 T1；文件 H1、H2）

- **要点**：
  1. 按 ③3.3 改 `attribution.ts`：删 `CanonicalRoot` / `workspaces` / `rootsOf`，加 `RootTable` / `RootIndex` / `EMPTY_INDEX` / `claim()`，`update` 两轮建表 + 一次提交，`attribute` 快照 + 每层 `??`；
  2. 模块注释（L1-16，**英文**，随文件既有风格）重写为设计说明，必须写全以下 9 条：
     - 两轮次序（primary 轮先、granted 轮后）与"为什么"：目录是某工作区的家时，不能被"别人把根授予过来"收编；授予是访问权，不是对别人家的所有权；
     - 跨层仍是**最近层优先**（近层 granted 胜远层 primary）；
     - 同 tier 内**首写保留**（registry 顺序冻结；双授予按登记顺序取首者）；同层多 primary 属注册异常，同样按首写保留；
     - 赢家返回**完整根集合**且保持**登记拼写**（`ServerSource.root` 契约；canonical 化会让 `serverNamesForRoots` 匹配失败）；
     - fail-closed：全程无命中 → null；
     - 软依赖降级：无 multi-root → granted 表空 → 等价 primary-only，无特判（E6）；
     - commonRoots 启用后的已知退化：共享根会被每个工作区授予，granted 轮首命中 = registry 首个工作区（Q2 的边界，不是 bug）；
     - 与 scan 的分工：`roots.ts` 的**有序 root set**服务于 serverName 先到先得，本模块的 tier 只服务归属；两者不得合并（opc 仍要看到 dotfiles 根下未来的配置）；
     - 术语：工作区 title 只用于显示，归属只按 path 判定（`os` 的 path 是 `/home/docker`）。
  3. 不得改 `Attribution` / `RealpathIo` 的导出**形状**（字段名与类型），但 `Attribution.workspaceRoot` 的 JSDoc 改为「赢家：层内主根优先、跨层最近层优先」；不得动 `canonical()`；
  4. 重建产物（H2）：`pnpm --filter dsh-plugin-project-mcp build`。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-project-mcp typecheck      # exit 0
  pnpm --filter dsh-plugin-project-mcp lint           # exit 0
  pnpm --filter dsh-plugin-project-mcp build          # exit 0，打印 built dsh-plugin-project-mcp: lib/index.js
  cd /home/xuqinqin/develop/person/dsh-plugins && node --input-type=module -e \
    'const m = await import("./plugins/project-mcp/lib/index.js"); console.log(Object.keys(m).sort().join(","))'   # apply,inject,name
  grep -c "table.push({ canonical" plugins/project-mcp/lib/index.js    # 期望 0
  grep -c "this.table" plugins/project-mcp/src/host/attribution.ts     # 期望 0
  grep -c "!table.has(canonical)" plugins/project-mcp/src/host/attribution.ts   # 期望 1
  grep -n "primary.get(canonical) ?? granted.get(canonical)" plugins/project-mcp/src/host/attribution.ts        # 期望 1 行
  ```
- **禁止**：改 `roots.ts` / `scan.ts` / `isolation.ts` / `prompt-isolation.ts` / `index.ts` / `mcp-manager.ts`；动 `package.json` 版本或 `cordis.patch.yml`。
- **执行终形态（组 1 完成，2026-11-05）**：
  - 实测：`typecheck`/`lint`/`build` 全 exit 0；import 冒烟出 `apply,inject,name`（`name=project-mcp`、`inject=["workspaceRegistry","tools"]`、`apply=function`）；grep 四条全过（src `this.table` 0、src `!table.has(canonical)` 1、src `primary.get(canonical) ?? granted.get(canonical)` 恰 1 行 L141、lib `table.push({ canonical` 0）；lib 自检 `!table.has(canonical)` 1（新实现已进产物）；既有 7 用例 `vitest run test/attribution.test.ts` 7/7 passed（未改测试，行为锚定）；lib 产物 313905 bytes（diff +31/-25），干净窗口确认（无 live esbuild/vitest）。
  - 偏差裁定 1：`attribute()` 快照落为 `const { primary, granted } = this.index`（解构），替代骨架字面 `const index = this.index` —— 语义等价（仍单次快照读取、原子性不变），且满足出口 grep 子串要求；骨架字面形态不作硬要求，接受。
  - 偏差裁定 2：模块头注释 16→51 行（L1-16 为定位锚点非硬行数），9 条设计说明全落地。
  - 验收环境口径见 diff-matrix 执行期留痕 R1（engines WARN 既有现象，不影响 exit 0 判定）。

### G2 — 测试补充（对应 T2；文件 TS1）

- **要点**：在 `test/attribution.test.ts` 追加 5 条（命名与断言逐字；fake 表须含从 cwd 到 `/` 的每一级 + 所有 root 的 canonical，否则 update/attribute 会因 ENOENT 静默跳过）：
  1. `it('prefers a primary root over an earlier workspace that grants the same directory')`
     `update([workspace('/work/b', ['/work/a']), workspace('/work/a')])`；`attribute('/work/a')` → `{ workspaceRoot: '/work/a', roots: ['/work/a'] }`（**本 bug 回归；现行实现返回 `/work/b`**，见 ②2.2(a)）。
  2. `it('keeps the primary-root preference in a subdirectory of the contested root')`
     同 fixture；`attribute('/work/a/src')` → 同上（走层路径完整）。
  3. `it('attributes a nearer granted root over a farther primary root')`（Q1）
     `update([workspace('/work/a'), workspace('/work/b', ['/work/a/extras'])])`；`attribute('/work/a/extras/pkg')` → `{ workspaceRoot: '/work/b', roots: ['/work/b', '/work/a/extras'] }`。
  4. `it('arbitrates a doubly granted root by registry order')`（Q2 + E5）
     `update([workspace('/work/b1', ['/shared']), workspace('/work/b2', ['/shared'])])`；`attribute('/shared')` → `{ workspaceRoot: '/work/b1', roots: ['/work/b1', '/shared'] }`。
  5. `it('keeps a granted restatement of the primary root harmless')`（W7/E5）
     `update([workspace('/work/a', ['/work/a'])])`；`attribute('/work/a')` → `{ workspaceRoot: '/work/a', roots: ['/work/a', '/work/a'] }`。
  - 现有 7 条（含 `picks the nearest root when roots are nested`、`fails closed…`、`attributes nothing before the root sets are known`）**一字不改**。
  - 双向授予（dotfiles ↔ dsh-plugins）本质由用例 1 覆盖（E7），不另立用例。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-project-mcp exec vitest run test/attribution.test.ts   # 期望 12 passed
  pnpm test                                                                       # 根仓递归，无跨插件回归
  ```
  红基线：G1 未实施时用例 1 必红（②2.2(a) 的实测输出即为期望的失败形态）；实施后必绿。
- **执行终形态（组 2 完成，2026-11-05）**：
  - 实测：`vitest run test/attribution.test.ts` **12 passed (12)**、Test Files 1 passed、无 SKIPPED；`pnpm test`（根仓递归）exit 0，project-mcp 8 files / 139 tests passed，全插件绿；`typecheck` 仍 exit 0。
  - diff 形态：`test/attribution.test.ts` +73/-0 纯追加（删除行集为空 = 既有 7 条一字未改，diff 实证）；5 条用例命名与断言与 G2 逐字一致，追加在既有 7 条之后同一 describe 内，fake 表含 cwd→`/` 每级与 extras/pkg 中间目录。
  - 环境口径：根 `pnpm test` 中 multi-root-workspace 的 5 个条件性 skip（windows 1 / parity-matrix 3 / compat 1）为既有平台门控，非本改动引入——见 diff-matrix 执行期留痕 R2。

### G3 — 插件 README 归属判定段同步（对应 T3；文件 DOC1）

- **要点**：只改 L55-56，建议在 L56 后加一条「与 scan 仲裁的分工」；不得改「三面隔离」「serverName 冲突仲裁」「降级矩阵」等段（仍准确）。
  L55 建议正文（**逐字**）：
  > **归属判定**：取会话创建目录（cwd），逐级向上做 `realpath` 规范化后与全部已登记根比对；**每一层分两轮**——先看该层是否是某工作区的**主根**（primary，是则该工作区赢），不是再看是否是某工作区被授予的**附加根**（granted，是则授予方赢），都不是才上溯一层。因此**同层主根优先**（一个目录本身就是某工作区的主根时，不会因为同时是别的工作区的附加根而被抢注）、**跨层最近层优先**（近层的附加根仍胜过远层的主根）；同一目录被多个工作区授予时按**工作区登记顺序**取首个；到根目录仍无命中则无归属。

  L56 追加一句：
  > 归属只决定**谁赢**，不改变赢者可见的范围；返回的根集合保持登记时的拼写（与 scan 仲裁同一份拼写）。
- **出口**：
  ```bash
  grep -n "每一层分两轮" plugins/project-mcp/README.md    # 期望 1 行（L55）
  grep -c "最近命中" plugins/project-mcp/README.md         # 期望 0
  ```
- **可选（不阻塞）**：README:115/136/149 的 `/tmp`（无归属）历史记录加注（待决 P3）。
- **执行终形态（组 3 完成，2026-11-05）**：
  - 实测：`grep -n "每一层分两轮"` 恰 1 行（L55）、`grep -c "最近命中"` = 0；diff 单 hunk（+3/-2）：L55 旧「最近命中」句替换为 G3 逐字文案（子串比对一致）、L56 原句句末追加「归属只决定谁赢…」句、新增 L57 列表项「与 scan 仲裁的分工」；README 209→210 行。
  - 裁定：G3「可选加注」**未做**（P3 已裁定不改历史冒烟记录；/tmp 三行原样保留，现 L116/137/150）。
  - 「与 scan 仲裁的分工」一句按任务原文补入（G3 蓝图未给逐字文案，执行子代理拟句已核对：口径与 D-6 一致，无歧义）。

### G4 — openspec specs delta（对应 T4；文件 SPEC1，**落档产物，不进执行批次**）

- **要点**：在落档阶段生成 `openspec/changes/project-mcp-primary-root-priority/specs/dsh-project-mcp/spec.md`：
  - `## MODIFIED Requirements` → `### Requirement: 工作区可见性隔离`，正文按 ③3.5 替换归属判定句（其余句子原样），并**保留全部既有 Scenario**；
  - 新增 4 条 Scenario（逐字正文）：
    - **Scenario: 主根压倒附加根** — WHEN 会话 cwd 正好是工作区 A 的主根，且同一目录被登记更早的工作区 B 授予为附加根 THEN 该会话归属 A，只看得到 A 根集合的服务器
    - **Scenario: 仅附加根命中** — WHEN 会话 cwd 是工作区 B 的附加根，且不是任何工作区的主根 THEN 该会话归属 B
    - **Scenario: 近层附加根优先于远层主根** — WHEN 会话 cwd 位于 B 的附加根 `extras` 之下（`…/extras/pkg`），而 `extras` 的祖先目录是 A 的主根 THEN 该会话归属 B
    - **Scenario: 双授予按登记顺序** — WHEN 同一目录被工作区 B1、B2 授予为附加根，且 B1 登记更早 THEN 该会话归属 B1
  - 同目录另落 `proposal.md` / `design.md` / `tasks.md` / `decisions.md`；`diff-matrix.md` 由收敛留痕复制（其 §4 为权威）。
- **出口**（落档阶段执行）：
  ```bash
  openspec validate --all            # exit 0
  openspec list                      # 含本变更
  grep -n "主根认领 MUST 压倒附加根认领" openspec/changes/project-mcp-primary-root-priority/specs/dsh-project-mcp/spec.md
  ```
- **本批次状态**：**不在执行批次**；执行期不改 `openspec/specs/` 权威 spec（archive 时由 delta 合并）。

### G5 — dotfiles 待改句清单（对应 T5；文件 DOC2，**文档化交付，不落地**）

- **位置**：`/home/xuqinqin/develop/dotfiles/dsh/README.md`，`## MCP 接入（dbx：opc 项目级）` 一节（L300 起）。
- **现行句（L304-305）**：
  > 由 `dsh-plugin-project-mcp` 扫描并按工作区隔离，**只有 opc 工作区**（主根，或以 opc 为附加根）的会话可见 `mcp__dbx__*`。
- **建议改写（dotfiles 侧另行执行）**：
  > 由 `dsh-plugin-project-mcp` 扫描并按工作区隔离，**只有归属 opc 工作区**的会话可见 `mcp__dbx__*`：opc 主根下的目录一律算；以 opc 为附加根的目录，只有它本身不是别的工作区主根时才算（`~/develop/dotfiles` 是独立工作区，不再因为被 opc 授为附加根而看到 dbx）。
- **不改**：同节 L310-312 描述的 scan 机制（仍准确）；L282 的指涉（"现为 opc 项目级"）不受影响。
- **出口**（dotfiles 侧落地后）：`grep -n "只有 opc 工作区" dsh/README.md` 无输出；`grep -n "只有归属 opc 工作区" dsh/README.md` 1 行。

### G6 — web link 验证步骤文档化 + 本批次执行（对应 T6；**只 web，acp/headless 暂缓**）

- **前置**：G1 的 `build`（H2）已完成；web profile 是 `link:` 安装（`readlink -f ~/.dsh/profiles/web/node_modules/dsh-plugin-project-mcp` → 本仓 `plugins/project-mcp`），加载的是 `lib/index.js`。
- **步骤与断言**：
  1. 装载性：`docker exec dsh dsh --profile web --dump-config-schema` → **exit 0**（真实 import 产物，F12）。
  2. 重启承载 web profile 的 dsh 进程（宿主插件在 profile 启动时 import 一次；不是刷新 Web 前端）。
  3. 新会话 cwd `~/develop/dotfiles`：
     `docker logs dsh 2>&1 | grep 'isolation: cwd=/home/xuqinqin/develop/dotfiles'` → 含 **`roots=2 visible=[]`**（修复前 `roots=5 visible=[dbx,figma,yunxiao]`）；旁证（任一即可）：prompt 的 `## MCP resource servers` 段无 dbx / figma / yunxiao，或 `/inventory`（若已装 user-commands）的会话 MCP 清单无三台。
  4. 新会话 cwd `~/develop/company/opc`：日志 **`roots=5 visible=[dbx,figma,yunxiao]`**；调用任一 `mcp__dbx__*` 工具成功；`list_mcp_resources` 含 dbx。
  5. 回归（每项一个新会话）：
     `~/develop/person/dsh-plugins` → `roots=2 visible=[]`（与修复前同形，**不可区分**，见 ⑥ A6）；
     `~/develop/company/web/cloud-the-sky` → `roots=2 visible=[]`；
     `/home/docker/.cache`、`/tmp` → `roots=5`（仍归 opc）；
     `/etc` → `roots=none`（fail-closed，用未登记目录，不用 `/tmp`）。
  6. `/mcp-reload`（GUI 输入框）回执计数正常（无新增失败/跳过）。
  7. dotfiles 会话做三面抽查：工具面无 `mcp__dbx__*`；名字面（prompt 的 `## MCP resource servers`）无三台；资源面 `read_mcp_resource` 带 dbx → 拒绝，文案与上游 `unavailable` 同形。
- **acp/headless（文档化，暂缓）**：`docker exec dsh dsh plugin --profile <p> add "github:exponentxqq/dsh-plugins#v<新tag>&path:plugins/project-mcp"`（现为 1.1.1 真实拷贝），装后同样跑 `--dump-config-schema` + 开新会话抽查；**执行时点由 Q3 之后的发版批次决定**，本批次不执行。
- **出口（本批次）**：步骤 1/3/4 的命令输出逐条贴进变更记录；步骤 5 作为"零外溢"证据。文档化载体：落档副本 `code-design.md` 的本节 + 落档阶段的 `design.md`「发布与升级（后移）」小节。
- **禁止**：本批次 `pnpm release` / `git tag` / `git push`（Q3）；改 acp/headless profile（Q4）。
- **执行终形态（组 4 完成，2026-11-05 14:46 重启 + 14:53-14:54 断言；最小 GUI 口径，用户选定）**：
  - 装载性（R3 修正口径，用户外移另会话终裁）：schema JSON 正常产出（`patchSchema` 在）+ 4 条 error 全部为内置 agent-preset 节点、无 project-mcp 相关节点 → **通过**；exit code 不作判定（R3）。
  - 重启：用户 14:46:20+08:00 自行重启 dsh 进程（P2 兑现）；存量会话按 A9 路径跟随（ship-v2 会话重启后 5 行重算为证）。
  - 核心断言（`docker logs -t` 实测逐字）：
    - `06:53:43Z isolation: cwd=/home/xuqinqin/develop/dotfiles roots=2 visible=[] global=178(mcp=136) scoped=214(mcp=136)` —— 修复前 `roots=5 visible=[dbx,figma,yunxiao]`，**核心 bug 修复实机证实**；
    - `06:54:07Z isolation: cwd=/home/xuqinqin/develop/company/opc roots=5 visible=[dbx,figma,yunxiao]` —— 零回归。
  - 回归零外溢（重启后既有行采信 + 单测锚定）：`ship-v2 roots=1 visible=[]`（5 行）、`brains roots=1 visible=[dbx-brains]`（自家配置正常可见）、`dsh-plugins roots=2 visible=[]`（A6 同形不作修复证明）；`.cache`//tmp 归 opc 由 opc `roots=5` 覆盖（5 根含此二根）；`/etc` fail-closed 由既有单测锚定。
  - 未执行项（最小 GUI 口径裁剪，经用户选定）：G6 步骤 6 `/mcp-reload`、步骤 7 名字面/资源面人工抽查——留待日常使用观察，不影响本批验收（U1 口径：只断言 roots/visible 行）。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（被证伪须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | `roots[0] === primaryRoot` 由构造契约保证 | types.ts:71、roots.ts:30-36 | granted 轮 `slice(1)` 会漏/重一个根 → 需改为 `root === primaryRoot` 过滤（或 canonical 去重） |
| A2 | `registry.list()` 顺序 = 存储 `workspaceIds` 序 | 本轮解析容器 storage（#0-#12）与 diff-matrix U10 一致 | 双授予/同层多认领的 tiebreak 失去规范依据 → D-3 需重议 |
| A3 | `granted()` 可能复述主根（同拼写或 symlink 同指） | roots.ts:31-35 注释；本轮未观测到 | 若复述进入 granted 表且 primary 轮失效（primary realpath 失败），会话会被授予方抢走 → 需在 update 里按 canonical 跳过 |
| A4 | 三面隔离单点派生自 `ports.attribute`，本次零改动即可跟随 | index.ts:97、isolation.ts:478-483、:382-389、prompt-isolation.ts:498 | 若还有第二条归属读取路径 → 需补改（读码已核，仅此一处） |
| A5 | web profile 是 link、加载 `lib/index.js`；重建即生效、无需重装 | `readlink -f` 实测 + package.json:10 + lib 内容 | 若 profile 侧还有缓存副本 → 需重装；G6 步骤 3 会立刻暴露 |
| A6 | **E8 事实校正**：dsh-plugins 系修复前后**无任何可观测差异**（不止"日志同形"） | dotfiles 与 dsh-plugins **互相授予**（`multi_root_workspace.json`：dotfiles→[dsh-plugins]、dsh-plugins→[dotfiles]），两者根集合**作为集合相同**；`isolation` 只消费 `new Set(roots)`（isolation.ts:483），`serverNamesForRoots` 按集合成员判定 → visible/deny 恒同。**在任一方向放探针也会同时进入两个根集合**，diff-matrix E8 建议的探针法无法区分 | 该系的行为变化只能靠 G2 用例 1/2 证明（单测），不能写进实机验收断言；README/spec 不得声称"日志可证" |
| A7 | `/tmp`、`/home/docker/.cache` 归 opc 的现状不变（Q1/Q2） | ②2.2(c) 实测 | 若变化 → 与 Q1/Q2 冲突，须上浮 |
| A8 | `session-tool-toggle` 的归属只认主根（不参与 granted）；`user-commands` 已按 tiered 规则 | session-tool-toggle/src/host/attribution.ts:7-9、:81-82；user-commands/src/host/attribution.ts:56-94 | 三插件语义不完全一致是**现状**，不是本变更引入；是否对齐见待决 P4 |
| A9 | 存量会话跟随路径不变（工具面下次 `tools/change`、资源面下次 `agent/created`） | index.ts:183-189、:248-259 | 验证必须开新会话；若期望即时生效 → 超出本变更 |

### 6.2 未决项（不阻塞本蓝图，实施/后续消解）

- **U1** dotfiles 会话的 `deny=N` **不作为断言**：`blocked = claimed \ failed`，figma 是否加载失败取决于 profile 级同名行，deny 计数会随部署漂移；只断言 `roots=2 visible=[]`。
- **U2** 每轮重扫对 23 个根各一次 realpath（与现行同量），未加缓存；workspace 数大幅增长时再议。
- **U3** E8 校正后，dsh-plugins 系的实机实证唯一路径是**临时撤销一条授予**（用户配置操作，不在本变更范围，也不建议在验证中做）；建议只以单测为准。
- **U4** `Attribution` 表项是共享只读对象；若未来有消费者改写 `roots`（当前唯一消费者是 `new Set(roots)`），需冻结或返回拷贝。

---

## 待决问题（六字段之外）

### P1（P1，影响批次收尾与后续发版）lib 产物的提交时机

- **问题**：G1 会重建 `lib/index.js`（入库产物）；Q3 只裁定"先不发版不推送"，未说本批次是否本地 commit。留脏树会让后续 `pnpm release`（拒绝脏工作区）多一步。
- **选项**：
  - **A（推荐）** 本批次只重建、不提交；源码 + 测试 + README + 产物一起留给发版批次的第一步 commit。理由：与 AGENTS「release 统一重建并提交产物」一致，Q3 后移发版即后移提交。
  - B 本批次末尾本地 commit（不 push、不打 tag）。理由：保持工作区干净；但把"提交"从发版流程里拆出来，review 时不易和 tag 对齐。
  - C 不重建产物。**不可行**：web link 加载的是 `lib/index.js`，不重建则 G6 全部断言看不到变化。
- **推荐**：A。
- **影响面**：批次末 `git status`；后续 release 的前置条件；G6 只依赖"重建"不依赖"提交"。注意工作区已有**非本变更**残留（` M pnpm-lock.yaml`、`?? plugins/demo-echo/`），任何提交须逐路径 add。

### P2（P2，影响验证窗口）web profile 的重启时点

- **问题**：G6 需要重启承载 web profile 的 dsh 进程（宿主插件只在启动时 import），会中断当前 GUI 会话；何时执行需用户安排。
- **选项**：
  - **A（推荐）** 与用户约时重启主实例并开新会话跑 G6（Q4 已定 web link 先行）。
  - B 在独立 `DSH_HOME` / 独立端口复刻冒烟（README:109/127 的复现要点，不打扰主实例）；但需手工复刻 registry 与授予关系，且本会话 additional roots 来源未查明（diff-matrix E3），复刻不保证等价。
  - C 只跑单测、不做实机验证。**不满足** Q4「web link 先行验证」。
- **推荐**：A（B 作为 A 受阻时的补充）。
- **影响面**：验证时间窗与用户中断；G6 断言口径不变。

### P3（P3，影响文档准确性）README 历史冒烟记录里的 `/tmp`（无归属）

- **问题**：README:115（独立 DSH_HOME 实例历史记录，U2 已判不必改）与 README:136/149（**真实宿主**记录，写「`/tmp`（无归属）`roots=none`」）与当前授予关系（`/tmp` 是 opc 的附加根，实测归 opc、roots=5）不一致。
- **选项**：
  - **A（推荐）** 不改历史记录（改它需重跑冒烟并改写证据表）；只保证**新增**文案不用 `/tmp` 当 fail-closed 例子（D-8）。
  - B 顺带修正 README:136/149 两行并加注「该记录早于 2026-10-12 的 `/tmp` 授予」，不重跑冒烟。
  - C 重跑那轮真实宿主冒烟并整体刷新表格（成本最高）。
- **推荐**：A；若用户在意文档一致性，B 是低成本折中。
- **影响面**：仅 DOC1；B 额外改 L136/L149 两行。

### P4（P3，影响后续排期）兄弟插件的归属语义是否对齐

- **问题**：本变更后 project-mcp 与 user-commands 规则一致（层内 primary 优先 vs granted），但 `session-tool-toggle` 的归属只认主根、不参与 granted。三插件同名能力语义不完全一致是否为问题？
- **选项**：
  - **A（推荐）** 本批不动；另开变更评估（其归属只服务"工作区默认档"的键，语义本来就是主根，未必是缺陷）。
  - B 本批一并对齐（扩大改面，违反本变更最小面，且需另写测试/文档）。
  - C 只记录现状、不评估。
- **推荐**：A（现状记录于 ⑥ A8）。
- **影响面**：后续变更排期；本批零影响。

---

## 附 A：验证映射总表（每条对应一个可执行命令或一条可断言事实）

| 验证点 | 载体 | 具体命令或断言 |
|---|---|---|
| 红基线（复现现行 bug） | 命令 | `cd plugins/project-mcp && node --experimental-transform-types --input-type=module -e 'import { Attributor } from "./src/host/attribution.ts"; const t={"/work/a":"/work/a","/work/b":"/work/b","/work":"/work","/":"/"}; const io={realpath:async p=>{if(!(p in t))throw new Error("ENOENT");return t[p]}}; const a=new Attributor(io); await a.update([{primaryRoot:"/work/b",roots:["/work/b","/work/a"]},{primaryRoot:"/work/a",roots:["/work/a"]}]); console.log(JSON.stringify(await a.attribute("/work/a")))'` → 修复前 `{"workspaceRoot":"/work/b","roots":["/work/b","/work/a"]}`，修复后 `{"workspaceRoot":"/work/a","roots":["/work/a"]}` |
| bug 回归：A.primary 且 B.granted（B 先登记）→ A | `test/attribution.test.ts` | G2 用例 1 断言 `.workspaceRoot === '/work/a'` |
| 同一规则在子目录成立 | 同上 | G2 用例 2 断言 `.workspaceRoot === '/work/a'` |
| 仅 granted 命中 → 授予方（不回归现状） | 同上（既有用例） | `workspace('/work/a',['/extra'])` → `attribute('/extra/pkg').roots === ['/work/a','/extra']` |
| Q1：近层 granted 胜远层 primary | 同上 | G2 用例 3 断言 `.workspaceRoot === '/work/b'` |
| Q2/E5：双授予按登记顺序 | 同上 | G2 用例 4 断言 `.workspaceRoot === '/work/b1'` |
| E5/W7：granted 复述 primary 无害 | 同上 | G2 用例 5 断言归 `/work/a` 且 `roots` 原样 |
| 嵌套 primary 最近层优先（不回归） | 同上（既有用例） | `attribute('/work/a/inner/sub').workspaceRoot === '/work/a/inner'` |
| 无命中 fail-closed（不回归） | 同上（既有用例）+ G6 | `attribute('/elsewhere') === null`；实机 `/etc` → `roots=none` |
| 表项首写保留 | 命令 | `grep -c "!table.has(canonical)" src/host/attribution.ts` → 1 |
| 每层两轮 | 命令 | `grep -n "primary.get(canonical) ?? granted.get(canonical)" src/host/attribution.ts` → 1 行 |
| 旧混排实现消失 | 命令 | `grep -c "table.push({ canonical" plugins/project-mcp/lib/index.js` → 0；`grep -c "this.table" src/host/attribution.ts` → 0 |
| 类型 / 风格 | 命令 | `pnpm --filter dsh-plugin-project-mcp typecheck`、`lint` 退出 0 |
| 产物可加载 | 命令 | 附 A 第 1 行的 import 变体：`node --input-type=module -e 'const m = await import("./plugins/project-mcp/lib/index.js"); console.log(Object.keys(m).sort().join(","))'` → `apply,inject,name` |
| 装载性 | 命令 | `docker exec dsh dsh --profile web --dump-config-schema` 退出 0 |
| 实机 dotfiles 会话 | 日志 | `roots=2 visible=[]`（修复前 `roots=5 visible=[dbx,figma,yunxiao]`） |
| 实机 opc 会话 | 日志 + 工具 | `roots=5 visible=[dbx,figma,yunxiao]`；`mcp__dbx__*` 可调；`list_mcp_resources` 含 dbx |
| 零外溢 | 日志 | cloud-the-sky `roots=2 visible=[]`；`.cache`/`/tmp` `roots=5`；`/etc` `roots=none`（均新开会话） |
| 三面跟随 | 实机 | dotfiles 会话：工具面无 `mcp__dbx__*`、名字面无三台、资源面拒绝文案与上游 `unavailable` 同形 |
| 文档一致 | 命令 | `grep -c "最近命中" plugins/project-mcp/README.md` → 0；`grep -c "每一层分两轮"` → 1 |
| 规范一致 | 命令（落档阶段） | `openspec validate --all` 退出 0；delta 含「主根认领 MUST 压倒附加根认领」 |
| 全量回归 | 命令 | `pnpm --filter dsh-plugin-project-mcp verify:all`；根仓 `pnpm test` |

## 附 B：与收敛留痕（diff-matrix）的对应关系

| 收敛项 | 本蓝图落点 | 备注 |
|---|---|---|
| C1 根因（混排表 + 首条命中） | ②2.1、H1 | 行号复核属实 |
| C2 方案（层内两轮、跨层最近） | D-1、③3.3 | 语义照此；实现形状取显式两表（D-2，可证等价） |
| C3 roots.ts / scan.ts 零改动 | ①1.5、D-6 | — |
| C4 三面自动跟随 | ①1.5、A4 | 读码复核，唯一端口 index.ts:97 |
| C5 测试四组 + 既有 7 条绿 | G2、附 A | 新增 5 条（A.primary=B.granted 收两条形态） |
| C6 spec.md:107 需改写 | ③3.5、G4 | 落档产物，不进执行批次 |
| C7 roots 仍是赢家完整根集合 | D-5、A1 | — |
| C8 dotfiles L305 待改句 | G5 | 只列句 |
| C9 模块注释设计说明 | G1 要点 2 | 9 条必写 |
| E1 变化面 = dotfiles 系 + dsh-plugins 系 | ②2.2(c) | 实测确认（dsh-plugins 现状确归 dotfiles） |
| E2 dotfiles 修复后 roots=2 | G6 断言 | dotfiles 根集合 = [dotfiles, dsh-plugins] |
| E5 primaryTable 首写保留 | D-3、G2 用例 5 | 两表同法 |
| E6 软依赖降级 | ③3.3 不变式 5 | granted 表空自然退化，无特判 |
| E7 双向授予不另立用例 | G2 说明 | 由用例 1 本质覆盖 |
| E8 dsh-plugins 系日志同形 | ⑥ A6 | **校正**：探针法也无法区分（两工作区根集合作为集合相同），只能靠单测 |
| U2 README:115 历史记录 | P3 | 可选加注 |
| U6 表更新撕裂 | D-4 | 一次赋值 + 走读快照 |
| Q1–Q4 | D-1、D-3、P1、P2、G6 | 不推翻 |

---

*本文件为阶段 1.7 代码级蓝图；执行期由 spec-apply 维护各组终形态。蓝图与实测不符处（行号漂移、环境授予变化）以实测为准，但 D-1 / D-2 / D-3 / D-5 的规则形状不得回退。*
