# Tasks

> 执行批次契约：`## N.` 编号 = 执行顺序，组间严格串行；组内任务互不依赖可并行（已核对无同文件/同目录写冲突）；
> 任务描述中括号内编号引用 `code-design.md` ①触达面清单条目（H=宿主源码 / P=包构建 / X=测试 / R=仓库根 / E=仓外）；
> 每任务验证句均为第三方可核对命令或断言。

## 1. 探路 spike（T0）

四项互不依赖、各自产出独立证据文件（消解 design.md Open Questions 前四项；结论钉死或降级，均写入文件）：

- [x] 1.1 org/project 程序化发现探查：拿有效登录 JWT 试 `GET https://bigmodel.cn/api/biz/v1/customerInfo`（备选 `/api/biz/v1/organizations`），结论写入 `openspec/changes/zcode-plan-bridge/artifacts/spike-org-project.md`（命令 + 输出片段 + 钉死/降级结论）；验证：该文件存在且含「结论：」行，红则明写「Config 必填（Q4 已接受）」
- [x] 1.2 `tokenByAuthCode` 契约探查：一次性 authCode 打 `POST https://bigmodel.cn/api/auth/tokenByAuthCode`，钉死 body 字段名、JWT 字段名、JWT exp，结论写入 `artifacts/spike-token-contract.md`；验证：文件存在且 body 字段名有唯一答案（U1 消解）
- [x] 1.3 authorize 端点 loopback 校验探查：构造 `redirect=http://127.0.0.1:<port>/oauth/callback/bigmodel` 授权 URL 浏览器点一次，结论写入 `artifacts/spike-loopback.md`；验证：文件存在且结论为「放行」或「不放行→callbackServer 默认改 false（Q5）」
- [x] 1.4 同 Key 并发两 PAT 互斥探查：连发两次 `access_tokens`，用第一张发一次模型请求看是否 401，结论写入 `artifacts/spike-pat-mutex.md`；验证：文件存在且结论为「不互斥」或「互斥→README 锁单实例（A8）」

## 2. 脚手架（T1）

- [x] 2.1 搭建 `plugins/zcode-plan/` 全套骨架：package.json（P1，`dsh.engines.dsh` 派生基线、`dsh.bundle.patch`、无 `dsh.client`）、cordis.patch.yml（P2，仅 insert 插件行）、build.mjs（P3）、tsconfig 三件套（P4）、vitest.config.ts（P5）、.gitignore（P6）、src/index.ts（H1）、src/host/index.ts 空装配（H2）；验证：`pnpm --filter dsh-plugin-zcode-plan verify:all` 全绿 且 `node -e "const p=require('./plugins/zcode-plan/package.json');if(p.dsh.engines.dsh!=='>=0.2.1-rc.2 <0.3.0')process.exit(1)"` 退出码 0 且 `pnpm dsh:check` 输出含 agree

## 3. bigmodel API 客户端（T2）

- [x] 3.1 实现客户端模块（src/host/bigmodel/ 同目录合一任务）：endpoints.ts 端点常量唯一出处（H4）、envelope.ts 成功码 0/200 数字/字符串归一与脱敏（H5）、client.ts 四组 API + 15s 超时 + PAT 效期三级兜底（H6）、ports.ts 窄端口（H3）；验证：`grep -c "https://" plugins/zcode-plan/src/host/bigmodel/client.ts` 输出 0（URL 只在 endpoints.ts）
- [x] 3.2 客户端单测（test/ 目录）：envelope.test.ts（X1：成功码四形、HTTP 200 业务失败、非 JSON、错误不含值）与 client.test.ts（X2：请求形状、假 clock 15s 超时 `expect(cap.code).toBe('TIMEOUT')`、issuePat 三分支、`err.message` 不含 jwt 夹具）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- envelope client` 全绿

## 4. 凭据状态机 + PAT owner（T3）

- [x] 4.1 实现状态机三模块（src/host/ 根同目录合一任务）：credential-record.ts grant 读写与 keyId 补写（H9，mutate 内零网络）、key-manager.ts find-or-create 双条件 + 404 作废重查一轮（H10）、pat-owner.ts 单飞/代次隔离/失败分类/120s+jitter 续期/`credentials.set` 唯一发布（H11）；验证：`grep -n "fetch(" plugins/zcode-plan/src/host/credential-record.ts` 无输出
- [x] 4.2 状态机单测（test/ 目录）：credential-record.test.ts（X9）、key-manager.test.ts（X3，含「同名 scene=3 存量」夹具）、pat-owner.test.ts（X4，fake timers 覆盖容错表全行：`vi.advanceTimersByTime(leadMs-1)` 不触发、429 复用旧值 set 未调用、logout 后迟到结果被拒）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- pat-owner key-manager credential-record` 全绿

