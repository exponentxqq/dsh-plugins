# ADR-0012: 附加根进入 `@` 文件提及补全（multi-root-file-references 行）

## Status

Accepted

## Date

2026-10-19

## Context

`@` 文件提及补全是 multi-root 插件最后一个未覆盖多根 scope 的消费者 seam。上游链路（0.2.1-rc.2 实读核实）：Web composer → `ctx.remote.fileReferences.list(sessionId, query)`（远端失败整体映射为空列表）→ session controller 直通 `ctx.fileReferences.list(agent, query, signal)` → `LocalFileReferenceService` 以 `workingDirectory.ensure(agent)`＝会话有效工作目录＝主根为唯一索引根；目录钻入查询还被 `resolveDisplayDirectory` 的 `relative(root, absolute)` 根逃逸检查拦截。结果：用户在 composer 输入 `@` 看不到任何附加根内容——模糊查询触不到、绝对路径钻入被拦、空 query 也不列根。

约束沿用既有决策：不改上游（[ADR-0002](./ADR-0002-upstream-coupling-policy.md)）；新行以 `multiRootCompat` 为前置门禁（不变量 7）；optional peer 不得成为 barrel 或行的加载期依赖（不变量 8）；公共方法包装保留调用上下文、卸载恢复属性描述符（[ADR-0011](./ADR-0011-multi-root-workspace-consumers.md) 模式）。

本 ADR 记录变更 `multi-root-at-mention-and-rename` 引入的 `multi-root-file-references` 行（`src/file-references.ts` 与适配层 `src/compat/file-reference-search.ts`）的行为与边界决策。

## Decision

### 1. 行形态：additive 包装公开方法，不替换 provider

新增行 `multi-root-file-references`（`inject = ['multiRootCompat', 'multiRootScope']`），在 `ctx.inject(['fileReferences'], …)` 内以 `wrapMethod(service, 'list', …)` 包装公开方法 `list`。不 disable、不替换任何上游行：无附加根、裸模糊、相对 query 三种「不干预」分支都在 `await original` 之前同步返回，字节级透传（同一参数、同一返回引用、不改变时序）；`original.call(this, …)` 保留调用上下文。候选沿用上游 `FileReferenceCandidate = { path, kind }` 形状，零 wire 协议变更（web 端零改动）。`fileReferences` 是软依赖：headless 组合不挂该服务，行是 no-op。

附加候选按 `path` 去重后追加在主根结果之后（主根同名候选优先）；候选 `path` 用显示形式——`/` 分隔、目录不带尾斜杠（win32 把 `\` 换 `/`）：上游 `fileCandidate` 按 `/` 切 label/parent，`formatFileMention` 会为目录自动补 `/`，自带尾斜杠会变成 `//`。I/O 之后按当前 scope 复验：根被撤销即丢弃其候选，主根结果保留。行卸载先恢复 `list` 的属性描述符，再释放全部检索实例。

### 2. 主根来源：不可变 session cwd 的 canonical

主根取 `agent.session.header.cwd` 的 `canonicalPath`（缺失或非绝对 → 不干预），与 scope 的键同源——`sandboxPolicy` 以 `session.header.cwd` resolve `workspaceRoot`，面板的 `resolvePanelPrimaryRoot` 同理（不变量 9）。附加根清单唯一来源是 `ctx.multiRootScope.scopeOf(primaryRoot)`，不建第二份根数据源。

不取 `workingDirectory.ensure(agent)`：那是**可变有效工作目录**，会话内 `cd` 之后 `scopeOf` 查空，附加根候选凭空消失——而 workspace 的根集合并没有变。代价：`cd` 后上游主根候选（跟随有效目录）与本行根候选（跟随 session cwd）来源不同；两者均为绝对/相对可区分的候选，不补偿。

### 3. 检索载体：动态 `import()` 复用上游 `WorkspaceFileSearch`

