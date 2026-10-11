# Tasks

## 1. 脚手架与构建骨架

- [x] 1.1 创建 `plugins/web-ux/` 三件套：`package.json`（name `dsh-plugin-web-ux`、`dsh.bundle.patch`、`dsh.client` 声明 `platform: web` 与 inject 列表、peer 依赖 `@deepseek-ai/dsh` 与 react、`engines.dsh`）、`cordis.patch.yml`（insert 一行 bare 包名行，参照 git-graph-multi 注释风格）、`src/host/index.ts` 与 `src/client/index.ts` 空实现骨架。验证：仓库根 `pnpm install` 成功且 `pnpm --filter dsh-plugin-web-ux build` 产出 `lib/`。
- [x] 1.2 移植 git-graph-multi 的构建配置：esbuild 脚本（host 面自包含 ESM bundle；client 面输出 `window.__ModuleLoader__.load` 工厂包裹）+ 双 tsconfig + vitest 配置，`yaml` 列为运行时依赖打进 host bundle。验证：构建后 `node -e "import('.../lib/index.js')"` 成功，`lib/client.js` 头部含 `__ModuleLoader__` 包裹，`pnpm --filter dsh-plugin-web-ux typecheck` 通过。

## 2. Provider 徽章（client 面）

- [x] 2.1 徽章组件：订阅 `ctx.modelDirectories.directoryFor(props.sessionId).store`，`current.provider` 在 `groups` 中匹配显示名、取不到回退 provider 标识符原文；`current` 为 null 不渲染；原生 title tooltip 显示 `providerId · modelId`；`max-width` + `text-overflow: ellipsis`。验证：vitest + @testing-library/react 行为测试覆盖「有选择 / provider 缺席回退 / 无选择不渲染 / tooltip 内容 / 长名截断」五场景。
- [x] 2.2 注册 dock slot 条目（`conversation.composer.dock`，`id: 'web-ux-provider'`，order 取大于官方 stats 的值），胶囊样式对齐官方 StatsPills 的字号/配色/圆角变量。验证：本地 link 安装到 web profile，浏览器目检——徽章与 StatsPills 同行并排、切换模型实时更新、窄视口无横向滚动、长 provider 名截断。
- [x] 2.3 `dsh.client.inject` 列表核对（model-selection、slots/conversation 相关客户端包）确保依赖服务先于本 client 加载。验证：`docker exec dsh dsh --profile web --dump-config` 可加载，web GUI 启动时 client 模块加载无控制台报错、空白会话期无异常。

## 3. 扫描与配置解析（host 面）

- [x] 3.1 根集合枚举：按 `workspaceRegistry.list()` 登记顺序遍历，每主根并入软依赖 `ctx.get('multiRootRegistry')?.granted(主根)` 的附加根；服务缺席静默降级。验证：单测覆盖「附加根并入扫描 / registry 缺席只扫主根不报错 / 遍历顺序即登记顺序」。
- [x] 3.2 配置文件解析：`.dsh/mcp/` 下 `.yaml` / `.yml` / `.json` 读取（yaml 包 / JSON.parse），`serverName` 默认取文件名去后缀、文件内可覆盖、`[A-Za-z0-9_-]{1,32}` 校验非法即跳过，子目录与其他后缀忽略。验证：单测覆盖默认名、覆盖名、非法名跳过、子目录忽略四场景。
- [x] 3.3 环境变量展开：字符串叶子递归展开 `${VAR}` / `${VAR:-default}`，作用域 `process.env`，缺失且无默认 → 空串 + warn 日志。验证：单测覆盖已设置展开、默认值、缺失空串 + warn（断言日志调用）。
- [x] 3.4 serverName 冲突仲裁：扫描器维护 `serverName → 来源` 映射，按「登记顺序工作区、主根 > 附加根（授予顺序）」先到者得，后来者 error 日志（含双方工作区/根/文件）并跳过，绝无改名。验证：单测覆盖主根压附加根、跨工作区登记顺序、错误日志含双方来源。

## 4. 加载与生命周期（host 面）

