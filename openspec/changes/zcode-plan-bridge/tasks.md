# Tasks

> 执行批次契约：`## N.` 编号 = 执行顺序，组间严格串行；组内任务互不依赖可并行（已核对无同文件/同目录写冲突）；
> 任务描述中括号内编号引用 `code-design.md` ①触达面清单条目（H=宿主源码 / P=包构建 / X=测试 / R=仓库根 / E=仓外）；
> 每任务验证句均为第三方可核对命令或断言。

## 1. 探路 spike（T0）

四项互不依赖、各自产出独立证据文件（消解 design.md Open Questions 前四项；结论钉死或降级，均写入文件）：

- [ ] 1.1 org/project 程序化发现探查：拿有效登录 JWT 试 `GET https://bigmodel.cn/api/biz/v1/customerInfo`（备选 `/api/biz/v1/organizations`），结论写入 `openspec/changes/zcode-plan-bridge/artifacts/spike-org-project.md`（命令 + 输出片段 + 钉死/降级结论）；验证：该文件存在且含「结论：」行，红则明写「Config 必填（Q4 已接受）」
- [ ] 1.2 `tokenByAuthCode` 契约探查：一次性 authCode 打 `POST https://bigmodel.cn/api/auth/tokenByAuthCode`，钉死 body 字段名、JWT 字段名、JWT exp，结论写入 `artifacts/spike-token-contract.md`；验证：文件存在且 body 字段名有唯一答案（U1 消解）
- [ ] 1.3 authorize 端点 loopback 校验探查：构造 `redirect=http://127.0.0.1:<port>/oauth/callback/bigmodel` 授权 URL 浏览器点一次，结论写入 `artifacts/spike-loopback.md`；验证：文件存在且结论为「放行」或「不放行→callbackServer 默认改 false（Q5）」
- [ ] 1.4 同 Key 并发两 PAT 互斥探查：连发两次 `access_tokens`，用第一张发一次模型请求看是否 401，结论写入 `artifacts/spike-pat-mutex.md`；验证：文件存在且结论为「不互斥」或「互斥→README 锁单实例（A8）」

## 2. 脚手架（T1）

- [ ] 2.1 搭建 `plugins/zcode-plan/` 全套骨架：package.json（P1，`dsh.engines.dsh` 派生基线、`dsh.bundle.patch`、无 `dsh.client`）、cordis.patch.yml（P2，仅 insert 插件行）、build.mjs（P3）、tsconfig 三件套（P4）、vitest.config.ts（P5）、.gitignore（P6）、src/index.ts（H1）、src/host/index.ts 空装配（H2）；验证：`pnpm --filter dsh-plugin-zcode-plan verify:all` 全绿 且 `node -e "const p=require('./plugins/zcode-plan/package.json');if(p.dsh.engines.dsh!=='>=0.2.1-rc.2 <0.3.0')process.exit(1)"` 退出码 0 且 `pnpm dsh:check` 输出含 agree

## 3. bigmodel API 客户端（T2）

- [ ] 3.1 实现客户端模块（src/host/bigmodel/ 同目录合一任务）：endpoints.ts 端点常量唯一出处（H4）、envelope.ts 成功码 0/200 数字/字符串归一与脱敏（H5）、client.ts 四组 API + 15s 超时 + PAT 效期三级兜底（H6）、ports.ts 窄端口（H3）；验证：`grep -c "https://" plugins/zcode-plan/src/host/bigmodel/client.ts` 输出 0（URL 只在 endpoints.ts）
- [ ] 3.2 客户端单测（test/ 目录）：envelope.test.ts（X1：成功码四形、HTTP 200 业务失败、非 JSON、错误不含值）与 client.test.ts（X2：请求形状、假 clock 15s 超时 `expect(cap.code).toBe('TIMEOUT')`、issuePat 三分支、`err.message` 不含 jwt 夹具）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- envelope client` 全绿

## 4. 凭据状态机 + PAT owner（T3）

- [ ] 4.1 实现状态机三模块（src/host/ 根同目录合一任务）：credential-record.ts grant 读写与 keyId 补写（H9，mutate 内零网络）、key-manager.ts find-or-create 双条件 + 404 作废重查一轮（H10）、pat-owner.ts 单飞/代次隔离/失败分类/120s+jitter 续期/`credentials.set` 唯一发布（H11）；验证：`grep -n "fetch(" plugins/zcode-plan/src/host/credential-record.ts` 无输出
- [ ] 4.2 状态机单测（test/ 目录）：credential-record.test.ts（X9）、key-manager.test.ts（X3，含「同名 scene=3 存量」夹具）、pat-owner.test.ts（X4，fake timers 覆盖容错表全行：`vi.advanceTimersByTime(leadMs-1)` 不触发、429 复用旧值 set 未调用、logout 后迟到结果被拒）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- pat-owner key-manager credential-record` 全绿

