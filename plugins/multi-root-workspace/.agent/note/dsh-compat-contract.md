# DSH 兼容性契约：Agent 需要先知道的事

这份笔记记录的是**改动本仓库之前必须知道、否则很容易踩坑**的兼容性机制。决策理由在 [ADR-0009](../../docs/decisions/ADR-0009-dsh-compat-contract.md)，用户侧排查在 [故障排查条目](../../docs/troubleshooting/unsupported-dsh-release.md)。这里只写"作为 Agent 你会撞到什么"。

## 1. 支持范围：运行时副本 + 派生范围

```text
scripts/dsh-baseline.mjs    →  DSH_BASELINE          （仓库基线，权威）
src/compat/dsh-version.ts   →  DSH_BASELINE          （运行时副本，同值字面量）
src/compat/dsh-version.ts   →  SUPPORTED_DSH_RANGE   （由副本派生）
```

支持面不再是逐版本清单，而是「与基线同 `major.minor` 且 ≥ 基线」的软范围，形态是 `>=<基线> <<主>.<次+1>.0`。当前基线 `0.2.2-rc.1`，派生范围 `>=0.2.2-rc.1 <0.3.0`。同一 minor 线上的新预发布（例如 `0.2.3-alpha.1`）自动放行，不需要改仓库任何文件；低于基线、或跨到下一个 minor（`0.3.0`、`0.3.0-alpha.1`）一律拒绝。

`DSH_BASELINE` 为什么是副本而不是直接读根文件：`src/` 要能独立发布与装载，运行时不能依赖仓库根的脚本；副本由 `pnpm dsh:upgrade` 的 `repointRuntimeBaselines()` 与根基线**同批**重写，并由下面的四行相等关系传递性地钉住。范围谓词是该模块自己的手写比较器（不引 semver）：库的默认 prerelease 规则会把 `0.2.3-alpha.1` 判出范围，而纯数值比较又会放行 `0.3.0-alpha.1`，所以「同 minor」是单独做的守卫。

改基线时，下面四行必须同时一致，否则 `pnpm compat:check` 失败：

```text
baseline → range   scripts/dsh-baseline.mjs（权威）→ src/compat/dsh-version.ts（同值副本）→ SUPPORTED_DSH_RANGE（派生）   0.2.2-rc.1 → >=0.2.2-rc.1 <0.3.0
peers              package.json   peerDependencies       22 条 DSH 均为派生范围（cordis 独立）
engines            package.json   dsh.engines.dsh        派生范围
installed          node_modules   实际解析到的版本        单一 release（是否在范围内由运行时门判定）
```

`pnpm compat:check` 断言的就是这些静态事实：22 条 DSH peer 范围 == `dsh.engines.dsh` == 由基线派生的范围；`REQUIRED_CORE_PACKAGES` 都在 peer 里且解析得到；安装树只持有一个 release。它**不**重算范围谓词（运行时门与 `test/compat.spec.ts` 拥有谓词），也**不**核对开发 pin 的精确值（`catalog:dsh` 解析到基线，由根 `pnpm dsh:check` 守）。

`scripts/check-dsh-compat.mjs` 是**文本读取** `src/compat/dsh-version.ts` 里的 `DSH_BASELINE` 字面量，不是 import。所以它必须保持 `export const NAME = '…'` 的单引号字符串常量形状：不要从别处拼出来，也不要用表达式求值；文件里任何更早的同形状赋值（哪怕是注释里的示例）都会让升级脚本改错对象。原因是这个检查必须能在 `pnpm build` 之前、在没有 `lib/` 的干净 checkout 上跑。

## 2. 你写的测试可能因为门禁而失败——这是对的

`multi-root-compat` 是 patch 第一行，以下行 inject 它：

```text
multi-root-fs
multi-root-sandbox
multi-root-registry
multi-root-instructions
multi-root-lsp
multi-root-workspace-files
multi-root-file-references
```

cordis 不会启动 injected service 缺失的行。所以在测试里 mount 上述任何 provider 之前，必须先：

```ts
import { mountCompat } from './support/compat.ts'

await mountCompat(ctx)
```

