# 代码级蓝图（阶段 1.7）— zcode-plan-bridge

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险、任务价值判断）已由双线与 `diff-matrix.md` 收敛，**本文不复读**；本文只把已定结论翻译成可施工的代码形状。
>
> 输入已逐字读全：`line-a.md`（249 行）、`line-b.md`（359 行）、`diff-matrix.md`（89 行，§二 F1–F6 / §五 E1–E7 / §六 Q1–Q5 = 已定决策，本文不推翻）。
>
> 事实基线（本轮只读核实，2026-11-03）：运行中 DSH = `0.2.1-rc.2`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json`）；插件仓当前 = `1.4.0`，`plugins/` 下 **5** 个目录（`multi-root-workspace` / `project-mcp` / `session-tool-toggle` / `user-commands` / `web-ux`）；`plugins/zcode-plan/` **尚不存在**（全新建）；`~/.dsh/profiles/web/cordis.patch.yml` 为只读核实对象，不入本仓 diff。
>
> **本轮新增的两条硬事实（下文 D-1 / D-2 的立论基础，均已亲手复核）**：
> 1. **patch 层不深合、整份替换**：`dsh-app-boot/README.zh.md:61`、`:204` 明文，且本文用隔离 `$DSH_HOME` 实测复现（§②「本轮实测」块）——**bundle 层给 `llm-pi-ai` 加的路由会被用户 profile 层同 id 的 `config` 整份吃掉**。
> 2. **不能挂第二行 `@deepseek-ai/dsh-llm-pi-ai`**：该行会为**全部 catalog 提供方**声明目录条目（`dsh-llm-pi-ai/lib/index.js:2841-2857`），第二行必撞 `DUPLICATE_DIRECTORY`（`dsh-llm/lib/index.js:1935`）。

---

## 0. 栈识别与 writer 豁免留痕

**结论（主会话已判定，本文照录并在 ④ D-0 立为决策）**：目标栈 = **pnpm workspace + TypeScript + esbuild + cordis/dsh 插件**；**无 Spring / 无 Nuxt 标记**，聚合层无匹配 writer skill；**用户已豁免本次 writer 加载（仅本次有效）**——本次设计**未加载任何 writer skill**。

| 证据 | 位置 | 说明 |
|---|---|---|
| 无 Maven/Gradle/Nuxt | 本轮 `find` 与仓内文件清单：根与 `plugins/*` 下无 `pom.xml` / `build.gradle*` / `nuxt.config.*` | `spring-writer` / `nuxt-writer` 均不适用，故无 skill 可命中 |
| pnpm workspace 单仓多包 | `pnpm-workspace.yaml:5-6`（`packages: - "plugins/*"`）、根 `package.json:6`（`packageManager: pnpm@11.25.0`） | Node/TS 单仓 |
| 宿主半 = TypeScript + Cordis 插件 | `plugins/user-commands/src/host/index.ts:41`（`export const name`）、`:51`（`export const inject`）、`:174`（`export function apply`）；`plugins/session-tool-toggle/src/host/index.ts:118`（`export const Config = Schema.object({…})`） | Cordis `name/inject/Config/apply` 装配面 |
| 构建 = esbuild 自打包单文件 | `plugins/user-commands/build.mjs:30`（单一 `entryPoints`）、`:32-38`（`bundle: true` / `format: 'esm'` / `external: ['node:*', '@deepseek-ai/dsh-llm']`） | host-only 产物形态 |
| 测试 = vitest + 类型只读上游 | `plugins/user-commands/vitest.config.ts`（`environment: 'node'`）、`plugins/user-commands/test/inventory-command.test.ts:8-19`（`import type { Context }` + 假端口） | 仓内单测口径：不起真 Context |
| 类型面 = tsc project references | `plugins/project-mcp/tsconfig.json`（`files: []` + `references`）、`tsconfig.host.json`（`composite: true`，`include` 含 `test/**/*.test.ts`） | 无 emit、只查类型 |

---

## ① 触达面清单

**仓归属**：除标明「仓外」的行，全部落 **本仓 `dsh-plugins`**，插件目录 `plugins/zcode-plan/`（下表未写前缀者均相对该目录）。
上游 `@deepseek-ai/dsh*`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`）**只读核实、零修改**（ADR-0002 纪律，`plugins/multi-root-workspace/docs/decisions/ADR-0002-upstream-coupling-policy.md`）。

### 1.1 宿主半源码（`src/`）

| # | 文件 | 意图 | 关键改动点 |
|---|---|---|---|
| H1 | `src/index.ts` | **新建**：bundle 入口 | 只有一行 re-export：`export { name, inject, Config, apply } from './host/index.ts'`（照 `plugins/session-tool-toggle/src/index.ts:13`） |
| H2 | `src/host/index.ts` | **新建**：装配层（唯一有副作用的地方） | `name = 'zcode-plan'`；`inject: readonly string[] = []`（全软注入，照 `user-commands/src/host/index.ts:51` 的「零硬依赖」姿态）；`Config`（§3.2）；`apply(ctx, config)` 顺序：装 logger 端口 → `ctx.inject(['credentials','authorization'], …)` 内注册 flow + 装 `credentials/record-updated` 监听 → `ctx.inject(['commands'], …)` 内注册 `/zcode-plan` → 若有记录则拉起 PAT owner；`ctx.effect` 统一拆卸（清定时器、abort 尝试、摘监听） |
| H3 | `src/host/ports.ts` | **新建**：窄端口与假实现基线 | `FetchPort`（`(input, init) => Promise<Response>` 形状的最小面）、`ClockPort`（`now(): number` / `setTimeout` 句柄包装）、`LogPort`（`info/warn/error`，前缀 `zcode-plan：`，照 `session-tool-toggle/src/host/index.ts:132` 的 `LOG_PREFIX`）；**只声明本插件消费的成员**，不 import 上游抽象类 |
| H4 | `src/host/bigmodel/endpoints.ts` | **新建**：URL/路径常量唯一出处 | `BIGMODEL_WEB = 'https://bigmodel.cn'`、`BIGMODEL_OPEN = 'https://open.bigmodel.cn'`、`CODING_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'`、`AUTHORIZE_URL`、`TOKEN_BY_AUTH_CODE_URL`、`keyListPath(org,proj)` / `keyCreatePath(org,proj)` / `patIssuePath(org,proj,keyId)`、`USAGE_LIMIT_URL`、`DEFAULT_CLIENT_VERSION = '0.17.0'`、`CALLBACK_PATH = '/oauth/callback/bigmodel'`。**所有会被上游改动的字面量集中在此一个文件**（R2 的收口点） |
| H5 | `src/host/bigmodel/envelope.ts` | **新建**：envelope 归一（纯函数） | `successCode(code)` 接受 `0`/`200` 的数字或字符串（diff-matrix §三「envelope 成功码兼容」）；`unwrap<T>(json, parse)` → `{ok:true,value}` / `{ok:false,reason:'business'|'shape',code?,msg?}`；**诊断只保留 `code`/`msg` 与字段名，绝不回显值** |
| H6 | `src/host/bigmodel/client.ts` | **新建**：四组 API 客户端（无状态、可注入 fetch） | `createBigmodelClient({fetch, clock, log, clientVersion})` → `{ exchangeAuthCode, listKeys, createKey, issuePat, readUsage }`；统一 15s `AbortSignal`（§3.4）；所有响应走 H5；`issuePat` 的效期解析与「token 字段兜底」在此（§3.4 末） |
| H7 | `src/host/login-flow.ts` | **新建**：authorization flow 的 `run()` + 命令侧尝试状态机 | `createLoginFlow(deps)` → `AuthorizationFlow`（`key` = §3.3）；`run(session)`：state 生成 → 起 loopback（可关）→ `notify({url})` → 「回调 vs 粘贴」赛跑 → 换 JWT → 解析身份 → `session.commit(grant)` → `finally` 关服务器；`createLoginDriver()`（命令侧）：`begin()`/`paste(url)`/`abort()`/`current()`（§3.6） |
| H8 | `src/host/loopback.ts` | **新建**：一次性回环回调服务器 | `startCallbackServer({state, path, log, clock})` → `{redirectUri, result: Promise<CallbackResult>, close()}`；只监听 `127.0.0.1:0`；校验 `state`；成功/失败各回一个纯文本短页；超时自关；`close()` 幂等**且必须结算仍挂起的 `result`**（以 `CallbackClosedError` 拒绝），否则 flow 的两个分支会留下未处理拒绝 |
| H9 | `src/host/credential-record.ts` | **新建**：grant 记录形状与读写 | `LOGIN_RECORD_KEY`（§3.3）、`GRANT_VERSION = 1`、`parseGrant(record)`（非法 → `undefined` + warn，**不抛**）、`patchGrantKeyId(ctx, key, keyId)`（用 `modifyRecord` 读-改-写，见 §3.3） |
| H10 | `src/host/key-manager.ts` | **新建**：桥接 Key find-or-create | `ensureKey({client, grant})`：`listKeys` → 命中 `name === KEY_NAME && usageScene === 1` 即复用其 `apiKey` 段作为 `keyId`；否则 `createKey({name, usageScene:1})` 取 `data.apiKey`；`invalidateKey(keyId)`（PAT 签发 404/403 时作废并重查一次，最多一轮，防环） |
| H11 | `src/host/pat-owner.ts` | **新建**：PAT 生命周期核心（纯逻辑 + 可注入端口） | `createPatOwner(deps)`：`ensure()` 单飞（`pending` 合并）、代次 `generation` 拒绝迟到结果、失败分类（§3.5 表）、`schedule()` 的提前量公式与 5s 退避、`halt(code)`；对外 `{current(), ensure(), haltReason(), dispose()}`；**发布动作是唯一写路径**：`credentials.set(PAT_REF, pat)` |
| H12 | `src/host/route-config.ts` | **新建**：路由常量 + profile 层注册/摘除 | `ZCODE_PLAN_ROUTE`（§3.8，单一真源）；`installRoute({configEditor, llm, log})`：定位 `llm-pi-ai` 条目 → 读 `configuration()` 的 `override/inherited` → 并集合并 → `edit()` → 读 `llm.listProviders()` 验证；`routeState({configEditor, llm})`；`removeRoute()`。**幂等**：`providers['zcode-plan']` 深等即跳过写盘 |
| H13 | `src/host/status.ts` | **新建**：status 文本拼装（纯函数 + 一次用量读） | `renderStatus(snapshot)`（§3.9）；`readRouteState(llm)` 用 `listProviders()` / `listConfigurableProviders()` 两读；`readUsage(client, grant)` 只读、失败降级成一行说明 |
| H14 | `src/host/commands.ts` | **新建**：`/zcode-plan` 命令面 | `createZcodePlanCommand(deps)` → `CommandDefinition`（`name: 'zcode-plan'`）；文法 `login [<callback-url>]` / `logout` / `status`（缺省）/ `route [install\|remove\|status]` / `refresh`；回执走 `CommandResult` 的 `{kind:'success'\|'error', text}`（照 `user-commands/src/host/index.ts:125-137`） |
| H15 | `src/host/errors.ts` | **新建**：错误分类与脱敏（纯函数） | `BridgeError extends Error {code}`，码表 §3.10；`classifyHttp(status)` / `classifyEnvelope(reason)` → `'retryable' \| 'terminal'`；`maskSecret(s)`（只留长度与前 4 位）；`assertNoSecret(text, secrets)`（单测红线用，生产日志路径不调） |

### 1.2 包与构建（插件根）