- [x] 4.1 动态加载：`ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 一次缓存 + `unwrapExports`，每服务器 `ctx.plugin(mod, expandedConfig)` 包 try/catch，单台失败（含与 profile 级撞名被拒）记 error 不影响其他。验证：单测（mock loader/ctx.plugin）覆盖成功注册、单台抛错后其余正常。
- [x] 4.2 卸载与重载：dispose 子 fiber 即卸载服务器，serverName 映射同步回收；同名先卸后载可行。验证：单测覆盖加载 → 卸载 → 工具注销（disposer 调用）→ 同名再加载成功。

## 5. 工作区隔离（host 面）

- [x] 5.1 归属判定：会话创建 cwd 逐级向上 `realpath` 比对全部登记根集合，最近命中所属工作区即归属；无命中 fail-closed。验证：单测覆盖工作区根精确命中、子目录归属、无归属、symlink 规范化。
- [x] 5.2 restrict 挂接：`agent/created`（serial，框架 await 监听器返回值，故监听器**返回**挂载 Promise，首步装配前限制已生效）中对 `agent.ctx` 调 `tools.restrict({deny})`，deny 从**实际注册名**按 `mcp__<受管 serverName>__` 前缀推导（归属集合之外），候选集为「全局层读数 ∪ 该 agent scope 视角读数 ∪ 当前已屏蔽且 server 仍受管的名字」三源并集（模型可见的内置工具在 agent 平面、单一读数覆盖不全；且不带第三项则视角读数会缩水导致振荡），disposer 入 agent 键控表，try/catch 包裹并在失败时用实时读数重试一次，归属/读数/重算各自兜底。验证：单测（mock tools）覆盖 deny 只含已注册受管名、只有 agent 视角可见的名字也必须进 deny、视角不再报告仍保持屏蔽、内置与 profile 级工具不进名单、restrict 抛错被捕获且 stale 名被剔除。
- [x] 5.3 动态刷新：`tools/change` 对全部存活 agent 重算，diff 守卫（deny 集不变不重注册）防自激；每 agent 挂 dispatch guard 拒绝对受管前缀中越权名的调用。验证：单测覆盖新工具注册后限制补挂、幂等重算、guard 拒绝越权调用并放行合法调用。
- [x] 5.4 隔离集成冒烟：web profile 下两个不同工作区各放一台同名与异名 MCP 配置，两会话互验——A 会话看不到 B 的工具、调用被拒、内置与 profile 级工具不受影响。验证：先在独立 `DSH_HOME` 的同构 web profile 实例（独立端口）上完成三方 cwd（dsh-plugins / cloud-the-sky / 无归属 `/tmp`）deny=1 / deny=5 / fail-closed deny=6，模型自述可见清单与之一致；探针清理后又在**真实宿主**（重启加载新构建，仅留交付配置 `opc/.dsh/mcp/figma.yaml`）复验：`…/dsh-plugins` 与 `…/opc` 会话 `visible=[figma] deny=0`，`…/cloud-the-sky` 会话 `deny=2 → masked 2`（模型自述 `mcp__figma__` 前缀 0 个、profile 级 69 个不受影响），`/tmp` 无归属 fail-closed。结果记录在插件 README「隔离冒烟记录」。

## 6. 热重载与命令（host 面）

- [x] 6.1 目录监听：对每个已发现的 `.dsh/mcp` 目录 `fs.watch`（debounce），声明式 diff 重扫（新增加载 / 消失卸载 / 变更卸载重载 / 改名 = 删旧增新）。验证：单测用临时目录驱动增删改，断言动作序列。
- [x] 6.2 登记变化信号：`multiRootRegistry.onChange` 与 `domain/changed` 作为触发器（不依赖载荷形状），以 `workspaceRegistry.list()` 全量 diff 为准触发全量重扫。验证：单测覆盖触发器 → 重扫调用、工作区增删后根集合变化。
- [x] 6.3 `/mcp-reload` 人类命令：`ctx.commands.register` 注册，执行全量重扫并反馈加载/跳过/失败计数。验证：经 GUI 输入框同一条 `commands/execute` RPC 实测（`agentId` = 会话、`line` = `/mcp-reload`），反馈原文 `已重扫：加载 0、重载 0、卸载 0、保持不变 5、跳过 2、失败 0`（「跳过 2」= 坏配置 1 + 真同名冲突 1，去重修复后的计数与真实问题一一对应）；宿主 profile 重启后可在输入框直接复跑。

## 7. 文档与发布

- [x] 7.1 插件 README（zh）：功能说明、`.dsh/mcp/` 配置文件格式与示例（含 env 展开）、serverName 冲突规则、工作区隔离语义、multi-root 软依赖降级限制、watch 不可用时用 `/mcp-reload` 兜底；仓库根 README 插件列表补一行。验证：示例配置可被解析单测实际消费（或人工校对通过）。
- [x] 7.2 全量自检：`pnpm --filter dsh-plugin-web-ux lint` / `typecheck` / `test` 全绿，仓库根 `pnpm build` / `pnpm test` 通过，版本号与仓库 tag 规则对齐，`pnpm release --dry-run` 输出正确。验证：上述命令全部退出码 0。