适配层 `src/compat/file-reference-search.ts` 在真正要检索附加根的那一刻 `await import('@deepseek-ai/dsh-file-reference-local')`，只取包根公开导出的 `WorkspaceFileSearch` 与三个默认常量（`DEFAULT_FILE_SEARCH_MAX_RESULTS` / `MAX_ENTRIES` / `EXCLUDED_DIRECTORIES`）——排除表、排名、逐段 `lstat` 拒 symlink 的语义全部继承上游，一处不复制。**绝不静态值导入**：该包是 optional peer，静态导入会让缺 peer 组合（如 headless）里的行整体装载失败；本模块也不进 barrel 的导出面（同 `lsp.ts` / `workspace-files.ts` 先例）。

版本差异用**结构探针**处理而非版本比较（不变量 7）：`WorkspaceFileSearch` 是函数且三个常量类型合法才可用，缺一即降级。检索实例按 canonical 根缓存（并发去重），每次 `list` 调用顺带 `retain(roots)` 剪枝（根撤销/切换即释放），行卸载 `disposeAll()`；不订阅 scope——本行只发目录 query，永不触发上游的惰性索引，订阅只会引入跨主根 churn。

### 4. 空 query：每附加根一条绝对目录候选

空 query 时，在主根结果之后为每个 available 附加根追加一条绝对目录候选（`kind: 'directory'`，`path` 无尾斜杠，按 scope 顺序）。不铺开每根的顶层条目：上游空 query 已用满结果上限的主根顶层候选，再铺 N 个根会把主根候选挤出首屏。

### 5. 绝对 query：最长匹配根钻入 + 前缀匹配