| # | 文件 | 意图 | 关键改动点 |
|---|---|---|---|
| P1 | `package.json` | **新建** | `name: dsh-plugin-zcode-plan`、`version` 跟仓 `1.4.0`（发布时由 `scripts/release.mjs` 统一抬）、`type: module`、`main: lib/index.js`、`exports: {".": {"default": "./lib/index.js"}}`、`dsh.engines.dsh: ">=0.2.1-rc.2 <0.3.0"`（派生自 `scripts/dsh-baseline.mjs:23-29` 的 `softDshRange`）、`dsh.bundle.patch: "./cordis.patch.yml"`、`peerDependencies: {"@deepseek-ai/dsh": ">=0.2.1-rc.2 <0.3.0"}`、devDeps 精确 pin 基线 + `@deepseek-ai/cordis 4.0.5` + `@deepseek-ai/schemastery 3.18.5` + `@types/node`/`esbuild`/`oxlint`/`typescript`/`vitest`（照 `plugins/user-commands/package.json:16-21,31`）；**不声明 `dsh.client`**（host-only，任何 profile 可装） |
| P2 | `cordis.patch.yml` | **新建** | 只做一件事：`- insert: [{id: zcode-plan, name: 'dsh-plugin-zcode-plan'}]`（照 `plugins/project-mcp/cordis.patch.yml:12-14`）。**不在这里声明 llm 路由**（理由见 D-1） |
| P3 | `build.mjs` | **新建** | 照抄 `plugins/user-commands/build.mjs:30-52`：单入口、`bundle: true`、`format: 'esm'`、`platform: 'node'`、`target: 'node22'`、`external: ['node:*']`、`sourcemap: false`；**无 `@deepseek-ai/*` 运行时 import**（全部 `import type`），因此无需 user-commands 那条 external 特例；CJS `require` banner 也不需要（无 `yaml` 类 CJS 依赖） |
| P4 | `tsconfig.json` / `tsconfig.base.json` / `tsconfig.host.json` | **新建** | 照抄 `plugins/project-mcp/` 三件套：`files: []` + `references:[{path:./tsconfig.host.json}]`；base 保留 `moduleResolution: "bundler"` / `allowImportingTsExtensions` / `noEmit` / `strict`；host 的 `include` = `src/index.ts`、`src/host`、`test/**/*.test.ts`、`vitest.config.ts` |
| P5 | `vitest.config.ts` | **新建** | `include: ['test/**/*.test.ts']`、`environment: 'node'`（host-only，无浏览器半） |
| P6 | `.gitignore` | **新建** | `node_modules/`、`*.tsbuildinfo`（照 `plugins/project-mcp/.gitignore`） |
| P7 | `scripts/compose-check.mjs` | **新建**：离线组合断言脚本（T6 的出口） | 建隔离 `$DSH_HOME`（`/tmp` 临时目录）→ 临时 profile 的 `node_modules/` 里 **symlink 本插件目录**并把 `dsh-plugin-zcode-plan` 加进 `dsh.profile.bundles`（bundle 双锚解析：`plugins/multi-root-workspace/docs/reference/multi-root-workspace-research.md:188-193`）→ 跑 `dsh --profile <tmp> --dump-config` 三例断言（§⑤ T6）；`verify:all` 不挂它（依赖 dsh 二进制），单列出 `compose:check` |

### 1.3 测试（`test/`）

| # | 文件 | 意图 |
|---|---|---|
| X1 | `test/envelope.test.ts` | **新建**：成功码 `0`/`200`/`"0"`/`"200"`、HTTP 200 + `code!=0`、非 JSON 正文、缺字段、错误不含值 |
| X2 | `test/client.test.ts` | **新建**：四组 API 的请求形状（方法/路径/头/体）、15s 超时（假 clock）、envelope 失败映射、`issuePat` 效期解析三分支、脱敏 |
| X3 | `test/key-manager.test.ts` | **新建**：命中 scene=1 / 同名 scene=3 不误用（本账号夹具）/ 无 Key 新建 / 404 作废重查一次 / 建 Key 后 keyId 落记录 |
| X4 | `test/pat-owner.test.ts` | **新建**：fake timers 覆盖 §3.5 表全部行——提前 120s+jitter、失败分类（网络/超时/429/5xx 复用旧值 + 5s 退避；401/403/404/畸形 清缓存 + 终止）、并发合并单 pending、logout 后迟到结果被代次拒绝、dispose 后不再写 |
| X5 | `test/login-flow.test.ts` | **新建**：state 不匹配拒绝、回调先到关闭粘贴提示、粘贴先到关闭服务器、`session.commit` 在 `run()` 返回前发生、超时清理、`notify` 携带 url |
| X6 | `test/commands.test.ts` | **新建**：五个子命令文法、`status` 缺省、`login` 二次调用回显同一 URL、`route install` 幂等（第二次不写盘）、错误码文案 |
| X7 | `test/route-config.test.ts` | **新建**：合并算法（`inherited` 有 `providers` 而 `override` 无 → 保留；两边都有 → 逐键 profile 胜；已有同名同值 → 跳过）、`remove` 只删本键 |
| X8 | `test/status.test.ts` | **新建**：四级状态 + 路由两读 + 用量读数时间戳/降级、JWT 到期日、**断言输出不含任何 JWT/PAT 片段**（喂真值当夹具，断言 `not.toContain`） |
| X9 | `test/credential-record.test.ts` | **新建**：非法 payload 降级 `undefined`、`keyId` 读-改-写保留 jwt/org/proj、版本号不匹配降级 |
| X10 | `test/bundle.test.ts` | **新建**：`lib/index.js` 产物只 `import 'node:*'`（无 `@deepseek-ai/*` 运行时依赖，照 `plugins/web-ux/test/bundle.test.ts` 的产物纯度口径） |

### 1.4 仓库根（本仓 `dsh-plugins`，根仓）

| # | 文件 | 意图 |
|---|---|---|
| R1 | `README.md:75-79` | 插件一览表新增一行 `dsh-plugin-zcode-plan`；`:32` 的「其余四个软插件」表述改为「其余五个软插件」 |
| R2 | `AGENTS.md:20-26` | 「插件清单」新增一条；`:37` 的「四个软插件（project-mcp / user-commands / web-ux / session-tool-toggle）」→ 加 `zcode-plan` |
| R3 | `openspec/changes/zcode-plan-bridge/{proposal.md,design.md,tasks.md,specs/dsh-zcode-plan/spec.md}` | **规划产物**（已由 spec-plan 落档；本文 ⑤ 的 T0–T9 即其 tasks 骨架）。**不得手写绕开流程**（`AGENTS.md:70-74`） |
| R4 | `openspec/specs/dsh-zcode-plan/spec.md` | 由 openspec 归档时生成（实施期落，不在本蓝图） |

**明确不改（已核实）**：
- `scripts/dsh-baseline.mjs`（新插件从同一个 `softDshRange()` 派生，无需改）；
- `scripts/check-dsh-baseline.mjs`（`listPlugins()` 按目录自动发现，见 `:73-80`；soft/hard 按「有无 `src/compat/dsh-version.ts`」自动分类，见 `:149-150`；新插件不写该文件即自动算 soft，`:181-192` 的三条断言自动生效）；
- `scripts/upgrade-dsh.mjs`（同样按目录发现，`:57-60`）；
- `scripts/release.mjs`（递归读 `plugins/*/package.json`）；
- `pnpm-workspace.yaml`（`packages: plugins/*` 通配已覆盖；新插件要用的 DSH 包与 `schemastery` 已在 `minimumReleaseAgeExclude` 中）。

### 1.5 仓外触达面（**运行时写入，不是本仓 diff**）

| # | 路径 | 谁写 | 说明 |
|---|---|---|---|
| E1 | `~/.dsh/profiles/web/cordis.patch.yml`（`:26` 的 `- id: llm-pi-ai` 条目） | `/zcode-plan route install` 经 `ctx.configEditor.edit()`；迁移由用户手工删 `:46` 起的 `zai-coding-zcode` 块 | 自动化只**增删 `providers['zcode-plan']` 一键**，保留注释与 `!!js`（`dsh-config-editor/README.zh.md:41`）；**不碰** `agent-default-model`（`:12-16`） |
| E2 | `~/.dsh/.credentials.yaml` | 本插件 | `refs.ZCODE_PLAN_PAT`（PAT）+ `records['zcode-plan/bigmodel-login']`（JWT + org/proj + keyId）；权限由 credentials-local 保证 0600 |
| E3 | `~/.dsh/profiles/web/cordis.yml` | **dsh CLI 每次启动都会重写**（`dsh/lib/profile-boot-C14i-8IN.js:220`、`:238`） | 因此 `--dump-config` 要求 profile 目录**可写**；沙箱/只读挂载下会 `EACCES`（本文实测踩到，见 §②） |

---

## ② 证据锚

> 每个触达模块 ≥1 条 `file:line` 事实。上游路径前缀 `$D = /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`；`dsh` CLI 自身前缀 `$CLI = /usr/local/lib/node_modules/@deepseek-ai/dsh/`。

### 2.1 本轮实测（两个可复现实验，构成 D-1 的判定）

**实验 1（bundle 层单独生效）** —— 隔离 `$DSH_HOME`，profile 的 `cordis.patch.yml = []`，合成 bundle `zp-fixture-bundle` 对 `id: llm-pi-ai` 追加 `providers.bundle-route`：

```bash
R=/tmp/zp-exp; rm -rf $R; mkdir -p $R/home/profiles/zp/node_modules/zp-fixture-bundle
printf '%s\n' '{"name":"dsh-profile-zp","private":true,"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","zp-fixture-bundle"]}},"dependencies":{}}' > $R/home/profiles/zp/package.json
printf '[]\n' > $R/home/profiles/zp/cordis.yml
printf '%s\n' '{"name":"zp-fixture-bundle","version":"1.0.0","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}' > $R/home/profiles/zp/node_modules/zp-fixture-bundle/package.json
printf -- '- id: llm-pi-ai\n  config:\n    providers:\n      bundle-route:\n        apiKeyEnv: BUNDLE_ROUTE_KEY\n        api: openai-completions\n        baseURL: https://example.invalid/v1\n' > $R/home/profiles/zp/node_modules/zp-fixture-bundle/cordis.patch.yml
printf '[]\n' > $R/home/profiles/zp/cordis.patch.yml
DSH_HOME=$R/home dsh --profile zp --dump-config | grep -n 'bundle-route'
# 实测输出：81:      bundle-route:        （exit=0，stderr 空）
```

**实验 2（同一 bundle 层 + 用户 profile 层同 id → bundle 的键消失）** —— 只改 profile 层：

```bash
printf -- '- id: llm-pi-ai\n  name: "@deepseek-ai/dsh-llm-pi-ai"\n  config:\n    providers:\n      user-route:\n        apiKeyEnv: USER_ROUTE_KEY\n' > $R/home/profiles/zp/cordis.patch.yml
DSH_HOME=$R/home dsh --profile zp --dump-config | grep -nE 'bundle-route|user-route'
# 实测输出：81:      user-route:          （bundle-route 不再出现；exit=0）
```

→ **结论**：`dsh-app-boot/README.zh.md:61`（「替换某个条目的整个配置（重述你要保留的字段）」）与 `:204`（「用户 patch 会替换匹配到的整个配置——按 id 定位的 patch 不做深度合并」）在 `0.2.1-rc.2` 上如实成立；用户在 profile 层自己配置 `llm-pi-ai` 时（本机 `~/.dsh/profiles/web/cordis.patch.yml:26,29` 正是如此），**bundle 层加的路由 100% 被吃掉**。仓内旁证：用户 patch 必须**重述** bundle 提供的 `leasePath`（`~/.dsh/profiles/web/cordis.patch.yml:189` 对应 `plugins/multi-root-workspace/cordis.patch.yml:52`）。

**实验 1 附带事实**：`dsh --dump-config` 会在导出前**写** profile 根 `cordis.yml`（`$CLI/lib/profile-boot-C14i-8IN.js:220`：`writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)`，`prepareProfile` 内，dump 走同一函数），本次在被阻断的沙箱里首次尝试即 `EACCES: … /profiles/web/cordis.yml`。→ 验证命令必须在**可写 profile 目录**的宿主进程里跑（`docker exec dsh …`）。

### 2.2 上游 seam（只读）

