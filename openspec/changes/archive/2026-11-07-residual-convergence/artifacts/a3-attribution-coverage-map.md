# A3 attribution 去重：23 条「插件侧用例 → host-kit 并集表行」对照清单

- 变更：`residual-convergence`（T4 / A3 attribution 去重）
- 任务：`tasks.md` 2.1（组 2）；映射来源 `code-design.md` ⑤组 2 对照清单（23 行，本文件逐条核验）
- 执行时间：2026-11-07（Asia/Shanghai）
- 执行角色：组 2 执行子代理（仅任务 2.1）
- **边界**：本清单是组 3 删除动作的**删除凭证**。本任务不删除任何用例、不触 `attribution-anomaly.test.ts`、不改 `tasks.md`；「删」一律由组 3 执行。
- 核验对象（四个文件全文通读，逐条比对 setup 与断言，不只看用例名）：
  - `plugins/project-mcp/test/attribution.test.ts`：12 用例 / 179 行
  - `plugins/user-commands/test/attribution.test.ts`：9 用例 / 111 行
  - `plugins/user-commands/test/attribution-concurrency.test.ts`：2 用例 / 82 行
  - `tooling/host-kit/test/attribution.test.ts`：13 条 `CASES` 条目 + 8 条表外 `it()`（含并发段 2 条）= **21 个运行期用例** / 371 行
- 结构性前提：两插件的 `src/host/attribution.ts` 当前均为 host-kit 的**薄再导出**（`Attributor` = `RootAttributor`），插件侧用例与 host-kit 用例跑的是**同一份内核实现**；因此映射的实质差异只剩「断言面」（哪些字段、哪些分支被钉死）。
- 核验口径：
  1. 插件侧用例名与行号取自实测 `grep -n "  it('"` 输出；
  2. 逐条比对四元组：`workspaces` 登记 / `cwd` / `realpath` 表 / `expected` 全字段；
  3. host-kit 断言为插件侧**超集**（同一规则、更强断言）→ 闭合；子集或不同规则 → 不闭合，须先补行；
  4. 一条插件用例含多条子断言时，允许由多条 host-kit 用例承接（处置列注明）。
- **结论：23 / 23 闭合；host-kit 零改动，无需补行。**

## 1. 对照清单（23 行）

> 行号口径：插件侧 = `it(` 行（括号内为关键断言行）；host-kit = `name:` 行（括号内为 `CASES` 条目区间）。
> `code-design.md` 里记的行号是「case 块/断言行」级近似（如 #1 记 `:65`、#9 记 `:146`），与本清单实测的 `name:` 行最多差 7 行，属行号口径差异，非映射差异（逐条见 §3）。