## 5. credentials / authorization 集成（T4）

- [x] 5.1 装配层与 flow 骨架（src/host/ 同目录合一任务）：host/index.ts apply 主体（H2：软注入注册 flow、record-updated 监听重建 owner、启动有记录即拉起、PAT_REF 冲突检测、credentials 缺席零注册零报错）+ login-flow.ts flow 定义部分（H7：AuthorizationFlow + createLoginDriver）；验证：单测断言「无 credentials 服务时 apply 不抛且 registerFlow 未被调用」存在并通过
- [x] 5.2 集成单测（test/ 目录）：login-flow.test.ts 集成部分（X5 部分：record-updated 本 key 触发重建/他 key 不触发、`describe` 返回 env 源即 REF_CONFLICT 且 set 未调用）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- login-flow` 全绿

## 6. 登录 flow 完整实现（T5）

- [x] 6.1 登录链路源码（src/host/ 同目录合一任务）：loopback.ts 一次性回调服务器（H8：只听 127.0.0.1:0、state 校验、close 幂等且结算挂起 result）+ login-flow.ts 全量（H7：run() 时序、回调 vs 粘贴 prompt.signal 赛跑、session.commit 在 run 返回前、AuthorizationDeclinedError 区分）；验证：单测断言「两个分支各一次 `expect(server.closed).toBe(true)`」与「commitSpy 先于 runResolved」存在并通过
- [x] 6.2 登录与命令单测（test/ 目录）：login-flow.test.ts 全量（X5）+ commands.test.ts login 部分（X6 部分：login 二次调用回显同一 URL）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- login-flow commands` 全绿

## 7. 路由注册 + 合并语义实测（T6）

- [x] 7.1 route-config.ts 实现（H12）：ZCODE_PLAN_ROUTE 常量单一真源 + installRoute/removeRoute（override/inherited 并集合并、深等幂等短路、保注释）+ routeState；验证：`grep -c "ZCODE_PLAN_PAT" plugins/zcode-plan/src/host/route-config.ts` ≥1 且单测（X7：两边都有 providers 逐键 profile 胜、同名同值跳过、remove 只删本键）通过
- [x] 7.2 compose-check 离线组合断言脚本（P7，scripts/ 目录）：隔离 `$DSH_HOME` + symlink 插件，三例断言（E1 插件行存在 / E2 用户层覆盖后无 zcode-plan 键的替换语义回归哨兵 / E3 用户层注入完整路由且 `--dump-config-schema` 可加载）；验证：`pnpm --filter dsh-plugin-zcode-plan build && pnpm --filter dsh-plugin-zcode-plan compose:check` 退出码 0
- [x] 7.3 真机路由注册验证（E1 仓外）：`docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/zcode-plan` 后装插件重启 profile，执行 `/zcode-plan route install`；验证：`docker exec dsh dsh --profile web --dump-config | sed -n '/id: llm-pi-ai/,/^# ==/p'` 含 `zcode-plan:` 且 `zai-coding-cn:` 等既有键仍在

## 8. 可观测与命令面收口（T7）

