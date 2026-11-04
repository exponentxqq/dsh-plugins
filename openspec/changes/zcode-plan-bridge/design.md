# Design

> 本文档承载阶段 1.7 代码级蓝图（`code-design.md`，随本变更目录落档为权威副本）的深度契约六字段；
> 细节（全部 file:line 证据锚、完整接口签名、逐任务实现要点）以该副本为准，本文承载结构与关键断言。

## Context

前序实测（`/home/docker/.cache/zcode-rate-test/`）已锁定折扣开关 =「`usageScene:1` Key + `clientType:"zcode"` 换发 PAT」组合（42k 请求 3-4 vs 基线 14-15 credits），指纹/UA/端点全部无关。动机见 proposal.md - Why。

设计受两条本轮实测的硬事实约束：

1. **DSH patch 层对同 id 条目的 config 是整份替换、非深合并**（隔离 `$DSH_HOME` 双实验复现：bundle 层给 `llm-pi-ai` 追加的路由，在用户 profile 层同 id 配置了 `providers` 后完全消失）——本机 web profile 正是此形态，bundle 层声明路由必然静默失效；也不可插第二行 `llm-pi-ai`（`DUPLICATE_DIRECTORY`/`DUPLICATE_DISCOVERY`，目录条目与发现注册均按行 id 冲突）。
2. **authorization flow 在 0.2.1-rc.2 无第三方发起面**（全仓 `authorization.begin(` 仅 deepseek-account-platform 自己的设置卡一个调用方）——「任何界面都能发起」是 seam 设计意图而非已交付入口。

**栈识别结论（spec-plan 阶段 1.7 判定）**：目标栈 = pnpm workspace + TypeScript + esbuild + cordis/dsh 插件（证据：无 `pom.xml`/`build.gradle*`/`nuxt.config.*`；`pnpm-workspace.yaml:5-6`、`plugins/user-commands/src/host/index.ts:41,51,174` 的 name/inject/apply 装配面、`build.mjs:30-38` esbuild 单入口）。聚合层无匹配 writer skill，**用户已豁免本次 writer 加载（仅本次有效）**，本设计未加载任何 writer skill。

## Goals / Non-Goals

**Goals:**

- host-only 单插件 `dsh-plugin-zcode-plan` 零协议代码接入折扣凭证链（15 源文件 + 7 构建文件 + 10 测试文件，全部新建）
- 机密面最小化：JWT 只进插件 record、PAT 只进 `ZCODE_PLAN_PAT` 引用、Key Secret 不落盘
- 对既有五插件与用户 profile 的其余内容零侵扰（`route install` 只动一键、保注释）

**Non-Goals:**

- 不自建 LLM 适配器/反代/指纹伪装（已证伪与 65KB 代价）；不读官方 ZCode CLI 凭据（`~/.zcode/`）
- MVP 不做 Web 端 UI、多账号/团队 Key、折扣探测；不自动切换 `agent-default-model`；headless profile（禁用凭据存储）不适用

## Decisions

> 完整 15 条决策（D-0..D-14，每条含被否方案与具体反例）见 `code-design.md` ④；关键断言：