| # | 被删用例（插件侧原名） | 插件侧实测位置（断言行） | host-kit 对应（实测） | 处置 |
|---|---|---|---|---|
| 1 | pm `attributes a session created exactly at a workspace root` | `plugins/project-mcp/test/attribution.test.ts:33`（`:37`） | `CASES` #1「cwd 正是登记根时命中该工作区」`:63–69`（name `:64`） | 删 |
| 2 | pm `attributes a session created in a subdirectory to the owning workspace` | `plugins/project-mcp/test/attribution.test.ts:40`（`:50`） | `CASES` #2「cwd 是工作区子目录时向上归属到最近的登记根」`:70–80`（`:71`） | 删 |
| 3 | pm `attributes a session inside an additional root to that root's workspace` | `plugins/project-mcp/test/attribution.test.ts:53`（`:61–64`） | `CASES` #3「cwd 在附加根下时归属授予它的工作区，并返回完整根集合」`:81–87`（`:82`） | 删 |
| 4 | pm `fails closed when no registered root claims the directory` | `plugins/project-mcp/test/attribution.test.ts:67`（`:71`） | `CASES` #4「没有任何登记根认领时未命中（fail-closed 的原始事实）」`:88–94`（`:89`） | 删（策略级事实由 pm anomaly `:134` 从包别名再断言） |
| 5 | pm `canonicalizes through a symlink before matching a root` | `plugins/project-mcp/test/attribution.test.ts:74`（`:85`） | `CASES` #5「经过符号链接的路径按 canonical 结果归属」`:95–106`（`:96`） | 删 |
| 6 | pm `picks the nearest root when roots are nested` | `plugins/project-mcp/test/attribution.test.ts:88`（`:98`，仅断言 `.workspaceRoot`） | `CASES` #6「根嵌套时最近层优先（近层主根胜过远层主根）」`:107–117`（`:108`） | 删（host-kit 断言为超集：全对象含 `roots`） |
| 7 | pm `attributes nothing before the root sets are known` | `plugins/project-mcp/test/attribution.test.ts:101`（`:104`） | 表外「根集合未知之前不归属任何目录（空索引）」`:187–191` | 删 |
| 8 | pm `prefers a primary root over an earlier workspace that grants the same directory` | `plugins/project-mcp/test/attribution.test.ts:109`（`:118`） | `CASES` #7「主根压倒更早登记的授予（谁的「家」谁做主）」`:118–124`（`:119`） | 删 |
| 9 | pm `keeps the primary-root preference in a subdirectory of the contested root` | `plugins/project-mcp/test/attribution.test.ts:121`（`:131`） | `CASES` #8「主根优先在被争目录的子目录里同样成立」`:125–131`（`:126`） | 删 |
| 10 | pm `attributes a nearer granted root over a farther primary root` | `plugins/project-mcp/test/attribution.test.ts:134`（`:145–148`） | `CASES` #9「近层附加根命中优先于远层主根命中」`:132–143`（`:133`） | 删 |
| 11 | pm `arbitrates a doubly granted root by registry order` | `plugins/project-mcp/test/attribution.test.ts:151`（`:160–163`） | `CASES` #10「同一目录被双授予时按登记顺序归第一个（附加根之间先到先得）」`:144–153`（`:145`） | 删 |
| 12 | pm `keeps a granted restatement of the primary root harmless` | `plugins/project-mcp/test/attribution.test.ts:166`（`:174–177`） | `CASES` #11「附加根重复陈述主根无害（主根层先被问到）」`:154–160`（`:155`） | 删 |
| 13 | uc `cwd 正是登记根时命中该工作区` | `plugins/user-commands/test/attribution.test.ts:29`（`:33`） | `CASES` #1 `:63–69`（`:64`） | 删 |
| 14 | uc `cwd 是工作区子目录时向上归属到最近的登记根` | `plugins/user-commands/test/attribution.test.ts:36`（`:40`） | `CASES` #2 `:70–80`（`:71`） | 删 |
| 15 | uc `经过符号链接的路径按 canonical 结果归属` | `plugins/user-commands/test/attribution.test.ts:43`（`:47`） | `CASES` #5 `:95–106`（`:96`） | 删（canonical 后匹配；#5 覆盖「链接 → 子目录」的一般形态） |
| 16 | uc `命中附加根时返回该工作区完整的根集合` | `plugins/user-commands/test/attribution.test.ts:50`（`:54`） | `CASES` #3 `:81–87`（附加根子目录形态）+ #10 `:144–153`（附加根本身形态） | 删（两条表行的并集 ⊇ 本条） |
| 17 | uc `cwd 不在任何登记根下时返回 null（fail-closed）` | `plugins/user-commands/test/attribution.test.ts:57`（`:61`） | `CASES` #4 `:88–94`（`:89`） | 删（策略级事实由 uc anomaly `:84` 从包别名再断言） |
| 18 | uc `空 cwd、空登记表与不可 canonical 化的根都不授予任何东西` | `plugins/user-commands/test/attribution.test.ts:64`（`:67` / `:73` / `:75` 三个子断言） | `CASES` #12「空 cwd 不授予任何东西」`:161–167` + #13「无法 canonical 化的根不进表」`:168–174` + 表外 `:187–191`（空登记表/未 update） | 删（一条对应两行 + 表外空索引行） |
| 19 | uc `同一物理根被多个工作区当附加根认领时归登记靠前的那个` | `plugins/user-commands/test/attribution.test.ts:78`（`:85–88`） | `CASES` #10 `:144–153`（`:145`） | 删 |
| 20 | uc `该根同时是另一个工作区的主根时归它自己的工作区，与登记顺序无关` | `plugins/user-commands/test/attribution.test.ts:91`（`:99` 根本身 / `:100` 子目录） | `CASES` #7 `:118–124`（根本身）+ #8 `:125–131`（子目录） | 删（两条表行承接两个子断言） |
| 21 | uc `update 会清掉上一轮的根，登记移除后不再归属` | `plugins/user-commands/test/attribution.test.ts:103`（`:106` / `:109`） | 表外「update 是整表替换：登记移除后上一轮的根不再归属」`:193–200` | 删 |
| 22 | uc-concurrency `update 尚未兑现时 attribute 仍返回旧索引的完整结果（不 await pending）` | `plugins/user-commands/test/attribution-concurrency.test.ts:43`（`:51–54` / `:59` / `:60–63`） | `并发原子性` #1「update 未提交时 attribute 返回旧索引的完整结果」`:289–334`（`:289`） | 删（host-kit 为超集：另断言窗口内新根为 null） |
| 23 | uc-concurrency `重扫窗口内旧的附加根归属仍然完整（不退回 fail-closed）` | `plugins/user-commands/test/attribution-concurrency.test.ts:66`（`:73–76` / `:80`） | `并发原子性` #1 `:289–334`（窗口内附加根完整，`:320–323`）＋ #2「attribute 在途时提交新索引，不改变本次上溯结果（调用开始即快照）」`:336–370`（在途快照） | 删（设计表记 #2 `:336`；实质断言由 #1 承接，见 §3 第 1 条） |