| 模块 | 证据 |
|---|---|
| H7 `login-flow.ts` | `$D/dsh-authorization/lib/types/index.d.ts:174`（`registerFlow(flow): () => void`）、`:212`（`begin(request): Promise<AuthorizationOutcome>`）、`:74`（`session.signal`）、`:80`（`session.commit(record)`）、`:86`（`notify`）、`:93`（`prompt`）；`$D/dsh-authorization/README.zh.md:28`（「任何界面都能发起尝试」）、`:74`（`ALREADY_IN_FLIGHT`）、`:75`/`:113`（`NOT_COMMITTED`：`run()` 返回前必须提交记录）；`$D/dsh-authorization/lib/types/types.d.ts`（`AuthorizationPrompt` 自带 `signal` = 「撤回这一个提问、flow 继续」，正是「回调 vs 粘贴」赛跑的官方语义） |
| H9 `credential-record.ts` | `$D/dsh-credentials/lib/types/types.d.ts:47-51`（`GrantRecord.payload` 对 seam 不透明、只要求 JSON 往返）、`:90`（`credentials/record-updated(key)`）；`$D/dsh-credentials/lib/types/index.d.ts:186`（`modifyRecord` 是唯一写路径，mutate 看到写入独占时的值）、`:165`/`:191`；`$D/dsh-credentials/README.zh.md:127`（读-决定-替换 + 跨进程独占） |
| PAT 发布 | `$D/dsh-credentials/lib/types/index.d.ts:145`（`set(ref, value)`）、`:130`（`resolve` 按操作解析）、`:137`（`describe` 只报 configured/source/writable）；`$D/dsh-credentials/README.zh.md:12`、`:91`（「轮换后的已存储密钥作用于紧随其后的下一次请求」）、`:95`（存储值优先于启动环境）；`$D/dsh-credentials-local/lib/index.js:484`（存储层 `source: "file"`）→ 本插件冲突检测的判据；`$D/dsh-credentials/lib/index.js:15`（`KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/`）→ `credentialKey('zcode-plan','bigmodel-login')` 合法 |
| 路由消费 | `$D/dsh-llm-pi-ai/README.zh.md:38`（`apiKeyEnv` 按请求经凭据 seam 解析；解析为空 → `MISSING_CREDENTIAL`；`retryPolicy` 每 profile 可设）、`:119`（非 catalog 路由需 `api`+`baseURL`+非空 `models`；`INVALID_CREDENTIAL` / `MISSING_CREDENTIAL` / `UNKNOWN_MODEL` / `QUOTA` / `RATE_LIMIT`）、`:95`（`apiKeyEnv` 覆盖存储登录；手工路由键不可登录） |
| H12 `route-config.ts` | `$D/dsh-config-editor/lib/types/index.d.ts:15`（`documentPath`）、`:19`（`entries(): Entry[]`）、`:23`（`configuration(): {entry, inherited, override}[]`）、`:34`（`edit(entry, change)`）；`$D/dsh-config-editor/README.zh.md:33`（编辑完整配置的调用方用 `edit()`）、`:41`（原子替换、保留注释与 `!!js`、失败回滚）；`$D/dsh-llm/lib/types/index.d.ts:281`（`listProviders()`）、`:295`（`listConfigurableProviders()`）；`$D/dsh-config-editor` 在 base 组合中已挂载（本轮 `--dump-config` 实测 `dump-A.yml:60` 有 `- id: config-editor`） |
| D-2 反例（第二行 pi-ai） | `$D/dsh-llm-pi-ai/lib/index.js:2841-2857`（`directoryEntries` 先声明**全部** catalog provider 再声明本行 profiles）、`:2864`（`settingsNs = ctx.fiber.entry?.options.id`，行 id 即 settings 命名空间）；`$D/dsh-llm/lib/index.js:1935`（同名 configurable provider 已声明 → `DUPLICATE_DIRECTORY`）、`:1980`（`DUPLICATE_DISCOVERY`，按 settingsNs）、`:1872`（`DUPLICATE_ADAPTER`，同 route 名） |
| H11 `pat-owner.ts` / H6 超时 | `$D/dsh-atomic-write/README.zh.md:57`（「持锁方循环若包含一次网络往返…就应声明更长的值」→ 本设计把网络放在锁外，`modifyRecord` 内只写文件，用默认 `waitMs`）；`$D/dsh-llm-retry/README.zh.md:50`（normal mode 默认合格集 = `EMPTY_RESPONSE`/`RATE_LIMIT`/`SERVER`/`TIMEOUT`/`TRANSPORT`） |
| E6 落地形状 | `$D/dsh-llm/lib/index.js:251-257`（`DEFAULT_RETRYABLE_CODES` 五码）、`:266`（`retryableCodes: z.array(...).default([...DEFAULT])`——**给了就是整集覆盖**，不是追加）、`:327-331`（解析与去重/非空校验）；`$D/dsh-llm/lib/types/error.d.ts:40`（`INVALID_CREDENTIAL_CODE = "INVALID_CREDENTIAL"`，注释明言「故意不在默认可重试集」） |
| H4/H5/H6 输入 | `/home/docker/.cache/zcode-rate-test/test-b.sh:9-11`（用量端点 + `authorization: <JWT>` 裸头 + `bigmodel-organization`/`bigmodel-project` + `data.limits.find(x=>x.unit===3)`）、`:14-17`（建 Key `POST …/api_keys`，体 `{name,usageScene:1}`）、`:25`（**建 Key 响应的 `data.apiKey` 即路径里的 keyId**）；`test-pat.sh:14-18`（换 PAT `POST …/api_keys/{keyId}/access_tokens`，体 `{clientType:"zcode",clientVersion:"0.17.0"}`，头 `Authorization: Bearer <JWT>`）、`:28-30`（用量头形态）；`test-verify.sh:26-27`（存量 scene=1 Key `arch-company` 同样可换 PAT）；`README.md`「第二轮」段（PAT 响应字段未定稿、`accessToken` 为实测名）；`results.log`（O1/O2/O3 = 14/15/14，B 组 3-4） |
| H13 `status.ts` | 用量响应形状实测：`/tmp/quota.json` 与 `test-b.sh:9-11` 的解析口径一致 —— `{code,msg,success,data:{level,limits:[{type,unit,number,usage,currentValue,remaining,percentage,nextResetTime}]}}`，`unit===3` 为 5h 窗口；聚合延迟 1–2 分钟（diff-matrix §三 A 线独有项） |
| H14 `commands.ts` | `$D/dsh-commands/lib/types/index.d.ts:38-55`（`CommandDefinition`：`name`/`description`/`input.hint`/`handler(invocation)`）、`:94`（`register(definition): () => void`）；仓内注册形态 `plugins/user-commands/src/host/index.ts:119-138`（把服务包成注册器 + host 型命令直接 `invoke`）、`:286-319`（`ctx.inject(['commands'], scope => scope.effect(...))` 内注册并随 fiber 摘下） |
| H2 `index.ts` 装配 | `plugins/user-commands/src/host/index.ts:51`（`inject: string[] = []` 全软依赖的写法与理由）、`:325-334`（`agent/created` 串行 await 的范例）、`:342-347`（`ctx.effect(() => () => …)` 统一拆卸）；`plugins/web-ux/src/index.ts:90-100`（`ctx.inject(['connection','webServer'], …)` 软注入 + 在 root 读服务的坑位注释——本插件读 `credentials`/`llm` 同理，服务一律 `ctx.get(...)` 软读） |
| 软注入与晚到 | `plugins/user-commands/src/host/index.ts:157-168`（`agent.ctx.inject` 晚到补挂）、`:196-224`（`ctx.get('workingDirectory')` 软读 + 缺省降级） |
| 产物纯度先例 | `plugins/web-ux/test/bundle.test.ts`（扫描 `lib/*.js` 的 `require`/`import` 白名单）；`plugins/user-commands/build.mjs:30-38`（host 产物只 `external: ['node:*', …]`） |
| 仓级门禁 | `scripts/check-dsh-baseline.mjs:73-80`（按目录发现）、`:149-150`（hard/soft 自动分类）、`:181-192`（`dsh.engines.dsh` 与 DSH peer 必须等于 `softDshRange()`）、`:243-250`（`scripts/` 下活引用的历史检查）；`scripts/dsh-baseline.mjs:13`（`DSH_BASELINE = '0.2.1-rc.2'`）、`:23-29`（`softDshRange`）、`:32`（`SOFT_DSH_RANGE`） |
| 上游 dsh CLI | `$CLI/lib/profile-boot-C14i-8IN.js:220`、`:238`（每次 `prepareProfile` 重写 profile 根 `cordis.yml`）、`:121-126`（`PROFILE_ROOT_CONFIG` 字面量，与仓内 `~/.dsh/profiles/web/cordis.yml` 逐字一致） |

---

## ③ 接口与数据形状

### 3.1 模块依赖与端口

```
src/index.ts ─► src/host/index.ts ─┬─► bigmodel/{endpoints,envelope,client}
                                   ├─► login-flow ─► loopback
                                   ├─► credential-record ─► key-manager ─► pat-owner
                                   ├─► route-config ─► (ctx.configEditor / ctx.llm)
                                   ├─► status ─► commands
                                   └─► ports / errors
```

- **只有 `src/host/index.ts` 与 `commands.ts` 碰 `ctx`**；其余模块全部收窄成纯逻辑 + 端口对象，单测零宿主。
- 端口只声明消费面（照 `plugins/user-commands/src/host/index.ts:74-105` 的「窄面 interface」做法）：

```ts
export interface FetchPort { (input: string, init: RequestInit): Promise<Response> }
export interface ClockPort {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}
export interface LogPort {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}
/** 本插件用到的 credentials 面（不 import 上游抽象类，与仓内「窄面 + 类型只读」一致）。 */
export interface CredentialsPort {
  resolve(ref: CredentialRef): Promise<{ value: string; source: string } | undefined>
  describe(ref: CredentialRef): Promise<{ configured: boolean; source?: string; writable: boolean }>
  set(ref: CredentialRef, value: string): Promise<void>
  unset(ref: CredentialRef): Promise<void>
  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>
  modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined>
  deleteRecord(key: CredentialKey): Promise<void>
}
```

### 3.2 Config（schemastery，profile 行 `config:` 段）

```ts
export const Config = Schema.object({
  organization: Schema.string().description('大模型开放平台组织 id；省略时按登录 JWT 自动发现（T0 未证则必填）'),
  project: Schema.string().description('项目 id；同上'),
  clientVersion: Schema.string().default('0.17.0').description('换发 PAT 时上报的 clientVersion（跟随官方 ZCode 版本）'),
  refreshLeadMs: Schema.number().default(120_000).description('PAT 提前续期量（F3：默认贴官方 120s，实测竞态不可忍再上调）'),
  refreshJitterMs: Schema.number().default(60_000).description('续期抖动上限（0–该值均匀分布，官方同款）'),
  requestTimeoutMs: Schema.number().default(15_000).description('单次管理面请求超时'),
  callbackServer: Schema.boolean().default(true).description('是否起 127.0.0.1 一次性回调服务器（容器拓扑下可关，只用粘贴）'),
  loginAttemptTtlMs: Schema.number().default(600_000).description('一次登录尝试的存活上限，超时自动 abort'),
}).description('zcode-plan：把 bigmodel.cn GLM Coding Plan 的 ZCode 折扣凭证桥接进 dsh 路由')
```

**零配置可跑**（照 `session-tool-toggle/src/host/index.ts:110-117` 的「四键全可选、patch 不带 `config:`」纪律）：全部键有默认值；`organization`/`project` 缺省时依赖 T0 结论（见 Q4）。

### 3.3 凭据地址与记录形状

```ts
// 记录（唯一写者为本插件；payload 对 seam 不透明）
export const LOGIN_RECORD_KEY = credentialKey('zcode-plan', 'bigmodel-login')
export const PAT_REF = credentialRef('ZCODE_PLAN_PAT')

/** grant payload v1：机密只有 jwt 一项，其余是定位元数据。 */
export interface LoginGrant {
  readonly v: 1
  readonly jwt: string            // 登录 JWT（管理面唯一凭据）；绝不进日志/错误/ref
  readonly organization?: string  // 发现或 Config 填入
  readonly project?: string
  readonly keyId?: string         // 桥接 Key 的 id（非 secret，E3：Key Secret 创建后即丢弃）
  readonly loginAt: number        // epoch ms
  readonly jwtExpiresAt?: number  // 由 JWT payload 的 exp 解出；解不出则省略
  readonly patExpiresAt?: number  // 最近一次 PAT 的绝对到期时刻（仅状态显示用）
}
```

- **写入路径**：登录成功 → `session.commit({kind:'grant', payload})`（满足 `NOT_COMMITTED` 检查）；后续补 `keyId`/`patExpiresAt` → `credentials.modifyRecord(LOGIN_RECORD_KEY, current => ...)`（保留 `jwt` 与身份字段，只改目标键；`mutate` 内**无网络**，见 D-6）。
- **PAT**：只进 `PAT_REF`（`set`/`unset`），**永不进记录/日志**（Q2 已接受的落盘偏离在 README 显式声明）。
- **冲突检测**（R10）：启动时 `describe(PAT_REF)`；若 `configured && source !== 'file'`（`$D/dsh-credentials-local/lib/index.js:484` 的存储层标识），说明 `ZCODE_PLAN_PAT` 被环境/项目 `.env` 供给 → **拒绝发布并点名**（`BridgeError('REF_CONFLICT')`），日志只报名字与来源层，不读值。

### 3.4 bigmodel API 契约（集中在 `endpoints.ts` + `client.ts`）

| 用途 | 方法与路径 | 头 | 体 | 响应要点 |
|---|---|---|---|---|
| 换登录 JWT | `POST https://bigmodel.cn/api/auth/tokenByAuthCode` | `content-type: application/json` | `{ authCode }` + `appId`/`state` 形态**待 T0 钉死**（`endpoints.ts` 内一个常量 + 一个 `exchangeAuthCode` 函数） | `data` 里的 access token 即登录 JWT（A2 假设） |
| 列 Key | `GET https://bigmodel.cn/api/biz/v1/organization/{org}/projects/{proj}/api_keys` | `Authorization: Bearer <JWT>` | — | `data: [{ name, apiKey, usageScene, … }]`；`apiKey` 字段即路径里的 keyId（`test-b.sh:25`） |
| 建 Key | `POST` 同路径 | 同上 | `{ name: 'zcode-plan-bridge', usageScene: 1 }` | `data.apiKey` = 新 keyId |
| 换 PAT | `POST …/api_keys/{keyId}/access_tokens` | 同上 | `{ clientType: 'zcode', clientVersion }` | `data` 内 token（实测名 `accessToken`）+ 效期字段（名未定稿） |
| 用量 | `GET https://www.bigmodel.cn/api/monitor/usage/quota/limit` | **`authorization: <JWT>`（无 `Bearer`）+ `bigmodel-organization` + `bigmodel-project`** | — | `{code,msg,success,data:{level,limits:[{unit,number,currentValue,remaining,percentage,nextResetTime}]}}`，`unit===3` 为 5h 窗口、`unit===6` 为周额度（status 两档都展示） |

