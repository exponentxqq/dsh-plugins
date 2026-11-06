# ADR-0002: 归属内核（`#3` 值语义裁定与索引原子替换纪律）

## Status

Accepted（2026-11-06）。

本文记录**取代**归档决策「归属判定逻辑不跨插件共享」（`openspec/changes/archive/2026-10-11-split-project-mcp-plugin/design.md` 的 D4）的归属侧决策：规则本身仍不进入任何插件的运行期依赖，但实现已单点收敛到 `tooling/host-kit`，由 esbuild 在构建期内联进各包产物。共享包为何不破坏单装，见 [ADR-0001](./ADR-0001-shared-build-and-source-kits.md)。

## Date

2026-11-06

## Context

「会话到工作区的归属」同时服务三个插件，语义却只共享一部分：

- **project-mcp**：会话 cwd 落在哪个工作区的根集合里，就只可见该工作区的项目级 MCP 服务器；未命中 = 看不到任何项目服务器（fail-closed）。
- **user-commands**：同一归属决定会话能看见哪一层项目级命令；未命中 = 只剩用户级与内置命令（fail-closed）。
- **session-tool-toggle**：归属决定新会话读哪一份工作区级默认档；未登记目录**可以**承载工作区档，因此未命中时保留 canonical cwd 作为退化键（`registered: false`），只有 cwd 自身 realpath 失败（目录已删）才退回用户级。

迁移前，pm 与 uc 各持一份约百行的独立实现，stt 则有第三份形态不同的适配；归档 D4 明确记录「归属判定逻辑不跨插件共享」。这带来了两类真实缺陷：

### 缺陷 1：`roots[0]` 的位置假设（#3）

pm 的旧实现把「`roots` 的第一项就是主根」当成契约，附加根层用 `roots.slice(1)` 构造。两包 `roots.ts` 的构造法确实保证 `roots[0] === primaryRoot`，但那是**构造函数的事实**，不是 spec 明文；一旦注册表异常（插件组合、手工数据、未来调用方）违反它：

- `roots[0]` 这个真实存在的根被静默丢弃；
- 落在该根下的会话归属失败，该会话的项目 MCP 能力全部消失；
- 没有任何日志——用户只看到「能力变少了」，排查成本极高。

这是最坏一类失败：**静默丢功能**。

### 缺陷 2：重建窗口内先清空再填充（uc 并发 bug）

uc 的旧 `update()` 一进来就 `owners.clear()` / `rootSets.clear()`，然后逐条 `await` canonical 化与认领。重建不是瞬间完成的：一次 `attribute()` 恰好落在「已清空、尚未填完」的窗口里，会看到空表或半表，于是返回 `null`（fail-closed）。表现是重扫期间新建的会话莫名其妙地看不到项目命令，重扫结束后又恢复。归因困难，且与「声明式重扫」的语义矛盾。

### 规范空白与已有测试

两包 spec 都只覆盖了正常契约下的行为，没有规定「契约被违反」与「重建进行中」这两种状态。迁移前的 oracle 测试（两包各自的 `test/attribution.test.ts`）也都不覆盖它们。本次因此需要同时落 **spec delta** 与**回归用例**；后者必须在旧实现上先红，再由新内核转绿（G6 7.1/7.2）。

## Decision

### 1. 内核单点：`@dsh-plugins/host-kit/attribution`

共享的实现面是：`buildRootIndex()`（按根集合构造两层不可变索引）、`lookupIn()`（主根层优先于附加根层）、`walkUp()`（逐级 canonical 上溯，返回 `{ hit?, canonicalCwd? }` 两个事实）、`RootAttributor`（带已提交索引的类）。

- pm / uc 的 `src/host/attribution.ts` 是薄再导出（`Attributor` 是 `RootAttributor` 的别名），行为策略留在本包；
- stt 保留自己的 ~45 行适配器：`walkUp` 提供走法，键策略（registry 原文 / canonical cwd 退化键 / `registered:false`）留在本包；
- 内核零运行时依赖、零 `@deepseek-ai/*` import，宿主面全部是结构性端口。

### 2. `#3` 裁定：`primaryRoot` 是唯一权威，`roots[0]` 只是期望（MUST）

- **MUST** 以 `primaryRoot` 进主根层；`roots` 中所有**值不等于** `primaryRoot` 的项按原顺序进附加根层——包括 `roots[0]` 与 `primaryRoot` 不同的情况。
- **MUST NOT** 因位置假设丢弃任何根；`roots[0]` 不是主根时，它作为附加根参与认领。
- **MUST** 在 `roots[0] !== primaryRoot` 时经 `RootIndexOptions.onAnomaly` 记录**一条**诊断（含主根与 `roots[0]` 的值），而不是静默吸收或抛错。
- 同一 `primaryRoot` 被多个工作区登记时，主根层 **MUST** 先到先得，并同样记录一条诊断；返回的根集合 **MUST** 取自胜出工作区的 `roots`，不得与其他登记拼接。
- 答复保留**登记拼写**：`workspaceRoot` 与 `roots` 原样返回扫描时记录的字符串，不做 canonical 化；可见性匹配（`serverNamesForRoots`）依赖这份拼写。