否则 `ctx.get('fs')` / `ctx.get('sandbox')` 是 `undefined`，你会看到 `Cannot read properties of undefined (reading 'confine')` 这类报错。这不是 bug，是门禁在工作（`test/compat.spec.ts` 里有一条专门断言这个行为）。

`mountCompat` 挂载的是**真实的** compat 行，含门禁策略。所以整个单元套件在一个落在派生范围外、或缺必需包、或混装了不同 release 的安装树上会直接失败——这是刻意的，见下面第 5 条。

## 3. `confine` 在不同版本上是同步/异步的

```text
0.1.5-rc.2     confine(argv, policy): ConfinedArgv
0.1.6-alpha.1  confine(argv, policy, signal?): Promise<ConfinedArgv>
0.1.6-alpha.2  confine 形状与 0.1.6-alpha.1 相同（2026-09-22 实测）。会话目录的形状不同，见下一节。
0.1.7-alpha.1  confine 形状与 0.1.6-alpha.1 相同（2026-09-22 实测；这一版别的形状变了，见第 4 条）
0.1.7-alpha.2  与 0.1.7-alpha.1 相同（2026-09-24 实测）
0.1.7-rc.1     与 0.1.7-alpha.1 相同（2026-09-24 实测）。这一版新增的是安装期 peer 门禁，见第 4 条末尾
0.1.7-rc.2     与 0.1.7-rc.1 相同（2026-09-25 对照 tag 实测）。cordis 仍是 `~4.0.4`
```

**不要**在 `src/sandbox.ts` 里手写签名去迁就某一个版本。统一走 `src/compat/sandbox-confine.ts` 的 `widenConfined()`，它**保形**：上游同步就同步返回，上游返回 promise 就返回 promise。

绝不要"统一包成 promise"。在 `0.1.5-rc.2` 上那会把 `ctx.sandbox.confine()` 对组合里每一个调用方（bash executor、PTY backend）都变成 thenable，等于插件自己引入一次破坏性变更。

测试和 smoke 里读结果时：

- 单元测试用 `test/support/confine.ts` 的 `confined(provider, argv, policy)`；
- smoke 脚本一律 `await ctx.sandbox.confine(...)`。

**这是一个安静的坑**：`await` 一个普通值是 no-op，但直接读 promise 的 `.argv` 会得到 `undefined`，报错形如 `Cannot read properties of undefined (reading 'some')`，看起来完全不像版本问题。

## 4. 上游改过的 API 只能在 `src/compat/` 里分支，且用结构探测

业务代码不出现任何版本判断。目前的适配器：

| 文件 | 吸收的差异 |
| --- | --- |
| `src/compat/sandbox-confine.ts` | `confine` 的同步/异步与 arity |
| `src/compat/agent-instructions.ts` | renderer 改名：`renderWorkspaceContext`（0.1.5）→ `renderAgentInstructions`（0.1.6，0.1.7 未再改） |
| `src/compat/client-session.ts` | 当前会话：`list.current`（0.1.5 / 0.1.6-alpha.1）→ 目录行 `retainedBy.mainView > 0`（0.1.6-alpha.2 与 0.1.7-alpha.1 至 0.1.7-rc.2；0.1.7 挪走了别的目录字段，主视图谓词没变） |
| `src/compat/llm-message.ts` | session format 3 及更早投 `{ kind: 'plugin', plugin, form: 'instructions' }`；format 4（`0.1.7` 的 `SESSION_FORMAT_VERSION`）拒绝 `kind: 'plugin'`，改投 `{ kind: 'multi-root-workspace', plugin, form: 'instructions' }`。探针是 session 包导出的格式常量，**不是** renderer 名字——0.1.6 已经改名却仍接受 `plugin`。不要用 `agent-instructions`：上游把那个 kind 的 `changes` 当自己的协调权威 |
| `src/compat/tool-result.ts` | 失败位：0.1.5/0.1.6 在 `content[0].isError`，0.1.7 在消息自身的 `isError`。`event.data.error` 两边都还在 |
| `src/compat/client-icons.ts` | 面板图标：0.1.5/0.1.6 是像素名（`IconFolderClose16`），0.1.7 是线宽名。上游 UI 用的是 Regular，不是 Medium。先取像素名，没有再取 Regular |
| `src/compat/caller-connection.ts` | cordis `~4.1.0` 的 traceable shadow：属性访问携带定义点切片，`get rpc()` 的注册被绑到 connection 定义点 ctx 而不是调用方连接。`callerConnectionOf` 用 `symbols.original` 解包后以 Proxy 重定向 ctx，无版本号分支，同一份代码兼容 4.0.5 / 4.1.0 |
| `scripts/lib/profile-boot.mjs` | `healProfilesModuleFallback` 是函数就调用它；否则 `createRuntimeResolution`，并在 `boot` 的 prepare 里 `hostCtx.plugin(PluginPackages, { resolution })`。0.1.7 不再导出 heal |
| `scripts/lib/shell-exec.mjs` | `shell.run` 存在就用它；否则 `shell.execute(spec)` 再 `execution.result()`。0.1.7 的 `SandboxBashExecutor` 改了名从 run 到 execute |