**头形态的不对称是实测事实**（`test-pat.sh:15-17` 用 `Bearer`，`:28-30` 用裸 JWT），代码里必须分开写并在注释里标明出处，不得「统一成 Bearer」。

**PAT 效期解析（三级兜底，E5 的实现边界）**：

```ts
type PatLease = { pat: string; expiresAt: number }   // 绝对本地时刻（epoch ms）
// 1) data.expiresAt 存在 → 直接用服务端绝对值（并夹到 [now, now+6h] 防呆）
// 2) 否则 data.expiresIn / ttl（秒）→ requestStartedAt + s*1000（时长口径，免疫时钟漂移）
// 3) 都不存在 → requestStartedAt + 18000_000（官方效期常量）
// 说明：E5 要求「优先服务端绝对值」；但若服务端时钟与本机偏差大，绝对值会误排期，
// 因此「绝对值」分支额外做一次合理性夹取，越界则退回 2)。
```

**响应壳**：`unwrap` 接受 `{code,msg,data}`；`successCode` = `code === 0 || code === 200 || code === '0' || code === '200' || success === true`（Q1 兼容条款）；HTTP 非 2xx 与业务失败都映射到 `BridgeError` 码表（§3.10）。

### 3.5 凭据状态机 + PAT owner

**三级状态**（`status.ts` 的读数来源）：

```ts
type LoginState = { kind: 'absent' } | { kind: 'present'; grant: LoginGrant; jwtExpiresAt?: number }
type KeyState   = { kind: 'unknown' } | { kind: 'ready'; keyId: string } | { kind: 'creating' }
type PatState   = { kind: 'none' } | { kind: 'valid'; expiresAt: number } | { kind: 'expired' }
                | { kind: 'halted'; code: string }
```

**owner 对外面**：

```ts
export interface PatOwner {
  current(): PatLease | undefined
  ensure(): Promise<PatLease>              // 单飞：并发调用共享同一个 pending
  state(): PatState
  haltReason(): { code: string; message: string } | undefined
  dispose(): void                          // 清定时器 + 递增代次，后续迟到结果全部丢弃
}
export function createPatOwner(deps: {
  credentials: CredentialsPort
  client: BigmodelClient
  keyManager: KeyManager
  log: LogPort
  clock: ClockPort
  leadMs: number
  jitterMs: number
  recordKey: CredentialKey
  patRef: CredentialRef
}): PatOwner
```

**续期公式**（官方契约 C6）：

```
delay = expiresAt - now - leadMs - random(0, jitterMs)
schedule = clamp(delay, MIN_RETRY_MS = 5_000, max(1_000, expiresAt - now - 1_000))
```

**失败分类表**（`errors.ts` 的 `classify`，单测 X4 逐行覆盖）：

| 失败 | 归类 | 行为 |
|---|---|---|
| 网络/`AbortError`/`TIMEOUT` | retryable | 若旧 PAT 未过期：继续用旧值（ref 不动），5s 后重试；旧值已过期：`setTimeout(ensure, 5_000)`，期间请求侧表现为 `MISSING_CREDENTIAL`/`INVALID_CREDENTIAL` |
| HTTP 429 / 5xx | retryable | 同上（**不做**指数放大，避免风控） |
| HTTP 401/403（JWT 失效） | terminal | `halt('JWT_EXPIRED')`：清缓存、停止循环、保留 ref（旧 PAT 到点自然失效）；status 明示「需重新登录」 |
| HTTP 404（keyId 失效） | terminal-可重查 | `keyManager.invalidateKey()` → 重查一轮；再失败 `halt('KEY_LOST')` |
| envelope `code != 0`（业务拒绝） | terminal | `halt('BUSINESS:<code>')`，只带码与 msg（msg 经 `maskSecret`） |
| 405 `[3012]`（风控） | terminal | `halt('RISK_3012')`，**绝不重试**（C11 纪律） |
| 响应缺 token 字段 | terminal | `halt('PAT_SHAPE')` |

**代次隔离**：每次 `ensure()` 进入时记 `const gen = state.generation`；每个 `await` 之后若 `gen !== state.generation` 立即丢弃（返回旧 lease），保证 logout/重登录/replace 记录的迟到结果不会覆写 ref（C6「代次隔离拒绝迟到结果」）。

### 3.6 登录 flow 与命令侧「粘贴邮箱」

**flow 定义**：

```ts
ctx.authorization.registerFlow({
  key: LOGIN_RECORD_KEY,
  label: 'BigModel / GLM Coding Plan（ZCode 身份）',
  methods: [{ id: 'browser', label: '用浏览器登录 bigmodel.cn' }],
  run: (session) => loginFlow.run(session, { client, config, loopback, log }),
})
```

`run()` 的时序（每次尝试一个 `AbortController`，`session.signal` 与超时都接到它）：

```
state = randomUUID()
server = config.callbackServer ? await startCallbackServer({state, path:'/oauth/callback/bigmodel'}) : undefined
authorizeUrl = buildAuthorizeUrl({appId:'zcode', state, redirect: server?.redirectUri})
session.notify({ message: '在浏览器完成 BigModel 授权（回调地址会自动带 code；容器内请复制回调 URL）', url: authorizeUrl })
pasteAbort = new AbortController()
winner = await Promise.race([
  server?.result,                                        // {code, state} | {error}
  session.prompt({kind:'text', message:'粘贴浏览器地址栏的完整回调 URL', signal: pasteAbort.signal})
           .then(parseCallbackUrl),                      // 兼容 ?authCode= 与 ?code= 两种参数名
])
pasteAbort.abort() / server?.close()                     // 输者出局（只撤提问、不撤 flow）
jwt    = await client.exchangeAuthCode(code, session.signal)
ident  = config.organization && config.project ? {…} : await discoverIdentity(jwt)   // T0 决定实现
grant  = { v:1, jwt, organization, project, loginAt: now(), jwtExpiresAt: decodeJwtExp(jwt) }
await session.commit({ kind:'grant', payload: grant })    // ← 返回前必须完成（NOT_COMMITTED）
finally: server?.close()
```

**命令侧 driver（命令与 flow 的桥）**：

```ts
export interface LoginDriver {
  /** 开始一次尝试；已在进行则只回显现有 URL。返回给命令的文本携带 URL。 */
  begin(origin: string): Promise<{ status: 'started' | 'in-flight'; url?: string; text: string }>
  /** 把用户粘贴的回调 URL 喂给正在等待的 prompt；无等待者则报错。 */
  paste(text: string): { ok: true } | { ok: false; reason: 'no-attempt' | 'not-waiting' }
  current(): { inFlight: boolean; url?: string }
  abort(): Promise<void>
}
```

- 实现要点：driver 持有 `attempt = { controller, notices, pendingPaste?: {resolve, reject}, promise }`；`interaction.notify` 只把 notice 塞进 `notices`；`interaction.prompt` 把 `resolve/reject` 存进 `pendingPaste` 并**监听 prompt 自带 `signal`**（被撤时以 `PasteWithdrawnError` 拒绝，**不得**用 `AuthorizationDeclinedError`，否则会被误判为「人拒绝」→ `cancelled`）；`paste()` 解的是 `pendingPaste`，**原样传 URL 字符串**，解析在 flow 内做（state 校验只有 flow 有）。
- `begin()` **不 await 整个尝试**：拿「首个 notice 或 2s 超时」即返回文本，避免命令卡死；尝试本体继续跑，`promise` 上挂 `.catch` 只记日志。
- 生命周期：`loginAttemptTtlMs` 到点 `controller.abort()`；插件 dispose 时同样 abort。

### 3.7 命令面

| 调用 | 行为 | 成功回执（`CommandResult.text`） |
|---|---|---|
| `/zcode-plan` / `/zcode-plan status` | 渲染 §3.9 文本 | `{ kind: 'success', text }` |
| `/zcode-plan login` | `driver.begin()` | `已发起 BigModel 授权。\n授权链接：<url>\n完成浏览器授权后，把地址栏整条 URL 粘贴为：/zcode-plan login <url>` |
| `/zcode-plan login <url>` | `driver.paste(rawInput)` | `已收到回调，正在换发登录凭证…`（若 flow 已提交则 driver 等其 promise 后报「登录完成」） |
| `/zcode-plan logout` | abort 尝试 → `credentials.deleteRecord(LOGIN_RECORD_KEY)` → `credentials.unset(PAT_REF)` → `owner.dispose()` | `已退出登录并清除 ZCODE_PLAN_PAT；服务端 Key 未被删除` |
| `/zcode-plan route install` | H12 `installRoute()` | `已写入 llm-pi-ai.providers.zcode-plan（profile 层）；当前路由已注册` |
| `/zcode-plan route remove` | H12 `removeRoute()` | `已从 profile 层移除 zcode-plan 路由；回退路由 zai-coding-cn 不受影响` |
| `/zcode-plan refresh` | `owner.ensure()`（强制一次） | `已换发 PAT（与上一张不同：是/否）；有效期至 <本地时刻>`（**只报布尔比对与到期时刻，不报值**） |

文法解析放在 `commands.ts` 的纯函数 `parseZcodePlanInput(rawInput)` → `{kind:'status'|'login'|'logout'|'route'|'refresh'|'bad', …}`；未知子命令回 `{kind:'error', text: USAGE}`（文法常量与 usage 文案照 `plugins/user-commands/src/host/discovery.ts:45` 的 `COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/`（`zcode-plan` 合法）与 `inventory.ts:26` 的 `INVENTORY_USAGE` 风格）。

### 3.8 路由常量与 profile 层合并算法

```ts
/** 单一真源：bundle patch 不重复声明它（D-1）。 */
export const ZCODE_PLAN_ROUTE = {
  displayName: 'GLM Coding Plan (ZCode PAT)',
  apiKeyEnv: 'ZCODE_PLAN_PAT',
  api: 'openai-completions',
  baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
  reasoning: 'max',
  retryPolicy: {
    mode: 'normal',
    retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'INVALID_CREDENTIAL'],
  },
  models: [ /* 两条 glm-5.3 / glm-5.3-flash 条目，逐字搬 ~/.dsh/profiles/web/cordis.patch.yml:67-106 已实测可用的 shapes，去掉 headers */ ],
} as const
```

- **必须带 `models`**：非 catalog 路由需 `api` + `baseURL` + 非空 `models`（`$D/dsh-llm-pi-ai/README.zh.md:119`），且模型条目直接复用已被本机跑通的 `zai-coding-zcode` 条目（`~/.dsh/profiles/web/cordis.patch.yml:67-106`）。
- **零指纹头**（C3）：不写 `headers`。
- **`retryableCodes` 是整集覆盖**（`$D/dsh-llm/lib/index.js:266`）→ 必须把五个默认码一并重述，缺一个就等于削弱；只追一个 `INVALID_CREDENTIAL`（E6；`AUTH` 码在该版本不存在，见 D-8）。

**`installRoute()` 算法**（幂等、只动一键）：

```ts
const entry = configEditor.entries().find(e => e.options?.id === 'llm-pi-ai')
if (entry === undefined) return { ok:false, reason:'no-llm-pi-ai-row' }   // 罕见：被别的 bundle 改名
const snap = configEditor.configuration().find(s => s.entry === entry)
if (snap !== undefined && deepEqual((snap.override.providers ?? {})['zcode-plan'], ZCODE_PLAN_ROUTE))
  return { ok:true, changed:false }                                        // 幂等短路，不写盘
await configEditor.edit(entry, (current, inherited) => ({
  ...current,
  providers: {
    ...(inherited.providers ?? {}),        // 保留下层（bundle）提供的路由
    ...(current.providers ?? {}),          // profile 层已有的键优先
    'zcode-plan': ZCODE_PLAN_ROUTE,        // 只覆盖本键
  },
}))
// edit() 兑现即已 reconcile（dsh-config-editor/lib/types/index.d.ts:34 的 doc）
const registered = ctx.get('llm')?.listProviders().some(p => p.id === 'zcode-plan') ?? false
return { ok: registered, changed: true, registered }
```

- `remove()` 对称：复制 `current`，`delete providers['zcode-plan']`（`providers` 因此为空时保留空对象，**不**连带删除 `providers`——避免改动用户其它键的存在性）。
- **不碰 `agent-default-model`**（`~/.dsh/profiles/web/cordis.patch.yml:12-16`）：切默认路由是用户决策（C8/E7）。

### 3.9 status 文本（`renderStatus` 输出）

```
zcode-plan 状态（读数 <本地时刻>）
  登录：已登录 · JWT 到期 2026-12-01 09:00（剩 27d）        ／ 未登录（运行 /zcode-plan login）
  Key ：zcode-plan-bridge · scene=1 · id 3f9a1c2b…           ／ 未知（登录后自动 find-or-create）
  PAT ：有效 · 到期 14:32（剩 4h10m）· 下次续期 14:28        ／ 已过期 ／ 无 ／ 已停止（JWT_EXPIRED）
  路由：已注册（glm-5.3, glm-5.3-flash）                     ／ 已声明未注册 ／ 未安装（运行 /zcode-plan route install）
  用量：5h 窗口 3120 / 28000（11%，重置 18:00）· 周 18200 / 140000（13%，重置 周一 00:00）（读数 2 分钟前，服务端聚合延迟 1–2 分钟）
  备注：<halt 原因 / REF_CONFLICT / 无>
```