| # | 决策 | 被否方案（摘要） |
| --- | --- | --- |
| D-0 | 按仓内 host-only 插件同构施工（esbuild 单入口 + vitest + oxlint + tsc references），writer 豁免 | spring/nuxt-writer（栈不匹配）；multi-root 双产物路线（无类型消费面） |
| D-1 | 路由注册落 **profile 层**：`/zcode-plan route install` 经 `ctx.configEditor.edit()` 写 `llm-pi-ai.providers['zcode-plan']`（幂等/保注释）；bundle patch 只插插件行 | bundle 层 patch llm-pi-ai（实测被用户层整份替换静默吃掉）；第二行 pi-ai（DUPLICATE 撞载）；文档手动抄（降级保留） |
| D-2 | 零协议代码：模型请求仍由既有 `llm-pi-ai` 单行承载 | registerAdapter 自建（dsh-zcode-cli 65KB 先例）；本地反代（头部无关已证） |
| D-3 | 登录 = 注册 flow（保留凭证 seam 语义）+ **命令驱动 `begin()`**（补齐本版本无第三方发起面的事实缺口）；`prompt.signal` 原生承载「回调 vs 粘贴」赛跑 | 只注册 flow 等界面发起（本机无按钮）；命令内自跑 OAuth 绕过 seam；自写 Web 设置卡 |
| D-4 | PAT 进 `credentialRef('ZCODE_PLAN_PAT')`、JWT 进 grant record，互不越界；用户已拍板接受 PAT 落盘并文档声明 | PAT 仅内存（跨插件唯一通道是 seam）；PAT 写进 record payload（第二泄露面）；JWT 发布成 ref（无消费者） |
| D-5 | 续期贴官方 120s+jitter、Config 可调；失败分类容错照官方表（retryable 复用旧值+5s 退避 / terminal 清缓存终止）；405[3012] 终止不放大 | 300s 提前量（E6 已自愈竞态）；指数退避（风控纪律） |
| D-6 | 换 PAT 的 HTTP 全程在 `modifyRecord` 之外（锁内零网络，避免并发 `session.commit()` 撞 2s 锁超时） | mutate 内读-判断-换发（看似原子实则阻塞整份凭据文件） |
| D-7 | 卸载/禁用**不清** PAT 引用（避免重启首请求 `MISSING_CREDENTIAL` 窗口）；logout 才清（用户 Q2 拍板；残留 PAT ≤5h 短效 + 0600 约束） | 卸载即 unset（每次重启一次无谓失败） |
| D-8 | `retryPolicy.retryableCodes` = 默认五码**显式重述** + `INVALID_CREDENTIAL`（整集覆盖语义，只写一码会丢默认五码；`AUTH` 码不存在于本版本码表） | 只写 `['INVALID_CREDENTIAL']`（限流不再重试的回归）；always mode（无限重试永久失败） |
| D-9 | 用量接口裸 `authorization: <JWT>` + `bigmodel-*` 头，管理面 `Bearer`（实测两处不同）；org/proj = **Config 必填**（T0 已证伪「登录后自动发现」：biz 无 customerInfo/organizations 路由），缺省报错并在 status 点名；不硬编码本机值 | 统一 Bearer（401）；org/proj 入库（账号私有）；登录后自动发现（T0 ① 实测 404，证伪） |
| D-10 | Key 匹配 `name==='zcode-plan-bridge' && usageScene===1` 双条件；永不删改存量 Key | 官方名复用（本机存量 scene=3 → 无折扣）；只按名匹配（静默劣化最难排查） |
| D-11 | 一条命令五子文法：`login [<callback-url>]` / `logout` / `status`（缺省）/ `route [install\|remove\|status]` / `refresh` | 拆多条顶层命令；多轮交互（CommandResult 单次回执） |
| D-12 | 机密红线：错误与日志只带码/步骤/脱敏 keyId，绝不取值（YAML 解析器报错会带源码行的同款教训） | 错误带响应体片段（PAT 就在响应体里） |
| D-13 | 单测全走窄端口 + 假实现（FakeFetch/FakeClock/FakeCredentials），不起真 Context；真 seam 验证下移 T9 真机断言 | vitest 挂真 dsh-credentials-local（0600 校验跨机随红） |
| D-14 | `route install` 只增删本键；不写 `agent-default-model`、不删任何 Key、不改他人路由 | install 顺手切默认（折扣消失时全会有话无感烧 credits）；自动清理旧 Key（破坏回退路径） |

### 执行环境

- 执行环境：直用主工作区。布局：本仓 main 检出直用（用户知情选定；主工作区存在无关脏改动 `openspec/changes/project-mcp-name-resource-isolation/design.md`，本变更触达面为全新目录与根清单两行，物理零交集）；执行参数：模式 auto、引擎 subagent、apply 键 zai-coding-cn/glm-5.3-flash（映射文件预置）；创建于 2026-11-03

## 触达面清单（六字段①）

全部新建于本仓 `plugins/zcode-plan/`（上游 `@deepseek-ai/dsh*` 只读核实零修改）：

