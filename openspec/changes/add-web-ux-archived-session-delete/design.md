# Design

## Context

web-ux 目前是 client-only 插件:宿主半是 no-op 载体(仅让 web 客户端模块扫描读到 `dsh.client` 声明),浏览器半注册 `conversation.composer.dock` 徽章。删除会话需要文件系统与工作区注册表操作,浏览器做不到,必须双端化。上游 dsh 0.2.0-rc.2 的关键事实(均已查证):

- out-of-tree 插件**不能**挂 Typert Remote namespace(契约生成属于官方组合,见 multi-root ADR-0005);公开通道是 Connection RPC:client `connection.rpc.call(channel, endpoint, payload)`,host `connection.rpc.handle(channel, handler)`。
- `dsh-client-ui-workspace` 为第三方预留 `sidebar.workspaces.session.menu.item` slot(props 仅 `{ sessionId, displayTitle }`),官方 pin/rename/fork/archive 就是普通 entry(order 100–400);确认框可用 `shell.overlay` slot + primitives `Modal`。
- client 公开服务 `workspaces` 的快照含 `archivedSessionIds`,可判定行是否归档。
- host 公开原语:`ctx.workspaceRegistry`(幂等的 `unarchiveSession`/`unpinSession`、entity.`detachSession`、`list()`、`archivedSessionIds`)、`ctx.sessionPersistence.list()`(会话头清单,含 `id`/`origin`/`parentSession`/`cwd`;**`SessionHeader` 不含 `title`**)、`ctx.get('sessions')`(宿主内存存活判定)、`ctx.dshHomePath()`(定位 `~/.dsh/sessions` 与 `storages/session_projcache`)。注:`listStoredHeaders()` 与 `sessionKnown()` 在上游是 **private**,不可调用。
- `api-session/removed` 是官方声明可转发(`mode: "emit"`)的 Remote 事件,client 会话列表模型靠它删行。
- 会话磁盘布局:`~/.dsh/sessions/<cwd 转义>/<会话id>/`(会话 id 唯一,可扫描定位);投影缓存 `~/.dsh/storages/session_projcache/sessions/<id>.json`。
- 官方附件存储按内容寻址去重、无反向索引、无 GC(README 明言"永久保留"),引用只存在于各会话日志事件中。

## Goals / Non-Goals

**Goals:**

- 已归档会话的不可逆删除:磁盘文件 + 工作区引用 + 运行中 GUI 三处一致消失。
- 两步防误删(先归档才见入口 + 预览确认框),操作路径保持刻意低效率(无 hover 按钮、无快捷键)。
- 对上游版本漂移完全软降级:任何接触点失效表现为功能消失,而非 GUI 故障。

**Non-Goals:**

- 批量删除(V1 单删;channel 响应保留数组形态,未来扩展不破坏协议)。
- 附件/图片清理(官方无安全 GC 路径;见决策 D7)。
- 「停止并删除」组合操作(live/running 会话一律拒绝)。
- normal(未归档)会话的直接删除入口。
- 多 DSH 版本精确兼容门(multi-root 式 allowlist + compat:check 不引入)。

## Decisions

### D1 通道:Connection RPC `/web-ux`,不造 Typert Remote

端点两个:`preview-delete`(请求 `{ sessionId }`,响应 `{ ok, sessionCount, descendantCount, logBytes }` 或错误)与 `delete-session`(请求 `{ sessionId }`,响应 `{ ok, removed: string[], warnings: string[] }` 或错误)。会话标题不进预览响应:宿主侧已归档会话没有 `Session` 实例可查 `ctx.sessionTitle`,`SessionHeader` 也没有 title 字段;对话框直接用行 props 的 `displayTitle`(用户点击的那一行所显示的名字)。错误统一 `{ code, message }`,`code ∈ { not-found, not-archived, session-live, bad-request }`。client 侧在边界手写校验 wire 形状(multi-root panel-client 模式)。
**替代**:Typert Remote——被上游契约排除,不可行;HTTP 直连 host——无此通道。