- 用量段读取 `quota/limit` 的 `limits[]` 两档：`unit===3`（5h 窗口）与 `unit===6`（周额度，如 140000）——两者都是套餐硬约束，缺一周额度读数会漏报「窗口有余、周额度已尽」的限流形态。

- `readRouteState`：`llm.listProviders()` 有 `zcode-plan` → 已注册；`llm.listConfigurableProviders()` 有 → 已声明未注册（这类「声明了但解析失败」正是 `$D/dsh-llm-pi-ai` 的 dormant 语义）。
- 用量读失败 → 该行降级为 `用量：读取失败（<码>），需登录态与 org/project`，其余行照常。
- **红线**：任何一行都不含 JWT/PAT/Key 明文；单测 X8 用真值当夹具断言 `text` 不含（D-12）。

### 3.10 错误码表（`errors.ts`）与脱敏

| code | 触发 | 对外文案要点 |
|---|---|---|
| `JWT_EXPIRED` | 管理面 401/403 | 「登录态已失效，请重新登录」 |
| `KEY_LOST` | 重查后仍 404 | 「桥接 Key 已不存在，请重新登录后重试」 |
| `PAT_SHAPE` | 换 PAT 响应无 token 字段 | 「换发响应不含 token（上游契约可能变更）」 |
| `BUSINESS:<code>` | envelope `code != 0` | 只带码与 `maskSecret(msg)` |
| `RISK_3012` | HTTP 405 + `3012` | 「触发风控，已停止自动续期，请稍后再试」 |
| `REF_CONFLICT` | `PAT_REF` 由非存储层供给 | 「ZCODE_PLAN_PAT 已由 <source> 提供，拒绝覆盖」 |
| `NO_LLM_PI_AI_ROW` | 找不到 `llm-pi-ai` 条目 | 「当前 profile 没有 llm-pi-ai 行，路由无法自动注册」 |
| `AUTH_STATE` | 回调 state 不匹配 | 「回调 state 不匹配，已拒绝本次授权」 |
| `TIMEOUT` | 15s / 尝试 TTL | 「请求超时」 |

`maskSecret(v)`：`v.length<=8 ? '***' : v.slice(0,4)+'…'+'<len>'`；**只有诊断路径用它**，正常路径根本不该拿到值。

### 3.11 包形状（`package.json` 关键段）

```jsonc
{
  "name": "dsh-plugin-zcode-plan",
  "version": "1.4.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "default": "./lib/index.js" } },
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "dsh": { "engines": { "dsh": ">=0.2.1-rc.2 <0.3.0" },
           "bundle": { "patch": "./cordis.patch.yml" } },
  "files": ["lib/**/*.js", "src", "cordis.patch.yml", "README.md"],
  "peerDependencies": { "@deepseek-ai/dsh": ">=0.2.1-rc.2 <0.3.0" },
  "scripts": { "build": "node build.mjs", "lint": "oxlint", "test": "vitest run",
               "typecheck": "tsc -b --pretty false",
               "verify:all": "pnpm lint && pnpm typecheck && pnpm build && pnpm test",
               "compose:check": "node scripts/compose-check.mjs", "prepack": "pnpm run build" }
}
```

---

## ④ 决策记录

> 每条：决策 / 被否方案 / 理由 / 反例（≥1 条落在具体代码或具体场景）。

### D-0 栈识别与 writer 豁免（主会话已判定，本文照录）

- **决策**：按 **pnpm workspace + TypeScript + esbuild + cordis 插件** 施工；**不加载任何 writer skill**（用户已豁免，仅本次有效）；产物形态与现有 5 个 host-only 插件逐项同构（单入口 esbuild、vitest、oxlint、tsc project references、`lib/` 随仓库提交）。
- **被否**：① 加载 `spring-writer`/`nuxt-writer`（无对应栈，仓内无 `pom.xml`/`build.gradle*`/`nuxt.config.*`）；② 用 multi-root 的 tsc+tsdown 双产物路线（本插件无 Web 半、无 `.d.ts` 对外面，纯 tsc 只用于类型检查更简单）。
- **理由**：§0 证据表逐条可复核；`plugins/user-commands/` 是与本插件同形（host-only、有命令面、无 client）的最近先例。
- **反例**：若照 multi-root 的 `tsdown` 路线，会多出 `lib/types/*.d.ts` 与 `exports` 多入口面，而本插件的消费者只有 dsh loader 一处（`main`），多出来的类型入口没有任何调用方，反而让 `files` 与发布体积翻倍。

### D-1 路由注册落 **profile 层**（`ctx.configEditor.edit()`），bundle patch 只插插件行

- **决策**：`cordis.patch.yml` 只 `insert` 本插件行；`llm-pi-ai.providers['zcode-plan']` 由 `/zcode-plan route install` 通过 `ctx.configEditor.edit()` 写入**当前 profile 的** `cordis.patch.yml`（只动本键、保留注释与 `!!js`、`edit()` 返回即已 reconcile）。
- **被否**：① **bundle 层 patch `llm-pi-ai` 的 config**（F1 字面机制）——实测被 profile 层整份替换（§②实验 2），在**本机真实 profile**（`~/.dsh/profiles/web/cordis.patch.yml:26,29` 自己配置了 `providers`）上必然静默失效；② **插第二行 `@deepseek-ai/dsh-llm-pi-ai` 只带自己的路由**——该行会为全部 catalog 提供方声明目录条目（`dsh-llm-pi-ai/lib/index.js:2841-2857`），必撞 `DUPLICATE_DIRECTORY`（`dsh-llm/lib/index.js:1935`）；③ **运行时 `ctx.llm.registerAdapter()` 自建适配器**——即 C1 已弃的「自建适配器」路线（`dsh-zcode-cli` 级协议代码）；④ **纯文档手动改**（F1 的降级路径）——保留为 README 里的等价手工样例与排障手段，不作主路径。
- **理由**：F1 的**用户决策是「自动注册」而非「手工抄 YAML」**；`configEditor` 是 dsh 自己写入 profile 层配置的官方通道（`dsh-config-editor/README.zh.md:33,41`），也是 settings 表单背后的同一写路径，天然幂等、保注释、原子。它把「写谁的路由」从「用户手抄」变成「插件代写」，与 F1 的意图一致，同时绕开 patch 层替换语义（§② 实验 2 的硬约束）。
- **反例**：若坚持 bundle 层声明路由，则用户在模型设置页把 `zcode-plan` 的 `apiKeyEnv` 改一下（settings 写 profile 层）→ 下一次启动 bundle 层声明被整份覆盖，路由直接消失且**无任何报错**；`--dump-config` 里也看不到「曾经声明过」的痕迹，排障成本极高。这正是实验 2 的 `bundle-route` 消失现象。

### D-2 不自建 LLM 适配器、不挂第二行 pi-ai（C1 的代码级落点）

- **决策**：模型请求继续由既有 `llm-pi-ai` 单行承载；本插件零协议代码，只产出一条路由配置 + 一个凭据引用。
- **被否**：① 自建 `LlmAdapter`（协议/流式/回放/图片全套）；② 第二行 `llm-pi-ai`；③ 插件内起本地反代重写 `Authorization`（A 线 T1 已否）。
- **理由**：①的代价是 `dsh-zcode-cli` 的 65KB 级协议代码并与 pi-ai 升级强耦合（C1 裁决）；②在代码层就不成立（`DUPLICATE_DIRECTORY`/`DUPLICATE_DISCOVERY`，见 §②）；③实验已证伪头部一切无关（`results.log` 五臂同价），反代纯增复杂度。
- **反例**：② 的具体撞点：第二行的 `settingsNs` 取行 id（`dsh-llm-pi-ai/lib/index.js:2864`），而 `registerModelDiscovery(settingsNs, …)` 对同 namespace 二次注册抛 `DUPLICATE_DISCOVERY`（`dsh-llm/lib/index.js:1980`）——即使目录条目侥幸不撞，这里也会让整个第二行加载失败，且失败发生在启动期（用户看到的是 profile 启动报错，不是路由缺失）。

### D-3 登录入口 = 注册 flow（保留 F2 结论）+ **命令驱动 `begin()`**（补齐 F2 的事实缺口）

- **决策**：`ctx.authorization.registerFlow()` 注册 flow（唯一凭证获取 seam），**同时**由 `/zcode-plan login` 调 `ctx.authorization.begin({key, interaction})` 驱动尝试；命令侧 `interaction` 用「notice 缓存 + 粘贴邮箱」实现，`notify` 的 URL 由命令回执带给用户。
- **被否**：① 只注册 flow、等某个界面发起（F2 的天真读法）；② 完全不注册 flow，命令里自跑 OAuth 后直接 `modifyRecord`；③ 自写 Web 设置卡（B 线取舍三已否）。
- **理由（事实缺口）**：DSH 0.2.1-rc.2 里 **`begin()` 的调用方只有 `deepseek-account-platform` 自己**（`$D/dsh-deepseek-account-platform/lib/index.js:854`）——它为自己那份 KEY 提供专用设置卡，并不做「列出全部 flow 供第三方发起」的通用面；全仓 `begin(` 只此一处。因此「任何界面都能发起」是 seam 的设计意图，**但不是本版本已交付的现成入口**（A7 假设在本版本为假）。保留 flow 注册（它是唯一被支持的凭证获取语义，且 `prompt.signal` 原生支持「回调 vs 粘贴」赛跑）+ 由命令做发起方，是同时满足 F2 的机制裁决与本版本事实的唯一组合。
- **反例**：若只注册 flow 不自驱，本机（web profile）**没有任何按钮能发起它**：设置页的「模型」分区只列出 `listConfigurableProviders()` 的目录与 pi-ai 自己的登录流（`dsh-llm-pi-ai/README.zh.md:95` 的对象是已安装提供方的登录），第三方 flow 在 UI 上不可见 → 用户会认为「插件装了但没法登录」。

### D-4 PAT 进引用、JWT 进记录（C2 + Q2）

- **决策**：`PAT → credentials.set(credentialRef('ZCODE_PLAN_PAT'))`；`JWT + org/proj + keyId → grant 记录 zcode-plan/bigmodel-login`。JWT 永不进 ref 空间，PAT 永不进记录。
- **被否**：① PAT 只留内存（官方红线原教旨）——消费者是 pi-ai（另一插件），跨插件唯一受支持通道是 seam（B 线取舍二）；② PAT 也写进 grant payload——记录是 `readRecord` 可读的明文 JSON，等于给同一机密造第二条泄露面且无收益；③ JWT 也发布成 ref（如 `ZCODE_PLAN_JWT`）——扩大机密面且无消费者。
- **理由**：Q2 已拍板接受落盘偏离并文档声明；单写路径（owner）保证 ref 与内存一致（`$D/dsh-credentials/README.zh.md:91` 的热轮换语义）。
- **反例**：若把 PAT 写进 grant payload，`/zcode-plan status` 或任何记录枚举（`listRecords()` 只回 `{key,kind}`，但 `readRecord` 回全量）就会让 PAT 进入更容易被日志/排障脚本 dump 的位置；而 ref 那一侧有「配置只携带引用」的纪律守着（`$D/dsh-credentials/README.zh.md:113`）。

### D-5 续期节奏贴官方 + Config 可调（F3），失败分类与代次隔离照官方容错表

- **决策**：默认 `lead = 120_000`、`jitter = [0, 60_000)`，两者进 Config；retryable 类失败复用旧 PAT + 5s 退避；terminal 类立刻 `halt`。
- **被否**：① B 线主张的 300s 提前量（F3 已裁定不用，E6 使竞态 401 可自愈）；② 指数退避/多轮重试（R2 风控纪律：不放大）；③ 服务端返回 401 时静默重建整链（会掩盖 JWT 过期，让用户以为「自动好了」）。
- **理由**：F3 定稿；官方契约（C6）；风控纪律（C11）。
- **反例**：若把 429 也做指数退避放大，个人低并发场景下一次配额抖动会变成 6 次管理面请求（1 次原始 + 5 次重试），正是 `405[3012]` 风险面；实验 README 明示「探路臂被拦就停，别反复重试」。

### D-6 网络在锁外、`modifyRecord` 内只写文件（E4 的实现边界）