- **宿主半源码**（15）：`src/index.ts`（H1 入口）、`src/host/index.ts`（H2 装配层）、`ports.ts`（H3 窄端口）、`bigmodel/{endpoints,envelope,client}.ts`（H4-H6 四组 API）、`login-flow.ts`（H7）、`loopback.ts`（H8 回调服务器）、`credential-record.ts`（H9）、`key-manager.ts`（H10）、`pat-owner.ts`（H11）、`route-config.ts`（H12）、`status.ts`（H13）、`commands.ts`（H14）、`errors.ts`（H15）
- **包与构建**（7）：`package.json`（P1，`dsh.bundle.patch`/engines 派生/无 `dsh.client`）、`cordis.patch.yml`（P2，仅 insert 插件行）、`build.mjs`（P3）、`tsconfig{,.base,.host}.json`（P4）、`vitest.config.ts`（P5）、`.gitignore`（P6）、`scripts/compose-check.mjs`（P7 离线组合断言）
- **测试**（10）：envelope/client/key-manager/pat-owner/login-flow/commands/route-config/status/credential-record/bundle（X1-X10）
- **仓库根**（根仓）：`README.md` 清单行（R1）、`AGENTS.md` 清单行（R2）
- **仓外运行时**（非本仓 diff）：`~/.dsh/.credentials.yaml`（E2 refs+records）、`~/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai` 键（E1，经 route install）；`scripts/dsh-baseline.mjs` 等仓脚本**明确不改**（按目录自动发现）

## 证据锚（六字段②）

每触达模块 ≥1 条 `file:line` 事实，全表见 `code-design.md` ②。锚定要点：

- patch 替换语义：`dsh-app-boot/README.zh.md:61,204` + 两例隔离实验输出（`code-design.md` §2.1 逐行摘录）
- flow 无通用发起面：全仓 `begin(` 唯一调用方 `$D/dsh-deepseek-account-platform/lib/index.js:854`
- `apiKeyEnv` 按请求解析/热轮换：`$D/dsh-llm-pi-ai/README.zh.md:38`、`$D/dsh-credentials/README.zh.md:91`
- `retryableCodes` 整集覆盖：`$D/dsh-llm/lib/index.js:266`；码表：`$D/dsh-llm/lib/types/error.d.ts:40`
- 锁语义：`$D/dsh-atomic-write/README.zh.md:57,85`（网络往返与 waitMs 默认 2s）
- 仓内同构先例：`plugins/user-commands/src/host/index.ts:41,51,174`、`plugins/session-tool-toggle/src/host/index.ts:110-117`

## 接口与数据形状（六字段③）

完整签名见 `code-design.md` ③（3.1–3.11）。关键形状：

- **Config**（schemastery；`organization`/`project` **必填**（T0 已证伪自动发现），其余零配置可跑）：`organization`/`project`（必填）、`clientVersion`（'0.17.0'）、`refreshLeadMs`（120000）/`refreshJitterMs`（60000）/`requestTimeoutMs`（15000）、`callbackServer`（true，可关）、`loginAttemptTtlMs`（600000）
- **凭据地址**：`LOGIN_RECORD_KEY = credentialKey('zcode-plan','bigmodel-login')`；`PAT_REF = credentialRef('ZCODE_PLAN_PAT')`；grant payload v1 = `{v, jwt, organization?, project?, keyId?, loginAt, jwtExpiresAt?, patExpiresAt?}`（机密仅 jwt 一项；keyId 非 secret）
- **路由常量单一真源**（`route-config.ts`）：`apiKeyEnv: ZCODE_PLAN_PAT` / `api: openai-completions` / `baseURL: https://open.bigmodel.cn/api/coding/paas/v4` / 零指纹 headers / models 两条（glm-5.3、glm-5.3-flash，复用本机已跑通的 zai-coding-zcode 条目）/ `retryPolicy.retryableCodes` 六码
- **模块边界**：仅 `host/index.ts` 与 `commands.ts` 碰 `ctx`；其余模块纯逻辑 + 端口（`FetchPort`/`ClockPort`/`LogPort`/`CredentialsPort` 窄面）
- **API 面**：四组 bigmodel API 封装在 `client.ts`（`exchangeAuthCode`/`listKeys`/`createKey`/`issuePat`/`readUsage`，统一 15s AbortSignal、envelope 归一 `0`/`200` 数字或字符串）