一律用**结构探测**（是否 thenable、导出哪个名字、快照有没有 `current`），不要比较版本号。上游是 pre-stable，同一版本内也会改形状；结构探测能应付，版本比较不能。

`0.1.7-alpha.2`、`0.1.7-rc.1` 与 `0.1.7-rc.2` 相对 `0.1.7-alpha.1` 没有改上面这张表里的形状（2026-09-24 对照 `alpha.1` / `alpha.2` / `rc.1`；2026-09-25 对照 `rc.1` → `rc.2`）。`rc.1` 新增的是**安装期**门禁，不在 `src/compat/`：`dsh plugin add` 与 `loadProfile` 用 `semver.satisfies(runtime, peerRange, { includePrerelease: true })` 检查每一个 `@deepseek-ai/dsh*` peer，不满足就拒绝安装或跳过 bundle。因此当时把一个 `0.1.7-rc.1` 及以后的版本放进精确版本矩阵时，`peerDependencies` 必须在同一改动里带上那个精确版本，否则 smoke 的 `dsh plugin add` 会在本插件的运行时门禁之前就失败。当时的「警告档」开关也放宽不了这一关。

**这是一个安静的坑**：`0.1.6-alpha.2` 的 host 矩阵（`confine`、instruction renderer、journey Messages 端点）与 alpha.1 相同，所以当时按"适配层无改动"纳入精确版本矩阵。客户端 Session Controller 却在 `6830e1460d` 把 `SessionListState.current` 删掉了，导航改由主视图 `retain(..., { source: 'mainView' })` 持有。面板仍读 `list.current` 时，已打开的对话会显示「当前没有活动会话」，并且**不向 host 发请求**。

探测顺序：非空的 `current` 优先（旧形状），否则取第一条 `retainedBy.mainView` 为正数的目录行。目录有行但没有一行被主视图持有时返回 `undefined`——**绝不要**回退 `ids[0]`，那会把操作打到操作者没在看的会话。`getSnapshot` 必须按方法调用，抽出来再调会丢掉 store 的 `this`。

`agent-instructions` 是**可选 peer**：最小组合里可能既没有它也没有 agent。`instructionsApi()` 在包不存在时返回 `undefined`（贡献为空），但包存在却两个 renderer 名字都没有时**抛错**——那是需要修适配器的兼容性破坏，不是可选接缝。

`@deepseek-ai/dsh-llm` **同样是可选 peer，且只能按需加载**：barrel（`src/index.ts`）正是 carrier loader 行挂载的模块，它的加载期依赖集合必须等于必需包集合，所以任何静态值导入都会让一个根本不构造消息的最小组合加载失败。消息构造统一走 `src/compat/llm-message.ts` 的 `createInstructionMessage()`，它在真正要构造消息时才 `await import('@deepseek-ai/dsh-llm')`。`test/optional-peers.spec.ts` 钉住了这一点：加载 `src/index.ts` 与 `src/instructions.ts` 时该包不会被 resolve。

`instructionsApi()` 还要把**包不存在**与**包在但求值失败**分开：先用 `isPackageInstalled()` 单独探测安装情况（`createRequire(import.meta.url).resolve`，与 `readInstalledVersion` 同一模式），只有 `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND` 算"不存在"；其余失败（例如传递依赖缺失导致 `import()` 抛错）必须向上抛，绝不缓存成 `undefined`——那会让整个进程静默停止投递附加根指令。