- **决策**：换 PAT 的 HTTP 全程在 `modifyRecord` 之外；`modifyRecord` 的 mutate 函数内**零 await 网络**，只做「读 current → 合并 → 返回」。
- **被否**：把「过期则换发」写成 mutate 内的读-判断-换发（看起来最原子）。
- **理由**：`$D/dsh-atomic-write/README.zh.md:57` 明示「持锁方循环若包含一次网络往返…就应声明更长的值，否则该文件的其他写入方在这段时间内都会失败」；PAT 是唯一写者，本可放大 `waitMs`，但那会让**整份** `.credentials.yaml` 在 15s 超时窗口内对其他插件不可写。
- **反例**：mutate 内做 15s 网络 → 并发登录流 `session.commit()` 撞锁并在默认 2s 后失败（`$D/dsh-atomic-write/README.zh.md:85` 的 `waitMs` 默认两秒），表现是「登录成功但记录没写进去」，极难联想。

### D-7 插件卸载**不** `unset` PAT；只有 logout 清引用

- **决策**：`dispose()` 只清定时器与代次，不动 `ZCODE_PLAN_PAT`；`/zcode-plan logout` 才 `unset` + `deleteRecord`。
- **被否**：① 卸载时 `unset`（line-b 验收草图「禁用插件 → 引用解析为空」的口径）；② 卸载时 `deleteRecord`（更彻底，但会让用户重启 profile 后丢失 JWT，得重新扫码）。
- **理由**：`apply()` 是同步的、发布是异步的，卸载时清空会让**每次重启**都出现一个「PAT 尚未发布 → 首个请求 `MISSING_CREDENTIAL`」窗口；而「残留 PAT」的代价有界：PAT 效期 ≤ 18000s，且插件不在时它不会被续期，最迟 5h 后请求以 `INVALID_CREDENTIAL` 显式失败（**不是**静默全价，R2 的真正担心的劣化形态不成立）。
- **反例**：若卸载即 `unset`，`dsh plugin ... remove` 后立刻重启 profile（用户装新版本的标准动作）→ 插件重新 `apply()` 的前几十毫秒内若有会话自动发请求，会拿到一次 `MISSING_CREDENTIAL` 并可能被 `llm-retry` 当作终态（该码不在默认可重试集）→ 用户看到一次无谓失败。
- **代价**：line-b 的验收口径需改写（见 Q2）；容器的 `--dump-config`/`grep` 断言里「禁用插件后 ref 为空」不成立，改成「logout 后 ref 为空 + 到期后 401」。

### D-8 E6 落地：只追 `INVALID_CREDENTIAL`，并显式重述默认五码

- **决策**：路由 `retryPolicy.retryableCodes = [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT, INVALID_CREDENTIAL]`，`mode: 'normal'`（不设 `maxRetries`，取默认 5）。
- **被否**：① 照 E6 字面写的「AUTH/INVALID_CREDENTIAL」——`AUTH` 在该版本的码表里**不存在**（`$D/dsh-llm/lib/types/error.d.ts` 只有 `INVALID_CREDENTIAL`/`MISSING_CREDENTIAL`/`QUOTA`/`CONTEXT_WINDOW_EXCEEDED`/`EMPTY_RESPONSE` 等）；② 只写 `retryableCodes: ['INVALID_CREDENTIAL']`——那会把默认五码**整集替换**掉，退化成「只重试认证错」；③ `mode: 'always'`——会无限重试永久失败（`$D/dsh-llm-retry/README.zh.md`「always mode 会重试永久性失败」）。
- **理由**：`$D/dsh-llm/lib/index.js:266` 的 `.default([...DEFAULT_RETRYABLE_CODES])` 语义是「给了就整集替换」；把 `INVALID_CREDENTIAL` 纳入重试集在续期竞态下有自愈价值（重试期间 owner 可能已发布新 PAT）。
- **反例**：②的后果具体到本机：一次正常的上游限流（`RATE_LIMIT`）不再被重试，用户看到「以前会自动恢复的限流现在直接失败」——这是比 E6 想修的 401 更高频的回归。

### D-9 usage 头与 org/proj 来源

- **决策**：用量接口用**裸 `authorization: <JWT>` + 两个 `bigmodel-*` 头**；管理面用 `Authorization: Bearer <JWT>`；`organization`/`project` 来源优先级 = **Config > 登录后自动发现（T0 结论） > 报错并在 status 里点名**。
- **被否**：① 统一 `Bearer`（实测脚本两处不同，统一会 401）；② 把本机实测的 org/proj 值写进代码或默认值（账号私有、换账号即错、且违反「不把用户私有配置入库」）。
- **理由**：`test-pat.sh:15-17` vs `:28-30` 的实测差异；配置边界（A 线「仓库边界：插件仓库不含任何用户私有配置」）。
- **反例**：若把 org/proj 硬编码，第二个用户装本插件后所有管理面调用 403，且错误信息里不会指出「你的账号 id 不一样」。

### D-10 Key 命名与匹配：`zcode-plan-bridge` + `usageScene === 1` 双条件（C5）

- **决策**：`find-or-create` 匹配 `name === 'zcode-plan-bridge' && usageScene === 1`；命中即复用其 `apiKey` 段作为 `keyId`；未命中则创建 `{name, usageScene: 1}`；**永不删除/改写任何存量 Key**。
- **被否**：① 官方名 `zcode-api-key`（本机存量是 scene=3，复用即无折扣 —— `results.log` A 组 = 14）；② 只按名字匹配不校验 scene；③ 每次启动都新建（Key 列表膨胀）。
- **理由**：C5 + 实验 B③（任意 scene=1 Key 均享折扣，`test-verify.sh:26-27` 的 `arch-company` 也生效）→ 名字无关、scene 才是开关。
- **反例**：②的具体形态——`listKeys` 返回同一名字的 scene=3 旧 Key，插件拿它换 PAT，一切 200 OK、`status` 全绿、扣费 14/42k；这类静默劣化是 line-b R5 点名的最难排查故障。

### D-11 命令面承载全部用户动作（`login`/`logout`/`status`/`route`/`refresh`）

- **决策**：五个子命令一条 `CommandDefinition`（`name: 'zcode-plan'`），子命令在 `rawInput` 里解析。
- **被否**：① 拆成多条顶层命令（`zcode-plan-login` 等）——命令面拥挤、发现性差；② `input.hint` 之外再上 `select` 式交互——命令 handler 只有一次回执，没有多轮 UI（多轮只能靠 flow 的 `prompt`）。
- **理由**：仓内先例（`/tools`、`/workspace-folders`、`/mcp-reload`）都是「一条命令 + 子命令文法」；`CommandResult` 只支持一次性文本回执（`$D/dsh-commands/lib/types/index.d.ts:38-55`）。
- **反例**：若把 login 做成 `/zcode-plan-login` 且没有 `/zcode-plan status`，用户登录后没有任何地方能看到「PAT 到期 / 路由是否注册」，只能去读 `.credentials.yaml`（那正是我们要避免的）。

### D-12 机密红线：错误与日志只带码与步骤，不取值

- **决策**：`BridgeError` 只携带 `code` + 固定文案 + 可选 `maskSecret(msg)`；所有 `log.*` 的插值参数先过白名单（只允许 keyId 的前 8 位、时长、时长单位、状态码）。
- **被否**：① 「错误里带响应体片段方便排障」；② 把 `msg` 原样透出（服务端 `msg` 可能回显部分输入）。
- **理由**：C9；B 线引用的 `dsh-zcode-cli` 红线写法（失败路径只报哪一步失败）。
- **反例**：YAML/JSON 解析器自己的报错会带出错行的源码——在凭据文件里那行就是机密（`$D/dsh-credentials-local/README.zh.md`「诊断信息绝不引用值」一节的同款教训）。同类风险发生在「换 PAT 响应体进错误」时：响应体里就有新 PAT。

### D-13 测试口径：窄端口 + 假实现，不起真 Context（仓约定）

- **决策**：单测全部对着 §3.1 的端口与 fake（`FakeFetch` / `FakeClock` / `FakeCredentials`），覆盖 §3.4–§3.10；**真 seam 的验证下移到 T9 的真机断言**（文件内容、路由注册、扣费读数）。
- **被否**：① 在 vitest 里 `new Context()` 并挂 `dsh-credentials-local`（要拉起整棵 dsh 服务图，且 version pin 与宿主副本容易打架）；② 只做纯函数单测、跳过端口层（会漏掉「谁在什么时机写 ref」这类真问题）。
- **理由**：仓内 5 个插件无一在单测里起真 Context（`plugins/user-commands/test/inventory-command.test.ts:8-19` 是最典型的假端口写法）；`dsh plugin` 装载冒烟与 `--dump-config` 已经是仓库既定的「真环境」验证面（`plugins/multi-root-workspace/docs/reference/multi-root-workspace-research.md:195-199`）。
- **反例**：若在单测挂真 `dsh-credentials-local`，它会按 `path` 读写真实文件并做 0600 权限校验（该包启动即拒绝「他人可读」的文件）——在 CI/容器 umask 不同的机器上会变成随机红，而它验证的「set 之后 resolve 拿到新值」正是上游 README 明文承诺的行为，重复验证收益极低。

### D-14 插件不写 `agent-default-model`、不删任何 Key、不改他人路由

- **决策**：`route install` 只增/删 `providers['zcode-plan']` 一键；`agent-default-model` 与其它 provider 键一律不碰；服务端只 find-or-create 自己名字的 Key。
- **被否**：① install 时顺手把默认模型切到 `zcode-plan`（「开箱即用」）；② 发现同名 scene=3 旧 Key 时自动删除「清理」。
- **理由**：C8（只观测不改用户路由）+ E7（切默认是迁移指南里用户的动作）+ R10（永不触碰存量 Key）。
- **反例**：①若自动切默认，折扣消失时（R1）**所有会话**都走一条可能已无折扣的路由，用户毫无感知地烧 credits；②删 Key 是不可逆破坏性操作，且 `zai-coding-zcode` 当时正用同一把 Key（`~/.dsh/profiles/web/cordis.patch.yml:47` 的 `apiKeyEnv: ZAI_CODING_CN_API_KEY`）——删掉会连带打断旧路由，正好毁掉回退路径。

---

## ⑤ 逐任务组实现要点

> **组间串行、组内可并行**；每组有可执行出口（命令或断言），不写「已实现 / 工作正常」。
> 分组与 `diff-matrix` §八定稿及双线任务拆分一一对齐：T0 spike / T1 脚手架 / T2 bigmodel 客户端 / T3 凭据状态机+PAT owner / T4 credentials+authorization 集成 / T5 登录 flow / T6 路由 bundle patch + 合并语义实测 / T7 可观测与 status / T8 文档+迁移指南 / T9 端到端验收。

### T0 — 探路 spike（4 项 + OpenSpec 提案；串行前置，阻塞 T5/T3 的字段细节）

- **文件**：无源码改动；脚本/证据放 `openspec/changes/zcode-plan-bridge/artifacts/`（证据文件随档提交，不做 gitignore——review 已定，保持排障可追溯）。
- **要点**（每项一行结论 + 命令 + 观察片段）：
  1. **org/project 发现**：拿一份有效 JWT 试 `GET https://bigmodel.cn/api/biz/v1/customerInfo`（及 `/api/biz/v1/organizations` 备选），确认能否程序化拿到默认 org/project；不行则判定「Config 必填」。
  2. **`tokenByAuthCode` 契约**：用一次性 authCode 打 `POST https://bigmodel.cn/api/auth/tokenByAuthCode`，钉死 body 字段名（`authCode`/`code`？`appId`？`state` 是否回传）、响应里 JWT 的字段名、JWT payload 的 `exp`。
  3. **authorize 端点对 loopback 的校验**：构造 `redirect=http://127.0.0.1:<port>/oauth/callback/bigmodel` 的授权 URL 在浏览器点一次，确认放行（RFC 8252 豁免在本服务端是否实现）。
  4. **同 Key 并发两 PAT 是否互斥**：连发两次 `access_tokens`，用第一张发一次模型请求看是否 401。
  5. **OpenSpec 提案**：`openspec-propose` 生成 `proposal.md`/`design.md`/`tasks.md`/`specs/dsh-zcode-plan/spec.md`（本 ⑤ 即 tasks 骨架）。
- **出口**：`artifacts/spike-bigmodel.md` 里 5 节，每节「命令 + 输出片段 + 结论（钉死/降级）」；其中 2/3 若红，T5 改走「只粘贴、不起回调服务器」并把 Q5 升级为用户决策。

### T1 — 脚手架（1 项）

- **文件**：`package.json`、`cordis.patch.yml`、`build.mjs`、`tsconfig*.json`、`vitest.config.ts`、`.gitignore`、`src/index.ts`、`src/host/index.ts`（空 `apply`）。
- **要点**：`name/inject/Config/apply` 四个导出先落地（`apply` 只 `ctx.logger.info('zcode-plan: loaded')`）；`Config` 全默认值；`cordis.patch.yml` 只有 insert 行。
- **出口**：
  1. `pnpm --filter dsh-plugin-zcode-plan verify:all` 全绿（lint/typecheck/build/test）；
  2. `node -e "const p=require('./plugins/zcode-plan/package.json');if(p.dsh.engines.dsh!=='>=0.2.1-rc.2 <0.3.0')process.exit(1)"` → exit 0；
  3. `pnpm dsh:check` → `[dsh:check] … agree`（新插件被 `listPlugins()` 自动纳入 soft 断言）；
  4. `docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/zcode-plan` 后 `docker exec dsh dsh --profile web --dump-config | grep -c "id: zcode-plan"` → `1`，且启动日志出现 `zcode-plan: loaded`。