- [x] 8.1 status 渲染与日志事件（src/host/ 同目录合一任务）：status.ts 五段渲染 + 用量只读两档（H13：`limits[]` 的 `unit===3` 5h 窗口与 `unit===6` 周额度都展示、失败降级）、host/index.ts 日志点接入固定事件名（H2 部分：pat_issued/pat_refresh_deferred/pat_refresh_failed/key_created/key_reused/login_committed/route_registered/halted）、commands.ts 五子命令收口（H14：login/logout/status/route/refresh）；验证：`pnpm --filter dsh-plugin-zcode-plan test` 全量全绿
- [x] 8.2 status 单测（X8，test/ 目录）：五段齐全、用量失败降级文案、`expect(text).not.toContain(jwtFixture)` 与 `not.toContain(patFixture)` 反向断言；验证：`pnpm --filter dsh-plugin-zcode-plan test -- status` 全绿且反向断言存在（grep -c 'not.toContain' ≥2）

## 9. 文档 + 迁移指南（T8）

- [x] 9.1 插件 README（plugins/zcode-plan/README.md）：原理一句（凭证属性折扣非指纹）、安装、三步上线、回退（切回 zai-coding-cn + route remove）、PAT 落盘偏离官方红线声明、卸载不清引用与 ≤5h 残留说明、headless 不适用（E1）、单 owner 多 profile（E2）、折扣复测口径（bodies/o1.json + quota/limit 差值）、手工路由 YAML 样例（F1 降级文档）；验证：`grep -c "route remove" plugins/zcode-plan/README.md` ≥1 且 `grep -c "仅内存" plugins/zcode-plan/README.md` ≥1（安全模型差异声明存在）
- [x] 9.2 迁移指南（plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md）：首步「先核对 agent-default-model 指向再决定」（Q6，本机已指向 zai-coding-cn）→ route install → login → 切换验证 → 删 profile patch 的 zai-coding-zcode 块（用户手工）→ 回退与重建样例；并加一句防误读注记：同目录 `diff-matrix.md` 是阶段 1.5 冻结留痕，其 §八「bundle patch 注册路由」已被设计线实测推翻、路由注册以 `design.md` D-1（profile 层 route install）为准；验证：`grep -c "先核对" plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` ≥1 且 `grep -cE "design\.md.*D-1|D-1.*为准" plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` ≥1 且文件含回退小节
- [x] 9.3 仓库根清单更新（根仓同目录合一任务）：根 README.md 插件一览表加行 + 「其余四个软插件」改「五个」（R1）、根 AGENTS.md 插件清单与软插件表述同步（R2）；验证：`grep -c "zcode-plan" README.md` ≥1 且 `grep -c "zcode-plan" AGENTS.md` ≥1 且 `grep -c "其余五个软插件" README.md` ≥1

## 10. 端到端验收（T9，真账号消耗少量 credits）

- [x] 10.1 功能链验收并留档：登录链（login → status 已登录 → `grep -cE "^  zcode-plan/bigmodel-login:" ~/.dsh/.credentials.yaml`=1）、Key 链（`name==='zcode-plan-bridge' && usageScene===1` 且存量 zcode-api-key scene 仍为 3）、路由链（7.3 断言）、轮换链（`/zcode-plan refresh` 回执与上一张不同 → 立即一次请求成功）、回退链（logout 后 ref 计 0、请求 MISSING_CREDENTIAL 显式失败）；验证：`plugins/zcode-plan/docs/acceptance.md` 存在且含五链读数表 ✅ 2026-11-04 五链全绿（真机）：登录链 grep=1 + 4.1 全链通；Key 链 bridge Key apiKey=949c4713… scene=1（与 PAT payload `api_key` 逐字一致）且存量 Key 全部未受扰；轮换链回执幂等「与上一张不同：否」（同 Key 现行 token，README 幂等语义如实落地）；回退链三清（ref/login/signing 记录归零）+ status 未登录渲染 + 模型菜单 provider 消失（宿主对不可解析 ref 入口级拦截，请求级 MISSING_CREDENTIAL 由 dsh-llm-pi-ai 0.2.1-rc.2 行为佐证）；读数全文见 acceptance.md §一
- [x] 10.2 折扣对照验收 + 仓库门禁：复用 `zcode-rate-test` 方法（gen.mjs 互异等长体 + 窗口重置安全检查）发同款 42k 请求，PAT 路由 delta 3–6、`zai-coding-cn` 基线 14–15（quota/limit unit===3 差值）；仓库门禁 `pnpm verify` + `pnpm dsh:check` + `pnpm --filter dsh-plugin-zcode-plan compose:check` 全绿；验证：acceptance.md 折扣表两行读数在判定区间 且三条门禁命令退出码 0（**判定区间实测不成立——原区间来自前缀缓存假阳性，收口裁定见 RE-7；后续经 RE-8 翻转：1.5x 真实存在但判定载体=官方 ZCode runtime 通道，直连载体永远测不到；门禁三条全绿已达成，读数留档 acceptance.md §二/§三**）