query 归一化（`\` → `/`）后为绝对路径时，两种命中：

- **钻入**：query 落在某根内（等于 `R/` 或以 `R/` 开头）→ 取**最长匹配**的包含根，把 `R/` 作为 `displayDirectory` 传入该根的检索实例；上游 `listDirectory` 按 display 前缀直接产出**绝对候选**，插件侧不做二次前缀化。不把 `R` 本身（无尾斜杠）当钻入——上游会把它切成父目录片段并因逃逸检查返回空。例如附加根为 docker 目录时，输入：

```text
@/home/xu/develop/docker/
```

返回该根下的绝对路径候选。

- **前缀匹配**：某根以 query 为前缀（win32 大小写不敏感）→ 追加该根一条目录候选。路径越长越难记，这正是 `@` 要解决的问题，例如：

```text
@/home/xu
```

会命中所有以此开头的附加根。

两者都落空则不干预。单次查询最多一个钻入目标；钻入结果在前、前缀根候选在后。

### 6. 裸模糊与相对 query：不跨根合并

非空、无 `/` 的裸模糊（如 `@test`）与含 `/` 但不绝对的相对 query（如 `@src/`）都返回 `undefined`：附加根完全不参与，连检索实例的 `acquire` 都不触发，上游主根语义原样。理由：跨根合并要给每个根建索引并统一排名——附加根常见配置是大型缓存目录，首查扫描的延迟结果上限拦不住；且跨根排名无语义，主根结果会被跨根同名文件挤掉。

### 7. optional peer 契约与门禁

新增两个 optional peer：`@deepseek-ai/dsh-file-reference`（类型）与 `@deepseek-ai/dsh-file-reference-local`（检索载体），按 [ADR-0009](./ADR-0009-dsh-compat-contract.md) 三处同步——`peerDependencies` 逐字等于 allowlist 的精确版本或、`peerDependenciesMeta` 标 optional、`devDependencies` pin 基线版本；两包同时追加进 `OPTIONAL_CORE_PACKAGES` 纳入混装检查。行以 `multiRootCompat` 为门禁前置：不支持或混装的安装上，该行根本不启动。

失败模式全部向后退（加载期零依赖的运行时面）：

- peer 缺席（`MODULE_NOT_FOUND`）→ 静默 `undefined`，合法的最小组合不产生噪音；
- 装坏（加载出错 / 结构探针不过 / 构造抛错）→ warn 恰一次后 `undefined`；
- 行拿到 `undefined` 一律降级为只出主根候选，**绝不抛错**。不照抄 `llm-message.ts` 的「装坏就抛」——那里的语义是「有文本必须投递」；本行是可加可减的发现增强，而上游客户端把远端整体失败映射成空列表，抛错会让用户「`@` 一个候选都没有」，主根能力其实完好。

## Alternatives Considered

| 方案 | 否决理由 |
| --- | --- |
| disable `file-reference-local` 再 insert 自有 provider | 要重写主根搜索（排除表/排名/索引生命周期），且与未来其他 additive 包装叠成 provider 竞争 |
| 包装 remote 层（`SessionFileReferences`） | 不在插件可达面，且要复制 wire 协议 |
| 在 web 客户端做候选合并 | web 半部拿不到 scope，且客户端不可信 |
| 主根取 `workingDirectory.ensure(agent)` | 可变有效工作目录：`cd` 后 `scopeOf` 查空，附加根候选凭空消失 |
| 静态值导入上游检索包 | 缺 peer 的组合（headless 等）整体装载失败，而不是安静地不做贡献 |
| 自写 `readdir` 列目录 | 要复制排除表/排名/lstat 拒 symlink 语义，漂移风险大；也是绕过「排除目录段名」限制的唯一路径，一并拒绝 |
| 空 query 铺开每根顶层条目 | 主根候选被挤出首屏，用户反而更难选 |
| 裸模糊跨根合并排名 | 大型附加根首查卡顿 + 跨根排名无语义（主根结果被同名文件挤掉） |
| 行 `Config` 暴露 `maxResults` / `maxEntries` / `excludedDirectories` | 读不到 provider 私有配置，两处配置要人工同步，比接受默认值更易错 |
| 反射读 provider 私有配置 | TS-private，跨包不可达，违反 ADR-0002 |
| 装坏就抛（照抄 `llm-message` / `agent-instructions`） | 远端整体失败映射空列表，会连主根候选一起丢；warn + 降级既保主根又让装坏可见 |
| 订阅 scope 变化即时 dispose 缓存实例 | 本行只发目录 query 永不触发惰性索引；订阅只引入跨主根 churn，换不来「立刻停止」 |

## Consequences

- 正面：附加根以最小噪音进入 `@` 候选（空 query 每根一条、绝对钻入、前缀匹配），主根语义与裸模糊行为零改动；peer 缺席、装坏、根撤销的全部失败模式都向后退，绝不连主根一起丢。
- 正面：检索语义（排除表/排名/symlink 拒绝）全部继承上游同一实现，插件零复制。
- 代价：`cd` 后主根候选（跟随有效目录）与附加根候选（跟随 session cwd）来源不同，候选可区分、不补偿（见 Decision 2）。
- 代价：allowlist 其余版本的 `WorkspaceFileSearch` 形状未逐一实测；结构探针 + 降级保证「形状不同不崩」，但老版本可能拿不到附加根候选（可接受的降级面）。
- 已知限制（接受并文档化，不绕过）：
  1. **面包屑中间层回跳无效**：钻入附加根后，上游 `crumbsFor` 以相对段拼面包屑，点击中间层会得到相对 query（只在主根下解析）而查不到内容；根面包屑、钻入、选择与插入的绝对 mention 均正常。上游修复绝对路径处理后本限制自动消失。
  2. **附加根绝对路径含排除目录段名时钻入为空**：上游 `listDirectory` 拒绝任何段名命中排除表（如 `build` / `node_modules`）的 `displayDirectory`；此时钻入返回空，但根候选本身仍会出现。不绕过（绕过＝自写列目录，已否）。
  3. **部署覆盖 provider 检索参数时附加根用上游默认常量**：provider 的 `maxResults` / `maxEntries` / `excludedDirectories` 是私有配置，本行读不到，附加根检索固定用上游默认值；仅当部署覆盖了这些参数时两者行为有差。上游未来暴露可读服务时再自动对齐。

## Related Documents

- [ADR-0002：上游耦合策略](./ADR-0002-upstream-coupling-policy.md)（不改上游的红线）
- [ADR-0009：DSH 兼容性契约](./ADR-0009-dsh-compat-contract.md)（optional peer 三处同步与门禁的契约框架）
- [ADR-0011：多根 scope 消费方扩展](./ADR-0011-multi-root-workspace-consumers.md)（wrapMethod 公共方法包装与卸载恢复的先例）
- [Agent Note：DSH 兼容性契约](../../.agent/note/dsh-compat-contract.md)
- [架构文档](../architecture/multi-root-workspace.md)