### D2 双端归属 web-ux,宿主半零运行时外部依赖

channel 两半共享契约常量,天然同包;仓库先例(project-mcp 拆分)拆的是与 Web 无关的宿主能力,删除入口恰是 Web 界面体验。宿主半源码对 dsh/cordis 一律 **type-only import**,运行时只靠 `inject` 字符串拿服务(`workspaceRegistry`、`dshHomePath`)与 `ctx.inject(['connection','webServer'])` 挂 channel(multi-root command.ts 模式,服务必须 `connectionCtx.root.get('connection')`);esbuild 产物 self-contained,现有 `buildHostCarrier` 不需改 external 列表。

### D3 入口可见性:client 判定 + host 防御

菜单 entry(order 500,`IconTrashOutlineRegular`)订阅 `workspaces` 快照,`archivedSessionIds.has(sessionId)` 才渲染,否则 `null`——归档/取消归档即时跟随,不发请求。host 两个端点都独立校验 `not-archived`(slot 面没有归档状态,client 判定只是展示层;另一窗口可能已改变状态)。

### D4 预览与执行分离,执行不信任预览

预览端点做与执行完全相同的前置校验(存在/已归档/全部删除集合成员非 live),再算体积(扫描会话日志目录树 stat 求和 + projcache 文件),返回集合计数。确认框展示"标题 + N 个会话 + M 个子代理 + X MB"。执行端点当次重校验,预览结果不携带任何授权语义——两步之间状态漂移由执行端兜住。

### D5 删除顺序:registry 清理 → 文件删除 → 事件广播

1. 收集删除集合:`{目标} ∪ 闭包(subagent 后代)`,`origin === 'subagent'` 且 `parentSession` 指向集合内成员才递归(fork 的 `parentSession` 匹配但 origin 不符,天然排除);后代来源 `ctx.sessionPersistence.list()` 返回的会话头。
2. 校验:存在(`not-found`)、已归档(`not-archived`)、集合逐个非 live(`session-live`,消息指明哪个会话)。
3. registry 清理(全幂等):每个 id 依次 `unarchiveSession`、`unpinSession`、所属 workspace entity `detachSession`——此步持久化 `workspace.json` 并向 client 推送工作区变更。
4. 文件删除:扫描 `sessions/*/<id>` 目录逐个 `rm -rf`,`unlink` projcache json;失败**只记 warnings**,不回滚、不中止。
5. 每个 id `ctx.emit('api-session/removed')`,client 会话列表实时删行。

**为何 registry 在前**:JSON 域写几乎不失败,fs 写可能失败(权限/挂载);先做可靠步骤,把不可靠步骤降级为 warnings,任何半失败状态都可重试收敛(detach 幂等、文件可再删)。反向排序(文件在前)在"rm 成功、registry 写失败"时会留下不可重试的死状态(`sessionKnown` 已 false)。
**为何不用 rename-into-trash 缓冲**:trash 目录若留在 `sessions/` 树内会被持久化 `list()` 当作会话目录扫描出幽灵会话;移出树外则跨分区 rename 可能失败。确认框 + 两步入口已是足够防线。

### D6 UI 一致性:借用 `api-session/removed` + 官方工作区推送

detach 引发的工作区推送让分组行消失;`api-session/removed` 让 client 会话列表模型删行(未分组 stray 行)。事件名是官方 Remote Event Selection 声明的可转发事件,但语义归属官方 controller——**这是对上游内部行为的借用**,失效的降级是"删除成功但需手动刷新",README 的上游依赖清单显式记录。

### D7 附件不清理

对象按 sha256 寻址、跨会话去重共享(含 fork 继承的历史引用);"无引用"判定需要解码全部会话日志,且存在**上传→落盘窗口**(对象先持久、引用后写日志),基于日志的 GC 必然误删 live 会话刚上传的附件。官方立场即"永久保留"。spec 以 SHALL NOT 定界,README 说明手动整清的唯一安全边界。