## Workflow follow-up

- 归档（`openspec archive`）由 spec-done 阶段承接：验证全部任务 → 同步 specs → 归档变更；本清单不含归档步骤。
- 迁移指南中「删除 profile patch 的 zai-coding-zcode 路由块」是用户侧动作（仓外配置），不由本变更任务执行。

## 执行期运行规则留痕（RE 编号；R1/R2 已用于 design.md 触达面，此处另起系）

> 每条自包含：规则 + 依据 + 适用范围 + 连锁面。后续组与接续会话以本节为准。

- **RE-1 换证端点裁定**：登录换证 = `POST https://zcode.z.ai/api/v1/oauth/token`，JSON `{provider:'bigmodel', code, redirect_uri, state}` **免 appSecret**；成功判定 `code===0`；**管理面 JWT = `data.bigmodel.access_token`**（`data.token` 是 zcode 侧 JWT，不使用）。旧 `bigmodel.cn/api/auth/tokenByAuthCode` 需官方已不内置 appSecret → 废弃不实现。
  依据：T0② 实测（`artifacts/spike-token-contract.md` 第五/六节；用户已确认切换）。
  适用范围：T2（`endpoints.ts`/`client.exchangeAuthCode`）、T5（登录 flow 换证步骤）、README 安装说明（无需任何密钥）。
  连锁面：`code-design.md` §3.4 表首行、T0 终形态、design.md Open Questions（已同步）；`endpoints.ts` URL 常量单一出处；`client.test.ts` 断言响应解析 `data.bigmodel.access_token`。

- **RE-2 org/project 必填**：`organization`/`project` 为 **Config 必填**（T0① 证伪程序化发现：biz 无 customerInfo/organizations 路由，404 权威）；缺省时启动报错并在 `/zcode-plan status` 点名。
  依据：`artifacts/spike-org-project.md`；用户 Q4 已接受。
  适用范围：T1（Config schema `Schema.string().required()`）、T2/T3 的 ident 构造（不再有 discoverIdentity 分支）、T7 status 点名文案、T8 README 安装步骤（先取 org/proj）。
  连锁面：`code-design.md` §3.2/§3.3（已同步）、design.md D-9 与接口段（已同步）；「零配置可跑」表述仅对除 org/project 外的键成立；`X8` 测试补「org/project 缺失报错点名」用例。

- **RE-3 PAT 幂等签发**：同 Key 连续 `access_tokens` 返回**同一张** PAT（服务端 find-or-return）；后签发不吊销先前 PAT；效期字段 `expiresIn`(秒)+`expiresAt`(epoch 秒)，满值 18000s。
  依据：`artifacts/spike-pat-mutex.md`（A8 成立）。
  适用范围：T3 `pat-owner.ts`（刷新结果可能与原 token 相同 → 必须按 `expiresAt` 判定是否更新，**不得断言刷新必然换新值**；`current()` 语义不变）、`X4` 测试（不得断言 token 变化）、README（「多实例共享同一张现行 PAT，无需协调」）。
  连锁面：code-design §3.5 续期实现要点；§3.4 PAT 效期解析（已改为 expiresIn 优先）；T9 轮换链验收改写为「`refresh` 后 PAT 可用且 expiresAt 前移」。