## 5. credentials / authorization 集成（T4）

- [ ] 5.1 装配层与 flow 骨架（src/host/ 同目录合一任务）：host/index.ts apply 主体（H2：软注入注册 flow、record-updated 监听重建 owner、启动有记录即拉起、PAT_REF 冲突检测、credentials 缺席零注册零报错）+ login-flow.ts flow 定义部分（H7：AuthorizationFlow + createLoginDriver）；验证：单测断言「无 credentials 服务时 apply 不抛且 registerFlow 未被调用」存在并通过
- [ ] 5.2 集成单测（test/ 目录）：login-flow.test.ts 集成部分（X5 部分：record-updated 本 key 触发重建/他 key 不触发、`describe` 返回 env 源即 REF_CONFLICT 且 set 未调用）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- login-flow` 全绿

## 6. 登录 flow 完整实现（T5）

- [ ] 6.1 登录链路源码（src/host/ 同目录合一任务）：loopback.ts 一次性回调服务器（H8：只听 127.0.0.1:0、state 校验、close 幂等且结算挂起 result）+ login-flow.ts 全量（H7：run() 时序、回调 vs 粘贴 prompt.signal 赛跑、session.commit 在 run 返回前、AuthorizationDeclinedError 区分）；验证：单测断言「两个分支各一次 `expect(server.closed).toBe(true)`」与「commitSpy 先于 runResolved」存在并通过
- [ ] 6.2 登录与命令单测（test/ 目录）：login-flow.test.ts 全量（X5）+ commands.test.ts login 部分（X6 部分：login 二次调用回显同一 URL）；验证：`pnpm --filter dsh-plugin-zcode-plan test -- login-flow commands` 全绿

## 7. 路由注册 + 合并语义实测（T6）

- [ ] 7.1 route-config.ts 实现（H12）：ZCODE_PLAN_ROUTE 常量单一真源 + installRoute/removeRoute（override/inherited 并集合并、深等幂等短路、保注释）+ routeState；验证：`grep -c "ZCODE_PLAN_PAT" plugins/zcode-plan/src/host/route-config.ts` ≥1 且单测（X7：两边都有 providers 逐键 profile 胜、同名同值跳过、remove 只删本键）通过
- [ ] 7.2 compose-check 离线组合断言脚本（P7，scripts/ 目录）：隔离 `$DSH_HOME` + symlink 插件，三例断言（E1 插件行存在 / E2 用户层覆盖后无 zcode-plan 键的替换语义回归哨兵 / E3 用户层注入完整路由且 `--dump-config-schema` 可加载）；验证：`pnpm --filter dsh-plugin-zcode-plan build && pnpm --filter dsh-plugin-zcode-plan compose:check` 退出码 0
- [ ] 7.3 真机路由注册验证（E1 仓外）：`docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/zcode-plan` 后装插件重启 profile，执行 `/zcode-plan route install`；验证：`docker exec dsh dsh --profile web --dump-config | sed -n '/id: llm-pi-ai/,/^# ==/p'` 含 `zcode-plan:` 且 `zai-coding-cn:` 等既有键仍在

## 8. 可观测与命令面收口（T7）

- [ ] 8.1 status 渲染与日志事件（src/host/ 同目录合一任务）：status.ts 五段渲染 + 用量只读两档（H13：`limits[]` 的 `unit===3` 5h 窗口与 `unit===6` 周额度都展示、失败降级）、host/index.ts 日志点接入固定事件名（H2 部分：pat_issued/pat_refresh_deferred/pat_refresh_failed/key_created/key_reused/login_committed/route_registered/halted）、commands.ts 五子命令收口（H14：login/logout/status/route/refresh）；验证：`pnpm --filter dsh-plugin-zcode-plan test` 全量全绿
- [ ] 8.2 status 单测（X8，test/ 目录）：五段齐全、用量失败降级文案、`expect(text).not.toContain(jwtFixture)` 与 `not.toContain(patFixture)` 反向断言；验证：`pnpm --filter dsh-plugin-zcode-plan test -- status` 全绿且反向断言存在（grep -c 'not.toContain' ≥2）

## 9. 文档 + 迁移指南（T8）

- [ ] 9.1 插件 README（plugins/zcode-plan/README.md）：原理一句（凭证属性折扣非指纹）、安装、三步上线、回退（切回 zai-coding-cn + route remove）、PAT 落盘偏离官方红线声明、卸载不清引用与 ≤5h 残留说明、headless 不适用（E1）、单 owner 多 profile（E2）、折扣复测口径（bodies/o1.json + quota/limit 差值）、手工路由 YAML 样例（F1 降级文档）；验证：`grep -c "route remove" plugins/zcode-plan/README.md` ≥1 且 `grep -c "仅内存" plugins/zcode-plan/README.md` ≥1（安全模型差异声明存在）
- [ ] 9.2 迁移指南（plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md）：首步「先核对 agent-default-model 指向再决定」（Q6，本机已指向 zai-coding-cn）→ route install → login → 切换验证 → 删 profile patch 的 zai-coding-zcode 块（用户手工）→ 回退与重建样例；并加一句防误读注记：同目录 `diff-matrix.md` 是阶段 1.5 冻结留痕，其 §八「bundle patch 注册路由」已被设计线实测推翻、路由注册以 `design.md` D-1（profile 层 route install）为准；验证：`grep -c "先核对" plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` ≥1 且 `grep -cE "design\.md.*D-1|D-1.*为准" plugins/zcode-plan/docs/migration-from-zai-coding-zcode.md` ≥1 且文件含回退小节
- [ ] 9.3 仓库根清单更新（根仓同目录合一任务）：根 README.md 插件一览表加行 + 「其余四个软插件」改「五个」（R1）、根 AGENTS.md 插件清单与软插件表述同步（R2）；验证：`grep -c "zcode-plan" README.md` ≥1 且 `grep -c "zcode-plan" AGENTS.md` ≥1 且 `grep -c "其余五个软插件" README.md` ≥1

## 10. 端到端验收（T9，真账号消耗少量 credits）

- [ ] 10.1 功能链验收并留档：登录链（login → status 已登录 → `grep -cE "^  zcode-plan/bigmodel-login:" ~/.dsh/.credentials.yaml`=1）、Key 链（`name==='zcode-plan-bridge' && usageScene===1` 且存量 zcode-api-key scene 仍为 3）、路由链（7.3 断言）、轮换链（`/zcode-plan refresh` 回执与上一张不同 → 立即一次请求成功）、回退链（logout 后 ref 计 0、请求 MISSING_CREDENTIAL 显式失败）；验证：`plugins/zcode-plan/docs/acceptance.md` 存在且含五链读数表
- [ ] 10.2 折扣对照验收 + 仓库门禁：复用 `zcode-rate-test` 方法（gen.mjs 互异等长体 + 窗口重置安全检查）发同款 42k 请求，PAT 路由 delta 3–6、`zai-coding-cn` 基线 14–15（quota/limit unit===3 差值）；仓库门禁 `pnpm verify` + `pnpm dsh:check` + `pnpm --filter dsh-plugin-zcode-plan compose:check` 全绿；验证：acceptance.md 折扣表两行读数在判定区间 且三条门禁命令退出码 0

## Workflow follow-up

- 归档（`openspec archive`）由 spec-done 阶段承接：验证全部任务 → 同步 specs → 归档变更；本清单不含归档步骤。
- 迁移指南中「删除 profile patch 的 zai-coding-zcode 路由块」是用户侧动作（仓外配置），不由本变更任务执行。