## 逐任务组要点（六字段⑤）

与 tasks.md 分组一一对齐（T0 spike → T9 端到端验收，10 组）；每组实现要点与可执行出口（命令/断言）见 `code-design.md` ⑤，任务行引用其触达面条目编号。

## Risks / Trade-offs

> 完整风险对照（A1–A10 假设 + U1–U6 未决）见 `code-design.md` ⑥；承接阶段 1.5 收敛（diff-matrix）的风险结论：

- [折扣是服务端未公开行为，可单方面收回] → 不把折扣率写入任何逻辑；`zai-coding-cn` 回退路径永久保留；迁移指南含复测口径（42k 对照法）
- [bigmodel 内部 API 无公开契约] → 全部端点/字面量收口在 `endpoints.ts` 单文件；T0 spike 钉死 4 个未知（org/project 发现、tokenByAuthCode 字段、loopback redirect 校验、PAT 并发互斥），红则走既定降级（Config 手填 / 纯粘贴 / 单实例声明）
- [PAT 落盘偏离官方「仅内存」红线] → 用户已拍板接受；README 显式声明差异；5h 短效 + 0600 + 单一写路径约束
- [注入型架构无 401 感知] → D-8 retryPolicy 合格码自愈竞态；`session/event` 观察 `llm/retry` 做确定性强刷记为演进项（用户 Q3 拍板 MVP 不做）
- [风控 405[3012]] → 终止性处理、退避上限 5s、复刻官方续期节奏、单实例单账号假设
- [JWT 效期未知] → grant 记录 `jwtExpiresAt`，status 显示距到期；短效则提示重登而非自动 OAuth

## Migration Plan

1. 安装插件（tag 或 link:）→ `/zcode-plan route install` → `/zcode-plan login` → **核对** `agent-default-model` 当前指向后由用户决定是否切到 `zcode-plan`（本机实测已指向 `zai-coding-cn`，盲切可能覆盖用户已改配置——用户 Q6 拍板「先核对再决定」）
2. 验证一次请求扣费（42k 对照：PAT 路由 3-6 vs 基线 14-15）
3. 删除 profile patch 中已证无效的 `zai-coding-zcode` 路由块（用户手工执行；E7 迁移指南任务）
4. **回退**：默认路由切回 `zai-coding-cn` → `/zcode-plan route remove`；logout 清凭据；已删的 `zai-coding-zcode` 块有 README 手工 YAML 样例可重建

## Open Questions

T0 已消解前四项（见 `artifacts/spike-*.md` 与 `code-design.md` T0 终形态）；余项不阻塞 spec / 方案 / 任务拆分（实施期消解，见 `code-design.md` ⑥ U1–U6）：

- ~~`tokenByAuthCode` 请求/响应字段名~~ → **消解**：换成现行 `POST zcode.z.ai/api/v1/oauth/token`（`{provider,code,redirect_uri,state}`，免 appSecret），管理面 JWT = `data.bigmodel.access_token`，JWT 无 exp
- ~~PAT 效期字段名~~ → **消解**：实测 `expiresIn`(秒) + `expiresAt`(epoch 秒)，满值 18000s；三级兜底只保留缺省分支
- ~~org/project 自动发现端点~~ → **消解（证伪）**：Config 必填（Q4 已接受）
- ~~authorize 对 loopback 的放行~~ → **消解**：放行，`bigmodel.cn/login?appId=zcode&redirect=…&state=…`，回调字段 `authCode`；容器部署粘贴分支为主路径
- ~~同 Key 并发两 PAT 互斥~~ → **消解**：不互斥且幂等（返回同一张），A8 成立
- 404 在「Key 被删」与「JWT 无权限」间的语义混叠（作废重查一轮再判 terminal）
- `compose-check` E3 的 TS 常量序列化在 CI 的可用性（退化为 route.json 深等断言）
- `route install` 与 settings 表单并发写的呈现（edit() 内部已串行，回执加提示句）