## 5. 没有放宽开关：不支持即拒绝启动

门禁只有一种反应：`unsupported`（版本统一，但落在派生范围外）、`incomplete`（必需包解析不到）与 `mixed`（核心包对不上同一个 release）一律拒绝启动；没有环境变量、没有警告档、没有降级路径。七个注入 `multiRootCompat` 的行就此根本不启动，组合退化成「未安装本插件」——这是刻意的 fail-closed。

升级也不再需要开关：候选版本被写进基线后，派生范围的下界就是它自己，同 minor 线上的版本天然在范围内；跨 minor 的候选版本本就不该冒充支持。升级车道因此降级为**普通回归验证**：照常跑测试与门禁，没有专用 lane、没有专用环境变量，绿灯仍然只是证据。

如果你在本地遇到门禁拒绝，**不要**找开关绕过去。正确做法是确认宿主 / `node_modules` 是否真的落在派生范围内（`pnpm compat:check`，以及错误信息里的 `supported:` / `installed:` 两行）；要移动边界就按第 6 节移动基线。

## 6. 升级流程：移动基线，派生面同批重指

升级探测（现为仓库根 `pnpm dsh:upgrade`；上游按周车道已移除）不提交不推送。它不改支持范围本身：范围是基线的函数，**移动基线就是移动范围**，这是人工动作。`pnpm dsh:upgrade <version>` 先改 `scripts/dsh-baseline.mjs`，再在同一批里重指 `catalogs.dsh`（各插件的 devDeps 经 `catalog:dsh` 引用它）、`dsh.engines.dsh` 与 DSH peer 范围、cordis / schemastery pin、运行时基线副本（`plugins/*/src/compat/dsh-version.ts`，`repointRuntimeBaselines()`）与 release-age 豁免。绿灯是**证据**，不是授权——但新形态下不存在「还要人工加入清单」的第二道门：基线一动，派生范围自动跟上。

`compat:check` 现在是升级回归的一部分：候选版本就是新基线，必然落在新派生范围的下界上。它断言 `package.json` 里 22 条 DSH peer 范围 == `dsh.engines.dsh` == 由基线派生的范围，`REQUIRED_CORE_PACKAGES` 都在 peer 里，安装树只持有一个 release；它**不**重算范围谓词（运行时门与 `test/compat.spec.ts` 拥有它），也**不**校验开发 pin 的精确值（根 `pnpm dsh:check` 拥有它）。

升级/探测用：

```bash
pnpm dsh:upgrade 0.2.2-rc.1 --probe     # 移动基线并同批重指派生面，写 probe overrides
pnpm dsh:upgrade --latest-prerelease --probe   # 指向最新 pre-release
pnpm dsh:upgrade --print-latest-prerelease
pnpm dsh:upgrade --print-installed      # 每个插件实际解析到的版本
pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
pnpm --filter dsh-plugin-multi-root-workspace verify:all   # 含 compat:check（紧跟 lint）
pnpm dsh:upgrade 0.2.2-rc.1             # 移除 overrides
pnpm install --frozen-lockfile
pnpm dsh:check
```

安装候选版本时**必须**加 `--config.minimumReleaseAge=0`。否则 pnpm 会因为 release-age 门禁拒绝 lockfile。探测结束后根级 `pnpm dsh:check` 会核对 `minimumReleaseAgeExclude` 与 lockfile 的实际解析集合是否精确相等；缺项/陈旧项都按它列出的清单修。

`0.2.1-rc.2` 的 `dsh` 依赖 cordis `~4.0.5`，内部子包全部精确 pin 到 `0.2.1-rc.2`；`upgrade-dsh.mjs` 会把 cordis 开发 pin 与那一行豁免改到 `4.0.5`。这次探测还暴露了一个跨版本约束：multi-root 的 `zod` 生产依赖必须与 `@deepseek-ai/dsh-storage-domain` 的精确 `zod@4.4.3` 对齐，否则 `defineDomain` 的类型与运行时都会分叉（`^4.6.2` 会装出第二份 zod）。

两个只在本地咬人的坑（CI 每次都是干净 checkout，碰不到）：