在契约成立（`roots[0] === primaryRoot`）时，本规则与旧实现的 `roots.slice(1)` **逐字等价**（`filter(≠primaryRoot)` ≡ `slice(1)`），因此对任何被 spec 覆盖的正常场景零行为变更。异常场景下的行为变化只在 pm 侧（旧 uc 实现本已按值语义遍历，本次把该约定写进两包 spec）：认领 `roots[0]` + 一条告警是本次**有意**新增的语义，已写入两包 spec delta。

### 3. 原子索引纪律（MUST）

- `buildRootIndex()` **MUST** 先在全新的 `primary` / `granted` 表里完整构造，再返回；构造过程中不触碰任何已提交状态。
- `RootAttributor.update()` **MUST** 只用一次引用赋值提交（`this.committed = next`），**MUST NOT** 先 `clear()` 再逐条填。
- `RootAttributor.attribute()` **MUST** 在第一次 `await` 之前捕获当前索引快照，整次上溯只读这一份快照；**MUST NOT** 在逐级上溯中重新读取 `this.committed`（否则同一次判定可能混用两代索引）。
- 进行中的归属判定 **MUST** 看到替换前的**完整**索引：**MUST NOT** 观察到「已清空」或「半填充」的表，也 **MUST NOT** 因重建窗口退回 fail-closed。
- 重建仍保持「声明式」语义：新索引提交后，旧归属如实消失（不会因为旧索引还在被某个 in-flight 调用读取而残留）。

旧 uc 的「先 clear 再逐条填」在新结构下**不可能被写出来**：建表是 `buildRootIndex` 的局部变量，`update()` 没有可清空的共享表。这不是加锁，而是把「建表」和「替换」分开。

### 4. 未命中策略保留在调用方（MUST NOT 收进内核）

内核只报告上溯事实，不决定「什么都没命中」意味着什么：

- `walkUp()` 返回 `WalkResult`（`hit?` 与 `canonicalCwd?`）；「未命中」是一个事实，不是错误。
- pm / uc 保留 fail-closed：`RootAttributor.attribute()` 返回 `Attribution | null` 只是这两包最常用读法的便捷方法。
- stt 保留 canonical-cwd 退化策略：未登记目录可以承载工作区默认档，未命中不告警；目录已删导致 cwd realpath 失败时才 fail-closed。内核 **MUST NOT** 替 stt 决定这一点，也 **MUST NOT** 把 registry 路径再做一遍 realpath（性能与「目录已删」语义都会变）。

### 5. 规范与回归证据

**spec delta**（本次变更内，归档时 sync 进主 specs）：

- [`dsh-project-mcp` spec delta](../../openspec/changes/optimize-architecture/specs/dsh-project-mcp/spec.md)：「工作区可见性隔离」追加「根集合契约（`#3`）」与「索引原子重建」两段，并新增 2 条 Scenario（首项不是主根 / 重扫期间创建会话）。
- [`dsh-user-commands` spec delta](../../openspec/changes/optimize-architecture/specs/dsh-user-commands/spec.md)：「三层优先级与会话遮蔽」追加同样两段与 2 条 Scenario；其中「重扫期间归属判定不回退为 fail-closed」是本次新增行为。
- `dsh-session-tool-toggle`：**无 spec delta**（行为不变；退化键策略本来就在其 spec 内）。

**回归用例**：

- `plugins/project-mcp/test/attribution-anomaly.test.ts`（5 例）：#3 场景断言「诊断一条 + 三个根都能命中 + 根集合完整不变」；重复主根断言先到先得；并发窗口断言旧快照；fail-closed 别名。
- `plugins/user-commands/test/attribution-concurrency.test.ts`（2 例）：`const pending = attributor.update(B)` 不 await，窗口内 `attribute('/work/a')` 必须返回 A 的完整结果（不是 `null`、不是半表）；第二例覆盖旧附加根。两例在旧「clear → 逐条 claim」实现上均红（`expected null to deeply equal {…}`）。
- `plugins/user-commands/test/attribution-anomaly.test.ts`（4 例）：同 #3 与重复主根的包级接线。
- 内核自带套件 `tooling/host-kit/test/attribution.test.ts` 钉住规则本身；两包 `test/attribution.test.ts` oracle **零改动**，是走法等价性的直接证据。

## Alternatives Considered