- **RE-4 登录双分支、容器以粘贴为主**：authorize URL 构造 = `https://bigmodel.cn/login?appId=zcode&redirect=<urlencoded loopback 或任意注册 redirect>&state=<32hex>`（端点本体 `bigmodel.cn/login`；`/api/auth/authorize` 已证伪）；回调 query 字段名 `authCode`（兼容 `code` 读取）；state 必须校验。容器部署（浏览器在宿主、loopback 在容器）回调不可达 → **粘贴分支为主路径**；`callbackServer` 默认保持 `true`。
  依据：`artifacts/spike-loopback.md`（两轮放行复现 + 容器回环隔离实测）。
  适用范围：T5 `loopback.ts`/`login-flow.ts`、T7 `commands.ts` 回执文案、README（容器部署说明）。
  连锁面：`X5` 测试需覆盖「粘贴 URL 容错解析（带/不带 scheme、编码差异、state 不符拒绝）」；`loginAttemptTtlMs` 语义不变。

- **RE-5 登录 JWT 无 exp**：`data.bigmodel.access_token` payload 无 `exp`/`iat`（仅身份字段）；`grant.jwtExpiresAt` **恒省略**，status 不展示 JWT 到期时间；登录态失效只能靠管理面 401 感知（重登提示）。
  依据：`artifacts/spike-token-contract.md` 第五节（两轮解码一致，旧 `.token` 同形）。
  适用范围：T3 `credential-record.ts`（可选字段不写）、T7 `status.ts` 五段渲染（去掉 JWT 到期行或显示「未知」）、`X9`/`X8` 测试、T9 验收（不设 JWT 过期用例）。
  连锁面：design.md「JWT 效期未知」风险条款（已由本条收口为「无 exp」）；README 安全说明。

- **RE-6 任务顺序修正（commands 依赖前移）**：tasks.md 6.2 原文含 `commands.test.ts` login 部分，但 `commands.ts`（H14）归属任务 8.1（T7），组 6 时尚不存在。裁定：**6.2 只交付 login-flow 全量（X5），`commands.test.ts` 的 login 部分并入组 8 随 8.1/8.2 一起交付**；8.1 的验证句（全量 test 绿）同时覆盖它。
  依据：执行到组 6 时发现依赖倒置；不缩小 8.1 验证口径，只调整 6.2 的交付面。
  适用范围：组 6（6.2）、组 8（8.1/8.2）。
  连锁面：T5 终形态记录该偏差；T7 终形态注明 commands login 测试覆盖点。

- **RE-7 折扣判定区间实测不成立（10.2 收口裁定）**：原判定「PAT delta 3–6 vs 基线 14–15」来自早期 42k 实验，本轮**无法复现**。根因 = **服务端前缀缓存假阳性**：同一 body 先后两发，第二发命中缓存按低价计费（`cached_tokens=42048`，`/tmp/r2.json`、`/tmp/r3.json` 存档），早期「scene=1 → 折扣（~3.5x）」观察全部源于此；互异全新体的干净对照（11-02 五臂、11-03 A/B/D 三臂、23:27 D 复测、23:56 双池终局 P/K）**全部同价**（分/ktoken 0.326–0.434，ratio ≈1.0）。附带证伪：「scene=1 才能换 PAT」（B 臂 scene3 键签发成功）、「折扣与端点无关但 PAT 有」（anthropic 端点与 coding 端点同 PAT 同价同扣双池）。终局口径：官方「ZCode 1.5 倍用量 / 订阅专享 150% 额度」在本账号当前时点、u3（5h 窗）/u6（周额度池）双池、coding/anthropic 双端点下均**不可观测**（u6 双臂 6=6 分毫不差；限时活动至 2026-08-31 已过为最可能解释。**RE-8 已翻转此结论：不可观测仅限直连载体，官方 runtime 通道实测有真折扣，见 RE-8**）。
  依据：`plugins/zcode-plan/docs/acceptance.md` §二（全部读数与假阳性机制）；`/home/docker/.cache/zcode-rate-test/run-final-duel.sh` 可复现。
  适用范围：README 原理句与折扣复测口径（已改写为中性事实）、code-design.md D-10 理由行与 T9 第 4 条（已改写）、tasks.md 10.2（已按「PAT 与基线同价 + 偏差留痕」收口）。
  连锁面：D-10 双条件保留理由改为「官方形态等价 + 存量 scene=3 键保守隔离」；C5 前提证伪但决策无害；proposal.md「实测 3.5x 为现状口径」与 diff-matrix C8「实测 ~3.5x」为历史口径不再引用（规划产物不回改，归档由 spec-done 阶段定夺）；spec.md「命中折扣计费通道」为意图表述保留。