### T2 — bigmodel 客户端（3 项并行：endpoints/envelope+client / 测试）

- **文件**：H3、H4、H5、H6；`test/envelope.test.ts`、`test/client.test.ts`。
- **要点**：§3.4 表格逐行实现（方法/路径/头/体/解析）；15s 超时；三级效期兜底；所有失败走 §3.10 码表；`client` 无状态、`fetch`/`clock` 注入。
- **出口**：
  1. `pnpm --filter dsh-plugin-zcode-plan test -- envelope client` 全绿；
  2. 三条关键断言可指出：`expect(cap.code).toBe('TIMEOUT')`（假 clock 推进 15s）、`expect(err.message).not.toContain(jwtFixture)`、`issuePat` 三分支（`expiresAt` / `expiresIn` / 缺省 18000s）各一条；
  3. `grep -c "https://" plugins/zcode-plan/src/host/bigmodel/client.ts` → `0`（URL 只在 `endpoints.ts`）。

### T3 — 凭据状态机 + PAT owner（3 项并行：record/key-manager / pat-owner / 两组测试）

- **文件**：H9、H10、H11；`test/credential-record.test.ts`、`test/key-manager.test.ts`、`test/pat-owner.test.ts`。
- **要点**：§3.5 状态机与续期公式；失败分类表逐行；代次隔离；单飞；`set` 是唯一发布路径；**网络在 mutate 之外**。
- **出口**：
  1. `pnpm --filter dsh-plugin-zcode-plan test -- pat-owner key-manager credential-record` 全绿；
  2. fake timers 断言可指出：`vi.advanceTimersByTime(leadMs-1)` 不触发、`+jitterMin` 触发；「429 → 旧 PAT 仍在 `current()` 且 `set` 未被调用」；「logout 后 resolve 的旧 pending 不写 ref（`set` 调用次数不变）」；
  3. `grep -n "fetch(" plugins/zcode-plan/src/host/credential-record.ts` → 无输出（mutate 内无网络的结构性证据）。

### T4 — credentials / authorization 集成（2 项并行：flow 注册 + 启动恢复 / 集成测试）

- **文件**：H2（`apply` 主体）、H7 的 flow 定义、`test/login-flow.test.ts`（部分）。
- **要点**：`ctx.inject(['credentials','authorization'], …)` 内 `registerFlow`（dispose 时反注册）；`credentials/record-updated` 监听本 key → 重建 owner（重新登录即生效）；启动若有记录 → `keyManager.ensureKey()` → `owner.ensure()` → 发布；`PAT_REF` 冲突检测（§3.3）；`credentials` 缺席时零注册零报错（照 `user-commands` 的软依赖姿态）。
- **出口**：
  1. 单测：无 `credentials` 服务时 `apply` 不抛且无注册（`expect(registerFlow).not.toHaveBeenCalled()`）；
  2. 单测：`record-updated`（本 key）触发 owner 重建，他 key 不触发；
  3. 单测：`describe` 返回 `{configured:true, source:'env'}` → `REF_CONFLICT`，`set` 未被调用；
  4. 真机：装上插件、`docker exec dsh sh -lc 'grep -cE "^  ZCODE_PLAN_PAT:" ~/.dsh/.credentials.yaml'` → 登录后 `1`（登录前 `0`）。

### T5 — 登录 flow（3 项并行：loopback / flow run / 命令 driver）

- **文件**：H8、H7、`test/login-flow.test.ts`（全量）、`test/commands.test.ts`（login 部分）。
- **要点**：§3.6 时序；state 校验；回调与粘贴赛跑（`prompt.signal` 只撤提问）；`session.commit` 在 `run()` 返回前；`finally` 关服务器；driver 的首个 notice 竞速（2s）；paste 邮箱；TTL abort；`AuthorizationDeclinedError` 与「撤回」严格区分。
- **出口**：
  1. `pnpm … test -- login-flow commands` 全绿；
  2. 断言可指出：`expect(server.closed).toBe(true)`（两个分支各一次）、`expect(commitSpy).toHaveBeenCalledBefore(runResolved)`、`expect(pasteReject).not.toBeInstanceOf(AuthorizationDeclinedError)`；
  3. 真机手测：`/zcode-plan login` 打印 URL → 浏览器授权 → 粘贴整条 URL → `/zcode-plan status` 显示「已登录」。

### T6 — 路由注册 + 合并语义实测（2 项：`route-config` 实现 / `compose-check` 脚本）

- **文件**：H12、`scripts/compose-check.mjs`、`test/route-config.test.ts`。
- **脚本形态**：`mkdtemp` 建隔离 `$DSH_HOME`；profile 的 `package.json` 写 `dsh.profile.bundles = ['@deepseek-ai/dsh-base','dsh-plugin-zcode-plan']`，`node_modules/` 里 `symlink` 本插件目录（也可把 `insert` 的 name 写成绝对路径，`dsh-app-boot/README.zh.md:65` 允许）；每个用例后清理临时目录；断言失败时打印 `--dump-config` 的 `llm-pi-ai` 片段（不含任何凭据，安全）。
- **要点**：§3.8 的合并算法与幂等短路；三例离线断言。
- **出口**（`pnpm --filter dsh-plugin-zcode-plan compose:check`，逐例断言，任一不符即非零退出）：
  - **E1**：临时 profile（`bundles: ['@deepseek-ai/dsh-base','dsh-plugin-zcode-plan']`，`cordis.patch.yml: []`）→ `--dump-config` 内 `grep -c 'id: zcode-plan'` = 1（插件行存在）；
  - **E2**：同一临时 profile 再加一条**合成用户层**（`- id: llm-pi-ai` + 任意 `providers.user-route`）→ 断言 dump 里**没有** `zcode-plan` 路由键（**这是对 DSH「整份替换」语义的回归哨兵**：当前期望是「无」；若上游某版本改成深合，`zcode-plan` 会出现在 dump 里、本条断言转红，提醒我们回看 D-1）；
  - **E3**：把 `ZCODE_PLAN_ROUTE` 序列化后作为用户层注入 → dump 里 `providers.zcode-plan` 完整（`api`/`baseURL`/`models` 两条/`retryPolicy.retryableCodes` 六项）→ 再 `dsh --profile <tmp> --dump-config-schema` 不报错（schema 能加载该路由；该命令会 import 插件模块，因此脚本前置 `pnpm --filter dsh-plugin-zcode-plan build`）。
  - 真机侧（人工一次）：`/zcode-plan route install` 后 `docker exec dsh dsh --profile web --dump-config | sed -n '/id: llm-pi-ai/,/^# ==/p' | grep -c 'zcode-plan:'` → `1`，且 `zai`/`opencode-go`/`zai-coding-cn` 三个键仍在（`grep -c` 各 1）。

### T7 — 可观测与 status（2 项：日志事件 / status 渲染）

- **文件**：H13、`test/status.test.ts`、H2 内的日志点。
- **要点**：§3.9 文本；固定事件名（对齐官方词汇）：`pat_issued` / `pat_refresh_deferred` / `pat_refresh_failed` / `key_created` / `key_reused` / `login_committed` / `route_registered` / `halted`；日志只带 code、时长、masked keyId。
- **出口**：
  1. `test/status.test.ts` 断言：五段齐全；`expect(text).not.toContain(jwtFixture)`、`expect(text).not.toContain(patFixture)`；用量失败降级文案；
  2. 真机：`/zcode-plan status` 输出五段（登录/Key/PAT/路由/用量），用量段与 bigmodel 用量页人工对账一致（差值 0）；
  3. 日志抽查：`docker exec dsh sh -lc 'grep -c "zcode-plan" <profile 日志路径>'` 有事件行，`grep -E "<PAT 前 8 位>"` 无命中（用当次 PAT 前 8 位做反向断言，断言的是「没出现」）。

### T8 — 文档 + 迁移指南（3 项并行：README / 迁移 / 仓根两处）

- **文件**：`plugins/zcode-plan/README.md`、`plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md`、根 `README.md:75-79` + `:32`、根 `AGENTS.md:20-26` + `:37`。
- **要点**：
  - README：原理一句（凭证属性折扣，非指纹）、安装（`dsh plugin add …&path:plugins/zcode-plan`）、三步上线（`route install` → `login` → `agent-default-model` 切 `zcode-plan`）、**回退**（切回 `zai-coding-cn` + `route remove`）、安全模型差异声明（PAT 落盘偏离官方「仅内存」红线）、**PAT 卸载不清引用**（D-7）与「禁用插件后最多 5h 残留」、headless 不可用（E1）、单 owner 多 profile 消费（E2）、折扣复测口径（复用 `zcode-rate-test` 的 `bodies/o1.json` + `quota/limit` 差值法）。
  - 迁移指南（不含仓库外执行）：① 确认 `agent-default-model` 当前指向（本机事实：已是 `zai-coding-cn`，见 `~/.dsh/profiles/web/cordis.patch.yml:14`，E7 的「先切默认」在本机已满足，仍需核对）；② 安装插件 + `route install` + `login`；③ 切换默认到 `zcode-plan` 并验证一次请求；④ 删除 profile patch 里 `:46` 起的 `zai-coding-zcode` 块；⑤ 回退步骤与「删了也能重建」的手工片段（F1 降级文档）。
- **出口**：`grep -c "zcode-plan" README.md AGENTS.md` 各 ≥1；README 内两条兜底命令可复制执行（`route remove` / 手工 YAML 片段）；`pnpm docs:check` 不回归（该脚本目前只有 multi-root 实现，新插件不挂）。

### T9 — 端到端验收（真账号，消耗少量 credits）

- **文件**：`plugins/zcode-plan/docs/acceptance.md`（步骤 + 读数表格，供复测）+ 运行产物留档。
- **要点与出口**（逐条命令/断言）：
  1. **登录链**：`/zcode-plan login` → 浏览器 → 粘贴 → `/zcode-plan status` 显示「已登录」；`docker exec dsh sh -lc 'grep -cE "^  zcode-plan/bigmodel-login:" ~/.dsh/.credentials.yaml'` → `1`。
  2. **Key 链**：控制台/`listKeys` 断言 `name === 'zcode-plan-bridge' && usageScene === 1`；**同时断言存量 `zcode-api-key` 的 `usageScene` 仍为 3**（未被改动）。
  3. **路由链**：`--dump-config` 断言（T6 真机侧）；`/zcode-plan status` 的「路由：已注册」。
  4. **折扣链**：复用前序方法（`gen.mjs` 生成互异等长体 + `test-pat.sh:22-27` 的窗口重置安全检查），手工发同款 42k 请求（`bodies/o1.json`）到 `zcode-plan` 路由，读数口径 = `quota/limit` 的 `unit===3` 差值；判定：PAT 路由 **3–6**、对照 `zai-coding-cn` 普通 Key **14–15**（`results.log` 基线）。
  5. **轮换链**：`/zcode-plan refresh` → 回执「与上一张不同：是」→ 立刻发一次模型请求成功（证明 ref 热轮换对下一次请求生效，R11）；fake timers 单测另覆盖时序。
  6. **回退链**：`agent-default-model` 切回 `zai-coding-cn` → 请求成功且扣费回到 14–15 量级；`/zcode-plan route remove` → `--dump-config` 无 `zcode-plan` 键；`/zcode-plan logout` → `grep -cE "^  ZCODE_PLAN_PAT:" ~/.dsh/.credentials.yaml` → `0`，此时若强行用该路由 → 请求以 `MISSING_CREDENTIAL` 失败（**不是**用旧值静默成功）。
  7. **仓库门禁**：`pnpm verify`（递归）+ `pnpm dsh:check` 全绿；`pnpm --filter dsh-plugin-zcode-plan compose:check` 三例 E1/E2/E3 符合预期。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（若被证伪，回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | `tokenByAuthCode` 可换出登录 JWT，且该 JWT 能同时用于列/建 Key、换 PAT、读用量 | 前序实测的 JWT 同款用法（`test-pat.sh:15-16`、`test-b.sh:9-11,14-16`）+ 官方 auth-login.md（line-a/b 已引） | T0 若红 → 退回「用户粘贴浏览器里抓到的 JWT」（B 线 R8 的备案），flow 只需一次粘贴，T5 缩水 |