## 2. 核验结论（逐条）

### 2.1 project-mcp（12 / 12）

- **#1（pm `:33` → 断言 `:37`）→ `CASES` #1 `:63–69`**：登记 `workspace('/work/a')`、cwd `/work/a`、realpath 表同形（pm 多出的 `/work`、`/` 项在首个命中层即返回，不参与判定），expected 全等 `{ workspaceRoot: '/work/a', roots: ['/work/a'] }` → **等同**。
- **#2（pm `:40` → `:50`）→ `CASES` #2 `:70–80`**：realpath 的 `/work/a/src/deep`、`/work/a/src`、`/work/a` 三级逐项同形，cwd 与 expected 全等 → **等同**。
- **#3（pm `:53` → `:61–64`）→ `CASES` #3 `:81–87`**：两表都不含 `/work/a` 条目（主根 canonical 失败而不进表），只由附加根 `/extra` 入表；cwd `/extra/pkg`，expected 同为携带登记拼写完整根集的 `{ workspaceRoot: '/work/a', roots: ['/work/a', '/extra'] }` → **等同**。
- **#4（pm `:67` → `:71`）→ `CASES` #4 `:88–94`**：无根认领 `/elsewhere` → `null`；`fail-closed` 是内核原始事实（`walkUp` 无 hit），策略级事实另由 pm anomaly `:134`（`keeps the fail-closed miss policy through the package alias`）经包别名再断言一次 → **等同**。
- **#5（pm `:74` → `:85`）→ `CASES` #5 `:95–106`**：realpath 表逐项同形（链接 `/work/link` → `/work/real`、`/work/link/sub` → `/work/real/sub`），cwd 与 expected 全等 → **等同**。
- **#6（pm `:88` → `:98`）→ `CASES` #6 `:107–117`**：登记 `[workspace('/work/a'), workspace('/work/a/inner')]`、cwd `/work/a/inner/sub` 同形；pm 只断言 `.workspaceRoot === '/work/a/inner'`，host-kit 断言全对象 `{ workspaceRoot: '/work/a/inner', roots: ['/work/a/inner'] }` → **超集，闭合**。
- **#7（pm `:101` → `:104`）→ 表外 `:187–191`**：未 `update` 的空索引下 `attribute('/work/a')` → `null`，两边同一断言与同一 fake realpath 表 → **等同**。
- **#8（pm `:109` → `:118`）→ `CASES` #7 `:118–124`**：登记 `[workspace('/work/b', ['/work/a']), workspace('/work/a')]`（B 更早把 A 的主根授予出去），cwd `/work/a`，expected `{ workspaceRoot: '/work/a', roots: ['/work/a'] }` 全等 → **等同**。
- **#9（pm `:121` → `:131`）→ `CASES` #8 `:125–131`**：与 #8 同一 setup，cwd 换成被争目录的子目录 `/work/a/src`，expected 全等 → **等同**。
- **#10（pm `:134` → `:145–148`）→ `CASES` #9 `:132–143`**：登记 `[workspace('/work/a'), workspace('/work/b', ['/work/a/extras'])]`，cwd `/work/a/extras/pkg`，expected `{ workspaceRoot: '/work/b', roots: ['/work/b', '/work/a/extras'] }` 全等（近层附加根压过远层主根）→ **等同**。
- **#11（pm `:151` → `:160–163`）→ `CASES` #10 `:144–153`**：`/shared` 被 b1、b2 双授予，first-write-wins 归 b1，expected 全等 → **等同**。
- **#12（pm `:166` → `:174–177`）→ `CASES` #11 `:154–160`**：`roots: ['/work/a', '/work/a']` 复述主根，主根层先命中、答复原样保留重复项，expected 全等 → **等同**。