- **RE-8 1.5x 复现成功——载体修正 + 判定量升级（10.2 复核翻转，11-04 00:15–00:55）**：用户要求「换个方向重新调研」后，从 ZCode 官方工具文档（zcode.md）取得关键定义：1.5x = 同等调用量按 **0.67 系数折算扣减**，生效条件 =「在 ZCode 中登录使用」；从 api-key-management.md（2026-10-16 生效）确认 Key 三分类（标准/个人套餐/团队套餐互不通用，历史键=兼容键按端点路由）；从第三方插件 dsh-zcode-coding-plan 确认 2026-10 仍有 1.5x 实测存活（其路径=驱动官方 ZCode 客户端子进程）。据此**修正判定量**：弃用分/ktoken 粗归一（输出长度污染，glm-5.3 输出系数 24 为输入 2.3 的 10 倍），改用**理论刻度 = 实扣 ÷ 理论积分**（官方系数公式 (in×2.3+cached×1.7+out×24)/10000，GLM-5.3 口径）。实测体系（同键 arch-company 兼容键、同 coding 端点、glm-5.3）：**直连载体恒为 ~1.5 刻度**（裸键 curl 1.43–1.65、PAT curl ~1.9（含污染）、裸键+全套 ZCode header 复刻 1.55——**头组复刻无效**，判定不在表层 header）；**官方 ZCode runtime 载体（npm zcode-app-cli@3.17.2-44 内嵌官方 zcode.cjs + 自定义 provider 直指 coding 端点）实扣 < 理论**：并排终局对照（同窗口单命令、免交叉污染）官方臂理论 10.56 → 实扣 9/8 分 = 刻度 0.85/0.76，直连臂理论 8.42 → 实扣 12/13 分 = 刻度 1.43/1.54，**等效用量倍数 1.67–2.04x**（u3/u6 口径）。RE-7「不可观测」结论**限于直连载体**——1.5x 判定键在官方 runtime 的深层通道标识（非 Key 类型、非端点、非表层 header），官方文档「在 ZCode 中登录使用即可享受」与实测吻合。
  方法论教训（重要）：**dsh 主会话自身跑 GLM 与实验共用 quota 池**——后台跑实验+前台并发推理会污染读数（C2 臂 PAT 多扣 ~20% 为自污染假象）；修正 = 实验全程单条命令内完成「基线连稳→探针→轮询」（命令执行期间主会话不产出 token）。
  依据：`/home/docker/.cache/zcode-rate-test/run-zcode-headers.sh`（C 臂）、`run-zcode-headers-pat.sh`（C2 臂）、`/tmp/zcode-test/provider_config.json` + `/tmp/zcode-cli-src/package`（官方 runtime 解包）；官方文档 zcode.md / api-key-management.md / overview.md（系数表）。
  适用范围：README 原理句（第 5 行需再改写：官方通道实测 1.67–2.0x 等效，非「折扣是上游行为不可制造」的中性句）、acceptance.md §二（新增官方通道并排对照小节）、code-design.md D-10 与 T9 第 4 条（刻度口径再对齐）。
  连锁面：插件价值方向升级——「命中折扣计费通道」的落地路径 = **驱动官方 ZCode runtime**（yuyang2230 同款：spawn 官方 CLI/桌面端子进程，而非自制凭证直连路由）；当前主 GUI 会话模型（zai-coding-cn/glm-5.3-flash 直连）正按 1.5 刻度消耗，切换官方通道等效多跑 1.7–2.0 倍；10.1 login 链路价值上升（login =「在 ZCode 中登录」的官方形态之一，成功后可对照「OAuth 账号绑定 provider」与「api-key 自定义 provider」两条官方通道的折扣一致性）；刻度细节（0.76–0.85 vs 0.67 字面、直连 1.5 刻度与「150% 额度」计量基数的关系、闲时 50% 叠加）留待日常使用期长周期观察，不影响方向性结论。