- `git checkout --` 恢复各插件 manifest / workspace / lockfile / 基线常量 / 运行时基线副本时会把未提交修改一起抹掉；先提交或 stash。当前流程默认不要求回退，重跑不带 `--probe` 只清理 overrides。
- 候选版本装上之后，`pnpm <script>` 的**依赖自检**仍会跑一次 `pnpm install` 对照 release-age 策略；只要豁免已按 lockfile 精确补齐（`pnpm dsh:check` 通过），这次自检就会通过。若在补齐前看到 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，先补豁免而不是绕开策略。

## 7. journey smoke 的模型端点同时说两套 wire 协议

`0.1.6-alpha.1` 把默认 LLM 协议从 chat-completions 换成了 Messages：

```text
0.1.5-rc.2     POST {base}/chat/completions    choices[].delta，finish_reason
0.1.6-alpha.1  POST {base}/v1/messages         message_start / content_block_* / message_delta / message_stop
0.1.6-alpha.2  与 0.1.6-alpha.1 相同（journey 55/55，端点未改）
0.1.7-alpha.1  与 0.1.6-alpha.1 相同（journey 55/55，仍是 `/v1/messages`）
0.1.7-alpha.2  与 0.1.7-alpha.1 相同（journey 55/55）
0.1.7-rc.1     与 0.1.7-alpha.1 相同（journey 55/55）
0.1.7-rc.2     与 0.1.7-rc.1 相同（`/v1/messages` 未改；未声明 `toolUpdate` 的路由会剥掉 developer 消息）
```

这个变化不经过插件代码，但会打断 `scripts/smoke-journey.mjs` 的脚本化端点。它现在**按请求路径**选择应答协议，两个构造函数分别是 `chatCompletionFrames()` 与 `messagesFrames()`。

同一处还有一个曾经踩过的坑：**不要用"请求体里是否含 title 提示词"来判断哪个请求是 agent step**。某些版本会把整个 session log 随每个请求一起发送，于是所有请求都被判成 title、agent 一步都不跑、而 smoke 报出的却是二十多条"模型没看到附加根"之类的下游失败。现在的判据是**请求是否提供 tools**。

调试模型看到了什么：

```bash
DSH_SMOKE_KEEP=1 pnpm smoke:journey
# 结束后读 .dsh-smoke/journey-<pid>/model-requests.json
```

## 8. 一条命令跑完整矩阵

```bash
pnpm verify:all   # lint → compat:check → typecheck → build → kernel:probe → test → smoke
```

它**包含** `compat:check`（紧跟 `lint`）：支持范围与运行时门禁读的是同一个基线，静态契约不再是升级要绕开的障碍——候选版本就落在新派生范围的下界上。根 `.github/workflows/ci.yml` 的七步链（install → lint → typecheck → build → test → docs:check → dsh:check）不含它，根 `pnpm dsh:check` 也不复制它；`compat:check` 随本包 `verify:all` 覆盖。

## 9. DSH 0.2 与新的开发基线

开发 pin 是 `0.2.2-rc.1`，cordis 是 `~4.1.0`；基线常量在仓库根 `scripts/dsh-baseline.mjs`。回到开发基线不再表示回到 `0.1.5-rc.2` / `4.0.2`；前文的旧版探测记录是历史事实。恢复探测时按 manifest / workspace / lockfile / 基线常量 / 运行时基线副本五处分步处理，绝不把未提交的支持声明退回 HEAD。

`0.2.0-rc.1` / `rc.2` 保留了现有适配器的接缝。0.2 的 agent-loop 异常恢复会在关闭 step 前补保守的失败 `tool/result`：`message.isError: true`、纯文本 content，并带 `data.error`。它绝不能算成功文件 touch；`test/instructions.spec.ts` 同时钉住旧 content block、新 message 与恢复事件三种失败形状。Windows 新增 ACL diagnosis skill 由继承的上游 provider 自动软注册，本插件仍不承诺 Windows 内核多根授权。