| 方案 | 否决理由 |
| --- | --- |
| 按位置 `roots.slice(1)`（pm 现状） | 反例就是 #3：真实根被丢弃，会话 fail-closed 且无日志；用户只看到「命令/MCP 变少了」。异常必须可观测，且不应以丢功能为代价 |
| 以 `roots[0]` 作为主根权威 | 把所有权判据从 `primaryRoot` 字段挪到数组位置，与两包 `roots.ts` 的构造法、`serverName` 仲裁的登记顺序语义全部冲突；字段明示的契约不应被位置约定盖过 |
| `roots[0] !== primaryRoot` 时抛错，让整次 `update()` 失败 | 把一次根集合异常放大成全局 fail-closed（所有会话失去全部项目能力），违反本仓「软依赖降级而非失败」的既有纪律（triggers / watcher 同款） |
| 静默忽略异常，继续按旧假设走 | 与 uc 的并发 bug 同一类问题：异常必须可观测；不告警的丢根无法排查 |
| 给 `update()` / `attribute()` 加锁或串行化队列 | 锁能让「clear → 填」不交错，但保留了「共享可变表」这一缺陷根源；一旦有人在新代码里再写一次 clear，bug 就回来了。原子构建 + 一次引用赋值让错误形态在结构上不可表达，且读侧无需等待 |
| 把未命中策略收进内核（`policy: 'fail-closed' \| 'canonical-cwd'` 枚举） | 枚举迫使内核知道 stt 的 registry 形状（`{path,title}`）与「不 realpath registry 路径」的性能约定；共享包会承载某包的私有约束。事实与策略分离才是正确的参数化落点 |
| 让 stt 也走 `buildRootIndex(registry.map(...))` | 会把 registry 路径全部 realpath（每次会话创建都做），并且在某个已登记工作区目录被删时改变行为（索引少一项 → 无法命中 → 变成 fail-closed），违反 stt 现有 spec 语义 |
| 保留 pm / uc 两份独立实现，只修 bug | 同一规则的第三份实现仍在漂移；#3 与并发缺陷都证明「各自演化」不可持续。共享内核 + 各包薄适配器是单点修复与语义分叉的平衡点 |
| 每个 `await` 前重新取一次索引快照 | 同一次上溯可能跨越一次 `update()`，前半段用旧索引、后半段用新索引，产生「混合代」答复；必须在调用开始快照一次并全程使用 |

## Consequences

- **正面**：归属规则只有一份实现；`#3` 与并发窗口的修复同时服务 pm / uc，stt 只共享走法、保留策略；两包 oracle 测试零改动即通过，证明正常场景走法等价。
- **正面**：异常可观测。`roots[0] !== primaryRoot` 与重复主根各有诊断，且不再有「静默丢根 / 静默 fail-closed」。
- **正面**：重扫不再是可观察的失败窗口。新会话在重建期间得到的仍是旧索引的完整答复；重建提交后旧归属如实消失。
- **代价**：内核变更会同时影响三个包。缓解：内核自带套件 + 两包适配器用例 + 产物基线；任何 per-package 策略都不得下沉进内核。
- **代价**：`RootIndexOptions.onAnomaly` 是必需的可观测面——调用方若不接线，异常仍然只存在于代码路径里。两包 `index.ts` 均已接 `log.warn` 并有断言守护。
- **代价**：spec delta 使两包规范多出「异常契约」与「重建窗口」两类状态，后续修改归属规则时必须同步两份 spec 与内核 docblock（rule 10 / 11）。
- **边界**：本次不改变 `roots` 的构造法（`roots[0] === primaryRoot` 仍是正常约定），只是不再把约定当契约；也不改变 stt 的退化键语义与安装矩阵。

## Related Documents

- [ADR-0001：共享构建与源码包的落地边界](./ADR-0001-shared-build-and-source-kits.md)
- [仓级 ADR 索引](./README.md)
- 内核实现与规则全文：[`tooling/host-kit/src/attribution.ts`](../../tooling/host-kit/src/attribution.ts)（模块头 rule 10 / 11）；[host-kit README](../../tooling/host-kit/README.md)
- 设计依据：[optimize-architecture 代码蓝图](../../openspec/changes/optimize-architecture/code-design.md) 的 D-4（策略参数化）与 D-5（`#3` 裁定）；[design.md](../../openspec/changes/optimize-architecture/design.md) 的 D-4 / D-5 行
- spec delta：[dsh-project-mcp](../../openspec/changes/optimize-architecture/specs/dsh-project-mcp/spec.md)、[dsh-user-commands](../../openspec/changes/optimize-architecture/specs/dsh-user-commands/spec.md)
- 回归用例：[pm anomaly](../../plugins/project-mcp/test/attribution-anomaly.test.ts)、[uc concurrency](../../plugins/user-commands/test/attribution-concurrency.test.ts)、[uc anomaly](../../plugins/user-commands/test/attribution-anomaly.test.ts)
- 被取代的归档决策：`openspec/changes/archive/2026-10-11-split-project-mcp-plugin/design.md`（D4）