### 2.2 user-commands（9 / 9）

- **#13（uc `:29` → `:33`）→ `CASES` #1 `:63–69`**：uc 的「存在路径集合」fake 与 host-kit 的「路径 → canonical 表」fake 对非链接路径的应答等价（均为返回自身），cwd 与 expected 全等 → **等同**。
- **#14（uc `:36` → `:40`）→ `CASES` #2 `:70–80`**：uc fake 未登记中间层 `/work/a/src`（ENOENT → 该层跳过），host-kit 表登记了它；两层都不产生命中，最终都命中 `/work/a`，断言同形。host-kit 表更完整，属测试夹具差异而非语义差异 → **等同**。
- **#15（uc `:43` → `:47`）→ `CASES` #5 `:95–106`**：uc 的链接直接指向登记根本身（`/home/u/proj` → `/work/a`），host-kit 的链接指向根下子目录并逐级 canonical 上溯；两者断言同一规则「先 canonical 化、再按 canonical 结果匹配」，且 #5 覆盖更一般的多级形态 → **等同（host-kit 更强）**。
- **#16（uc `:50` → `:54`）→ `CASES` #3 `:81–87` + #10 `:144–153`**：uc 断言 cwd 正是附加根 `/extra`；#3 用附加根子目录 `/extra/pkg` 断言完整根集，#10 用附加根本身 `/shared` 断言完整根集 —— 两种路径深度都有表行承接 → **等同**。
- **#17（uc `:57` → `:61`）→ `CASES` #4 `:88–94`**：`/tmp/elsewhere` 无根认领 → `null`；策略级事实另由 uc anomaly `:84`（`薄导出的 fail-closed 语义不变：无命中仍是 null`）经包别名再断言 → **等同**。
- **#18（uc `:64` → `:67` / `:73` / `:75`）→ `CASES` #12 `:161–167` + #13 `:168–174` + 表外 `:187–191`**：三个子断言逐一对上——未 `update` 的空索引（表外 `:187–191`）、空 cwd（#12）、不可 canonical 化的根 `/gone`（#13，`/gone` 不进表 → `null`）→ **全部分支闭合**。
- **#19（uc `:78` → `:85–88`）→ `CASES` #10 `:144–153`**：与 #11 同构（a/b + `/shared` 对照 b1/b2 + `/shared`），first-write-wins 归登记靠前者，expected 全等 → **等同**。
- **#20（uc `:91` → `:99` / `:100`）→ `CASES` #7 `:118–124` + #8 `:125–131`**：uc 两个子断言（被争根本身 `/shared`、其子目录 `/shared/src`）分别由 #7（根本身）与 #8（子目录）承接；两者 setup 与断言形状同构（改名 `/work/b` ↔ `/work/a`、`/work/a` ↔ `/shared`），expected 全等 → **等同**。
- **#21（uc `:103` → `:106` / `:109`）→ 表外 `:193–200`**：`update([])` 后旧根不再归属（更新前非空、更新后 `null`），两端同一断言 → **等同**。

### 2.3 user-commands 并发（2 / 2）

- **#22（uc-conc `:43` → `:51–54` / `:59` / `:60–63`）→ 并发段 #1 `:289–334`**：重扫被 `/work/b` 的 canonical 化闸住、不 await pending，窗口内旧索引继续作答；host-kit 额外断言窗口内新根为 `null`（不读半表）、放行后旧归属消失新归属生效 —— 是 uc 断言的**超集** → **等同（更强）**。
- **#23（uc-conc `:66` → `:73–76` / `:80`）→ 并发段 #1 `:289–334`（`:320–323`）＋ #2 `:336–370`**：uc 断言「窗口内旧索引的**附加根**归属仍完整（带回完整根集），提交后为 `null`」。host-kit 并发 #1 的旧索引含附加根 `/work/extra-a`，窗口内 `attribute('/work/extra-a')` 返回 `{ workspaceRoot: '/work/a', roots: ['/work/a', '/work/extra-a'] }`，放行后为 `null` —— 正是该子句；并发 #2 另覆盖更强的「`attribute()` 在途时提交新索引、本次判定仍用调用开始快照」变体（其旧索引不含附加根）。设计表把本条记为并发 #2 `:336`，实测实质承接行是并发 #1，两者并集 ⊇ 本条断言 → **闭合**（详见 §3 第 1 条，无需补行）。