| A2 | 登录 JWT 效期 ≥ 数周 | dsh-zcode-cli 长期持久化 JWT 的旁证（line-a A3） | JWT 短效 → status 必须给出「距到期 N 天」并在临期前提示重登（D-5 的 halt 分支已有位置） |
| A3 | `redirect=http://127.0.0.1:<任意端口>/oauth/callback/bigmodel` 被服务端放行 | 官方 CLI 即此方案（RFC 8252） | T0 若红 → `callbackServer: false` 成为默认，只用粘贴（Q5） |
| A4 | `apiKeyEnv` 按请求解析、存储值优先、`set` 后下一次请求即用新值 | `$D/dsh-llm-pi-ai/README.zh.md:38` + `$D/dsh-credentials/README.zh.md:12,91,95` | 若退化成启动快照 → PAT 轮换需重启，D-7 的「残留 PAT」窗口从 5h 变成「永久有效值」，必须改回「卸载即 unset」 |
| A5 | `ctx.configEditor` 在任何带 profile 的宿主里可用（base 已挂载） | 本轮隔离 `$DSH_HOME` 的 `--dump-config` 实测：合成树第 60 行为 `- id: config-editor` | 缺席 → `route install` 降级为「打印手工片段」（F1 的文档兜底），status 报 `NO_LLM_PI_AI_ROW` 同级原因 |
| A6 | `ctx.llm.listProviders()` 可反映 `zcode-plan` 是否真的注册上 | `$D/dsh-llm/lib/types/index.d.ts:281` | 若只反映 adapter 不反映 route → status 的「路由：已注册」改用 `listConfigurableProviders()`（已声明）作为判据，并在文案里降级为「已声明」 |
| A7 | 一次管理面请求 ~ 数百毫秒，`setTimeout` 精度足够（分钟级调度） | 续期提前量是 120s 量级 | 若容器被暂停/休眠导致定时器漂移 → 下次 `ensure()` 前先按 `expiresAt - now` 重算一次（已写在公式里），无需额外机制 |
| A8 | 同一 Key 可持有多张有效 PAT（多实例共存） | 未测（line-b A5） | T0 ④ 若证互斥 → README 锁「单实例」并在 status 提示「其他实例可能互踢」 |
| A9 | 用量接口对「登录 JWT + org/proj 头」持续可用 | 前序打通（`test-pat.sh:28-30`） | 若加签名/风控 → status 删用量行，余量靠控制台 |
| A10 | 存量 `zcode-api-key` 不会被本插件路径改名/删除 | D-10/D-14 的「只创建自己名字空间」纪律 | 若服务端在建同名 Key 时返回既有 scene=3 那把 → find-or-create 必须**只按 scene 判定**并报 `BUSINESS:<code>`（不得「反正建不了就用它」） |

### 6.2 未决项（不阻塞本蓝图，实施期消解）

- **U1** `tokenByAuthCode` 的请求/响应字段名（T0 ②）——`exchangeAuthCode` 的 body 形状在 `endpoints.ts` 一处，改起来是单点。
- **U2** PAT 响应的效期字段名（`expiresAt` / `expiresIn` / `ttl`）——§3.4 三级兜底已吸收；T0 只需记录实测名以便收敛成单分支。
- **U3** org/project 自动发现端点（T0 ①）——失败即 Config 必填，代码路径已备（§3.2）。
- **U4** `404` 的语义在「Key 被删」与「JWT 无权限」之间可能混叠——T3 把它当「作废重查一轮」再判 terminal，实测后可再细分。
- **U5** `compose-check` 里 E3 需要把 TS 常量序列化成 YAML：若 Node 的类型剥离在 CI 上不可用（本仓 volta 固定 `24.21.0`，默认可剥离），退化为「`route-config.ts` 旁边放一份 `route.json`，测试断言两者深等」。
- **U6** `route install` 与 settings 表单的并发写：`edit()` 内部串行（`dsh-config-editor/README.zh.md:41`「与其他 profile 操作共同锁定 profile manifest」），但用户同时在模型页保存时可能看到一次 reload；实施时在回执里加一句「若设置页同时保存，以其为准」。

---

## 待决问题（六字段之外）

### Q1（P1，阻塞 T6 的施工形态）路由注册落在 profile 层（插件代写）还是只留 bundle patch

- **问题**：F1 定的是「bundle patch 自动注册」，但实测证明 bundle 层对 `llm-pi-ai` 的 `config` 会被用户 profile 层整份替换（§②实验 2），在本机真实 profile 上必然静默失效。要么承认 F1 的机制落点需要修正，要么接受「本机必须手工改 profile patch」。
- **选项**：
  - **A（推荐）** `route install` 通过 `ctx.configEditor.edit()` 把路由写进**当前 profile 的 patch**（只动 `providers['zcode-plan']` 一键、保注释、幂等、`edit()` 返回即生效）；bundle patch 只插插件行。F1 的「自动注册」意图保留，机制换到 profile 层。
  - B 维持 F1 字面：bundle patch 声明路由，用户 profile 若覆盖了 `llm-pi-ai` 就按 README 手工补一段（= F1 的降级路径）。
  - C 两条都做：bundle patch 声明一份「干净 profile 可用」的默认路由 + `route install` 覆盖 profile 层场景。
- **推荐**：**A**（C 也可，但会引入两份路由真源，见 U5 的漂移风险）。
- **影响面**：T6 的出口形态、README 的三步上线流程、`route remove` 是否存在；不影响 T2/T3/T5。

### Q2（P1，改验收口径）插件卸载时是否清空 `ZCODE_PLAN_PAT`

- **问题**：line-b 的验收草图写「禁用插件 → 凭据引用解析为空 → `MISSING_CREDENTIAL`」；D-7 判定「不 unset」以避免每次重启的首请求窗口。
- **选项**：
  - **A（推荐）** 不 unset（D-7）：卸载后最多残留一张 ≤5h 的 PAT，到期后请求以 `INVALID_CREDENTIAL` 显式失败；`/zcode-plan logout` 才清。
  - B 卸载即 `unset`：验收口径保持 line-b 原文，但每次重启多一个 `MISSING_CREDENTIAL` 窗口。
  - C 卸载时按「记录是否也在」决定：记录在 → 不 unset（会被重启重建）；记录不在 → unset。
- **推荐**：**A**；C 其实等价于 A（记录在才可能续期）。
- **影响面**：T9 第 6 条验收文案、README 安全段一句、`apply()` 的 dispose 分支三行。

### Q3（P2，可能恢复 F6 想修的 401 自愈）是否用 `session/event` 观察 `llm/retry` 触发刷新

- **问题**：F6 的事实裁定是「插件看不到模型 401」，缓解只有 E6。但 `session/event` 是 ctx 公开事件（`$D/dsh-session/lib/types/index.d.ts:61`），`llm/retry` 事件载荷含 `provider` 与 `failure: LlmFailure`（`$D/dsh-llm-retry/lib/types/types.d.ts:7,23,33`）——**在 E6 把 `INVALID_CREDENTIAL` 纳入可重试集之后**，一次认证失败会先落一条 `llm/retry` 事件，插件完全可据此对 `provider === 'zcode-plan'` 触发一次 `owner.ensure()`。
- **选项**：
  - **A（推荐，MVP）** 不做：E6 已定，MVP 只靠「续期提前量 + 重试」，少一个跨会话监听面（监听要过滤 provider、限流、避免与 owner 自己的定时器打架）。
  - B 做：`ctx.on('session/event', …)` 过滤 `llm/retry` + `provider==='zcode-plan'` + `failure.code==='INVALID_CREDENTIAL'` → 触发一次单飞 `ensure()`（不新增写路径），并加去抖（同一 provider 60s 内最多一次）。
  - C 只在 `pat-owner` 的 halt 分支上做通知，不做自动刷新。
- **推荐**：**A**（B 是明确可行的增强，但它**修正了 F6 的事实前提**，属于收敛结论的事实更新，需用户点头；实现成本约 30 行 + 2 条测试）。
- **影响面**：选 B 则 `pat-owner` 加一个 `nudge()` 入口、`index.ts` 加一个监听、R4 的缓解从「概率自愈」变成「确定性自愈（有 60s 去抖）」。

### Q4（P2，影响 T0 的降级路径）org/project 若无法程序化发现，接受 Config 手填吗

- **问题**：T0 ① 未证；若没有 `customerInfo` 类接口，用户必须知道自己的 `org-…`/`proj_…` 才能用（这两个 id 在控制台/用量页 URL 里可见）。
- **选项**：
  - **A（推荐）** 接受：`Config.organization`/`Config.project` 必填，`status` 在缺失时点名并给出取值路径（控制台 URL 片段）。
  - B 从登录后跳转页面/文档里正则抽取（依赖页面结构，脆弱）。
  - C 先要求用户跑一次前序实验脚本导出 id（体验差）。
- **推荐**：**A**。
- **影响面**：README 安装步骤多一句；`status` 多一条「缺 org/project」。

### Q5（P2，影响 T5 复杂度）回调服务器是否保留

- **问题**：本仓库 dsh 跑在容器、浏览器在宿主桌面，`127.0.0.1` 回调天然不通（R8），粘贴才是事实主路径；回调服务器只服务「同机调试」。
- **选项**：
  - **A（推荐）** 保留但默认开、`Config.callbackServer` 可关；两条路径同一 flow（`prompt.signal` 赛跑），成本一次性。
  - B MVP 只做粘贴，回调留 phase 2（少 ~120 行 + 一组测试）。
- **推荐**：**A**（F2 已把 paste 定为第一公民、回调作加分项，代码上两者共用同一条 `Promise.race`，删回调等于删一半测试面）。
- **影响面**：T5 工作量 ±0.5 人日；`callbackServer` 键是否进 Config。

### Q6（P3，影响 T8 的迁移步骤顺序）E7 的「先切默认路由」在本机是否还必要

- **问题**：E7 假定 `agent-default-model` 指向 `zai-coding-zcode`；本机实测其指向是 `zai-coding-cn`（`~/.dsh/profiles/web/cordis.patch.yml:14`），因此「先切默认再删旧路由」在本机不是必需步骤。
- **选项**：
  - **A（推荐）** 迁移指南写成「先核对再决定」：`grep -A3 'id: agent-default-model' ~/.dsh/profiles/web/cordis.patch.yml`，若指向 `zai-coding-zcode` 才先切；否则直接进下一步。
  - B 照 E7 无条件写「先切默认」——在本机会让用户多做一步且看不出意义。
- **推荐**：**A**（把事实核对写成迁移指南的第一步命令，而不是假设）。
- **影响面**：T8 迁移指南第一步；不影响代码。

---

## 附：验证映射总表（每条对应一个可执行命令或一条可断言事实）

| 需求/结论 | 验证载体 | 具体命令或断言 |
|---|---|---|
| C2 路由按请求解析 PAT、热轮换 | X4 + T9-5 | `expect(setSpy).toHaveBeenCalledTimes(2)`；`/zcode-plan refresh` 回执「与上一张不同：是」后立刻一次请求 200 |
| C5 name+scene 双条件、存量 scene=3 不误用 | X3 夹具 + T9-2 | 夹具 `{name:'zcode-plan-bridge',usageScene:3}` → `createKey` 被调用；`{…,usageScene:1}` → 复用且不建 |
| C6 续期节奏与容错 | X4 | `advanceTimersByTime(leadMs - 1)` 不触发；429 → `set` 未调用且 `current()` 保留旧值；halt 后不再排期 |
| C6 代次隔离 | X4 | logout 后 resolve 的 pending → `set.mock.calls.length` 不变 |
| C9 机密脱敏 | X8 + T7-3 | `expect(statusText).not.toContain(patFixture)`；日志里 `grep -c "<PAT 前 8 位>"` = 0 |
| D-1 profile 层注册且不吞别人的路由 | T6 compose:check E3 + 真机 | dump 断言 `zai`/`opencode-go`/`zai-coding-cn`/`zcode-plan` 四键各 1 |
| D-1 合并语义回归哨兵 | T6 compose:check E2 | 合成用户层覆盖后 dump 无 `zcode-plan`（当前 DSH 行为），行为变化即脚本变红 |
| F2 flow 是唯一凭证获取语义 | X5 + `authorization.list()` | `expect(ctx.authorization.list().map(e=>e.key)).toContain(LOGIN_RECORD_KEY)`；`registerFlow` 的 disposer 被 dispose 调用 |
| F3 提前量可调 | X4 + Config schema | `Config({refreshLeadMs: 300000}).refreshLeadMs === 300000`；排期按新值 |
| E6 认证错可重试且默认五码不减 | T6 compose:check E3 + X7 | 断言 `retryPolicy.retryableCodes.length === 6` 且含五个默认码 + `INVALID_CREDENTIAL` |
| E1 headless 不可用（非目标） | T8 README | README「已知限制」段一句；无代码断言 |
| F1 降级文档存在 | T8 | README 内可复制的 `- id: llm-pi-ai` 手工片段 + `route remove` 两条命令 |
| R11 轮换对下一请求生效 | T9-5 | 见上；另有 A4 假设兜底（若证伪则回到 D-7 复议） |
| 仓库门禁不回归 | T9-7 | `pnpm verify` + `pnpm dsh:check` 全绿；`compose:check` 三例符合预期 |

---

*本文件只写代码级蓝图；未修改仓库任何文件、未改 `openspec/`、未做 git 操作、未读取或等待其他子代理。*