`0.2.1-rc.2` 没有引入新的适配器分支：`dsh-fs` / `dsh-sandbox` / `dsh-sandbox-local` 的类型零变化，session format 仍为 4，`HostConnectionRpc.handle` 与所用槽位 / primitives 导出保留。真正需要处理的是依赖树：内部子包全部精确 pin，`zod` 对齐 `4.4.3`，`dsh-invariants` 在该线不再发布（git-graph 插件因此整体移除）。`pnpm-workspace.yaml` 的豁免清单由 `pnpm dsh:check` 与 lockfile 精确对齐。

`0.2.1-rc.5` 同样没有引入新的适配器分支（2026-11-04 实测，Linux 容器）：rc.2 → rc.5 在插件消费的全部表面上类型树零变化，session format 仍为 4，cordis 仍为 `~4.0.5`，`zod` 仍为 `4.4.3`。纳入前 warn 探测：typecheck 全绿、kernel:probe 通过、单测 405 passed / 5 skipped（32 文件）、compose 46/46、behavior 99/99、journey 60/60；纳入后 enforce `verify:all` 与 `compat:check` 同样全绿。与 `0.1.7-rc.1` 起的规则一致，`peerDependencies` 在同一次改动里带上了 `0.2.1-rc.5`，否则 smoke 的 `dsh plugin add` 过不了安装期 peer 门禁。

`0.2.2-rc.1` 的形状结论（2026-11-06 实测终版）：cordis 升到 `~4.1.0`，traceable shadow 在这一版断裂——属性访问携带定义点切片，`get rpc()` 的注册被绑到 connection 定义点 ctx 而不是调用方连接，挂载须经 `callerConnectionOf` 的结构探测适配（`symbols.original` 解包 + Proxy 重定向 ctx），不含版本号分支，同一份代码兼容 `~4.0.5` 与 `~4.1.0`，实现落 `src/compat/caller-connection.ts`。`dsh-session-projection` 到 rc.1：`ProjectionDefinition<K, S>` 变双泛型，`register` 异步化返回 `Promise<ProjectionHandle<S>>`，registry 级 `stateOf(session, key)` 废弃、改用 `handle.stateOf(session)`，`SessionProjectionStateMap` 更名 `SessionProjectionMap` 并转为 client wire 表（host-only 键不再合并）。schemastery 为 `3.19.0` 单树；`zod` 保持 `4.4.3`，session format 仍为 4；上游首次声明 `engines.node >=24.9.0`，本仓 Node 工具链仍为 24.21.0。验证纪律：`tsc -b` 的增量缓存对依赖类型面变化不敏感，核对类型结论前先清 `tsconfig.*.tsbuildinfo`。

根级 `scripts/check-dsh-baseline.mjs`（`pnpm dsh:check`）在发布前守住基线常量、`catalogs.dsh` 基线册、根与全部插件的 `catalog:dsh` devDeps、统一派生范围（`dsh.engines.dsh` 与 DSH peers）、安装树版本、发布年龄豁免与 lockfile 的精确相等；`scripts/release.mjs` 已把它设为发布前置。multi-root 自己的 `compat:check` 挂在它的 `verify:all` 上，不复制进 `dsh:check`。候选重指脚本生成的 overrides 块仍只属于探测，重跑不带 `--probe` 即清理。

Windows 的 Node 不能直接 `execFileSync('npm')` 启动 `npm.cmd`，旧版矩阵会在重指前报 `spawnSync npm ENOENT`。升级脚本统一走 `scripts/lib/npm-cli.mjs`：Windows 用当前 Node 执行其安装目录的 `node_modules/npm/bin/npm-cli.js`，POSIX 继续直接执行 npm；不拼 shell 命令，带空格的路径与参数边界由回归测试覆盖。

## 10. B1–B3 的新接缝

LSP / workspace-files 只包装公开方法，卸载必须恢复原属性描述符；不要比较 Cordis 代理函数的引用。旧版 `changes(scope, signal)` 与新版 `changes(scope, path, signal)` 由 `src/compat/workspace-files.ts` 按 arity 适配。Windows 非空 scope 的 runner 必须用整个根集合的 SID，不能把主根 SID 授予附加根，否则移除后仍可写。可选 peer 均纳入混装检查，carrier barrel 不得静态加载这些可选包。完整决策见 [ADR-0011](../../docs/decisions/ADR-0011-multi-root-workspace-consumers.md)。