### 2.4 汇总

| 统计项 | 结果 |
|---|---|
| 被删用例总数 | 23（pm 12 + uc 9 + uc-concurrency 2） |
| 映射闭合数 | 23（一条插件用例对应一条或多条 host-kit 表行） |
| 需 host-kit 补行数 | 0 |
| host-kit 改动 | 0 文件（`tooling/host-kit/test/attribution.test.ts` 未修改） |
| host-kit 运行期用例基线 | 21（`CASES` 13 + 表外 8：空索引、整表替换、2 条 walkUp 内核事实、2 条 #3 裁定、2 条并发） |

## 3. 映射差异说明（均为口径/强度差异，不构成缺口）

1. **#23 的对应行号**：设计表记 `并发原子性` #2 `:336`，但 #2 的旧索引只有主根、不含附加根；「重扫窗口内旧附加根归属完整」的实质断言在并发 #1 `:320–323`。#2 覆盖的是另一条更强性质（在途判定按调用开始快照）。本清单两者并列记录，删除凭证以并集为准 —— 没有丢失断言，故不补行。
2. **#6 断言强度**：pm 仅断言 `.workspaceRoot`，host-kit 断言全对象（含 `roots`）——host-kit 是超集。
3. **#15 / #16 的路径层级**：uc 的符号链接指向根本身、附加根用例的 cwd 是附加根本身；host-kit 分别用「链接 → 子目录」（#5）与「附加根子目录」（#3）覆盖一般形态，另有 #10 以附加根本身覆盖「根命中」。规则不变，路径深度不同。
4. **#18 一条拆三条**：uc 的复合用例含三个子断言（空登记表 / 空 cwd / 不可 canonical 化根），分别由表外 `:187–191`、#12、#13 承接；设计表只列了 #12 + #13，空登记表子句与 #7 共用表外行。
5. **#20 一条拆两条**：uc 同时断言被争根本身与其子目录，host-kit #7 + #8 是同构的两行。
6. **行号口径**：`code-design.md` 的行号为 case 块/断言行级近似（最多偏 7 行），本清单用实测 `name:` / `it(` 行；两者指向同一条目，非映射差异。

## 4. host-kit 补行记录

**无。** 23 / 23 闭合，`tooling/host-kit/test/attribution.test.ts` 零改动（未新增 `CASES` 行、未改并发段），因此无「#N 补行于 host-kit :<行号>」标注。

## 5. 验证记录（真实执行）

```bash
$ grep -c "^| [0-9]" openspec/changes/residual-convergence/artifacts/a3-attribution-coverage-map.md
23
```

```bash
$ pnpm --filter @dsh-plugins/host-kit test
 ✓ test/log.test.ts (2 tests)
 ✓ test/roots.test.ts (6 tests)
 ✓ test/watcher.test.ts (12 tests)
 ✓ test/triggers.test.ts (6 tests)
 ✓ test/attribution.test.ts (21 tests)
 Test Files  5 passed (5)
      Tests  47 passed (47)
EXIT=0
```

- 用例计数符合基线：`attribution.test.ts` 21 个运行期用例（`CASES` 13 + 表外 8），补行数 0 → 仍为 21。
- 插件侧文件未修改（组 3 才删）；`attribution-anomaly.test.ts` ×2 未触碰。

## 6. 组 3 消费指引

- 可删：上表 23 行对应的 3 个文件（`plugins/project-mcp/test/attribution.test.ts`、`plugins/user-commands/test/attribution.test.ts`、`plugins/user-commands/test/attribution-concurrency.test.ts`）。
- 须保留：`plugins/project-mcp/test/attribution-anomaly.test.ts`（145 行）、`plugins/user-commands/test/attribution-anomaly.test.ts`（91 行）——包级 wiring（薄导出身份、`{ onAnomaly: log.warn }` 收到 #3 与重复主根、fail-closed 经包别名、不丢根）。
- 删除后的回归证据：`pnpm --filter dsh-plugin-project-mcp test`、`pnpm --filter dsh-plugin-user-commands test`、`pnpm -r test` 全绿，且上表映射由 host-kit 套件独立守护。