### D8 兼容:宽松 peer + 全接触点软降级

peer 维持 `>=0.2.0-rc.2`。slot 注册、channel 挂载、服务注入全部 try/catch 或软注册(badge 已有同款模式):挂不上静默不出现。与 multi-root 的精确版本门差异源于风险属性——multi-root 扩大沙箱授权,失效必须 fail-closed;本功能失效代价仅是入口消失。

### D9 locale 与样式

自建 NS `webUx`,zh 为 canonical、en 以 `satisfies` 钉住形状,配 parity 测试(multi-root locales.ts 模式)。对话框复用 primitives `Modal`/`Button`,危险色按钮;无新增样式文件。

## Risks / Trade-offs

- [上游更名 `api-session/removed` 或改其转发语义] → 降级为手动刷新;README 上游依赖清单记录;不影响删除本身与重启后一致性。
- [`session_projcache` 路径是布局约定而非公开 API] → unlink 失败/文件缺失一律忽略;projcache 是纯缓存,残留或缺失都由日志重建,不构成正确性风险。
- [扫描 `sessions/*/<id>` 定位日志目录依赖目录布局] → 会话 id 唯一,扫描成本与项目目录数线性(本机 10 个);找不到目录记 warning 而非失败(registry 已清理,重启自愈过滤)。
- [半失败留下磁盘垃圾] → warnings 携带路径,README 提供手工清理指引;工作区记录始终收敛。
- [归档行判断依赖 client `workspaces` 服务快照] → 服务缺失时软降级为入口不出现;host 端 `not-archived` 防御独立成立。
- [确认框体积统计在预览与执行间可能过期] → 仅展示用途;执行端不消费预览数字。

## Migration Plan

1. 实现合入 main,版本 bump 1.2.0(`pnpm release 1.2.0`,宿主 push tag)。
2. profile 更新安装:`dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.2.0&path:plugins/web-ux"`,重启 web profile 生效。
3. 回滚:同命令改指 `#v1.1.1` 重装并重启;删除是写操作,已删数据不可恢复(与功能语义一致),回滚仅撤入口。

## Open Questions

(无——所有分支已在探索阶段拍板。)

## 实施期修正(apply 阶段核实)

实现时对照上游 `.d.ts` 逐条核实,以下六处与原设计文字不同,功能语义不变:

1. **会话头来源**:`WorkspaceRegistry.listStoredHeaders()` 与 `sessionKnown()` 在上游是 private,改用公开的 `ctx.sessionPersistence.list()` 取 `SessionHeader`(含 `origin`/`parentSession`/`cwd`),存活判定改用 `ctx.get('sessions')`。
2. **预览不含标题**:`SessionHeader` 无 `title`,已归档会话也没有 `Session` 实例可查标题服务,标题改由对话框取行 props 的 `displayTitle`。
3. **浏览器半软读服务**:`connection` 与 `workspaces` 用 `ctx.get(...)` 读取而非写进 cordis `inject` 硬名单——缺任一服务只让删除入口消失,不牵连既有的 provider 徽章。`dsh.client.inject` 只声明模块图顺序依赖(ui-workspace / ui-renderer / client-connection / client-locale)。
4. **跨 entry 通信**:slot 的 `inject.hooks` 只能由 slot 声明方提供,第三方无法新增,故菜单项与对话框通过插件内一个共享的请求 store(可订阅快照)通信。
5. **依赖形态**:`@deepseek-ai/dsh-workspace` 与 `@deepseek-ai/dsh-session-persistence` 只作为**可选 peer + devDependency**(类型来源),不做运行时依赖;不引入 zod(契约校验手写,避免给浏览器 bundle 增重)。
6. **warnings 文案**:宿主侧逐条为 `<路径>: <原因>` 的机器可读串,界面只把标题与状态本地化,warnings 原样列出(与 multi-root 的 `unavailable` 同策略)。
