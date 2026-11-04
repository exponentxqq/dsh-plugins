# zcode-plan-bridge 差异收敛矩阵（阶段 1.5）

> 编排：并行 team 驱动（`--parallel`，用户选定）。A 线 / B 线均为具名 fresh 成员
> （`spec-plan-zcode-plan-bridge-line-a` / `-line-b`，glm-5.3）；无 `--model` 覆盖，
> team 编排下 lineA/lineB 路由不应用（留痕）。产物：`line-a.md` + `line-b.md`。
> 第三线复算：0 个（无「影响方案走向且无法查证」的分歧，限额 3 内未消费）。

## 一、共识（两线一致，直接采信）

| # | 共识项 |
| --- | --- |
| C1 | 架构：纯 host 半「凭证桥」插件，弃完整 LLM 适配器 / 本地反代 / 指纹伪装（三线证伪依据：五臂实验 + dsh-zcode-cli 65KB 协议代码代价） |
| C2 | PAT 发布通道：`credentials.set(credentialRef('ZCODE_PLAN_PAT'))` + llm-pi-ai 路由 `apiKeyEnv` 引用，按请求解析、热轮换无需重启（dsh-llm-pi-ai / dsh-credentials README 明文） |
| C3 | 路由形态：`api: openai-completions` + `baseURL: https://open.bigmodel.cn/api/coding/paas/v4` + 零指纹 headers（实验证明头部无关计费） |
| C4 | 登录链路：bigmodel OAuth（appId=zcode、state 校验、127.0.0.1 一次性回调 server）→ `tokenByAuthCode` → JWT 存 credentials record（kind grant）；JWT 只用于管理面，绝不直接发模型请求 |
| C5 | Key 管理：find-or-create 按 name + usageScene===1 双条件（账号存量 `zcode-api-key` 是 scene=3 无折扣，只按官方名复用会踩坑）；绝不删除/改写用户存量 Key |
| C6 | PAT 续期对齐官方契约：提前 120s + jitter、错误分类容错（网络/超时/429/5xx 复用旧 PAT + 5s 退避；401/403/404/畸形清缓存显式失败）、并发合并单 pending、15s 超时、代次隔离拒绝迟到结果 |
| C7 | MVP host-only（web 半徽章/用量卡 phase 2）；斜杠命令可作 status 查询补充 |
| C8 | 折扣回落只观测告警，不自动改用户路由（折扣是服务端未公开行为，实测 ~3.5x、宣传 1.5x，不写死任何折扣率） |
| C9 | 机密脱敏：JWT/PAT/Key 绝不进日志、错误消息、--dump-config 输出 |
| C10 | 交付形态：`plugins/zcode-plan/`（`dsh-plugin-zcode-plan`），esbuild + vitest + oxlint，engines 由 dsh-baseline 派生（>=0.2.1-rc.2 <0.3.0），OpenSpec 提案先行 |
| C11 | 风控纪律：405[3012] 终止性错误、不自动重试风暴、单实例单账号假设、复刻官方续期节奏 |
| C12 | 交付含真账号端到端验收：固定 42k 请求体 + quota 差值读数（复用 zcode-rate-test 方法论），判定线 PAT 路由 3-6 / 基线 14-15 |
| C13 | 插件目录名 `zcode-plan`、凭据引用名 `ZCODE_PLAN_PAT`（两线独立一致；引用名已复核与现有 refs 无冲突，现有仅 ZAI_CODING_CN_API_KEY） |
| C14 | T0 探路 spike 纳入任务（B 线提出、A 线假设池反向印证）：① org/project 发现端点 ② authorize 对 loopback redirect_uri 的校验 ③ 同 Key 并发多 PAT 是否互斥 |

## 二、分歧与裁定（F1–F6）

| # | 分歧 | A 线 | B 线 | 裁定 / 去向 |
| --- | --- | --- | --- | --- |
| F1 | 路由注册方式 | bundle patch 向 llm-pi-ai 自动追加（T6 实测合并语义，失败降级手动） | 插件不动配置，README 手动样例 | **用户决策 → bundle patch 自动注册**（Q1）；机制可行性已查证（研究文档 §8.5「外部 bundle 排在 base 之后即可 patch base 的行」+ multi-root disable+insert 先例）；合并语义深合留给 T6 `--dump-config` 实测；README 手动样例保留为降级文档 |
| F2 | 登录主入口 | `/zcode-plan login` 斜杠命令 + 通知卡 | `ctx.authorization.registerFlow`（Web GUI 现成发起入口） | **事实裁定 → authorization flow 为主**：dsh-authorization README 明文「任何界面都能发起尝试」「能渲染一个 flow 的界面就能渲染全部 flow」；flow 词汇 `notice(url)` + `prompt(text)`（官方设计即支持「手输码与浏览器回调赛跑」）原生覆盖 URL 回显 + paste 回退。斜杠命令保留为 status 查询补充（user-commands 先例） |
| F3 | PAT 续期提前量 | 官方 120s+jitter | 加大到 ~300s（无 401 拦截，竞态窗口） | **裁定 → 默认 120s+jitter 贴官方，做成 Config 可调**；E6（retryPolicy 合格 code 扩展）使竞态 401 可自愈，无需激进提前量；实测不可接受再上调 |
| F4 | 路由名 / Key 名 | zcode-plan / zcode-plan-bridge | zai-coding-pat / zcode-dsh-bridge | **用户决策 → zcode-plan / zcode-plan-bridge**（Q3/Q5；zai-coding-zcode 移除后无区分顾虑） |
| F5 | 任务结构（有无 T0 spike） | 无独立 spike（假设分散 T8） | T0 spike 先探三未知 | **裁定 → 采纳 B 的 T0**（A 的 A1/A3/A8 假设池反向印证其必要性） |
| F6 | 模型请求 401 感知 | T4 有「401/INVALID_CREDENTIAL 触发强制刷新钩子」 | R4：注入型架构插件看不到模型 401 | **事实裁定 → B 成立**：dsh-llm 事件面仅 `llm/adapters-updated`（无载荷）与 `llm/stream` waterfall（内部分发）；pi-ai auth context 只覆盖「已安装提供方」与 `llm-pi-ai/<provider id>` 记录。A 的钩子无挂点，弃；缓解 = E6 |

## 三、单边遗漏核验（绝不因单边而丢弃）

**A 线独有（全部成立，纳入）**：价值量化口径（28000 → ~100000 等效额度，1.5x 为底线表述）；T9 web phase 2 任务行；用量 API 聚合延迟 1–2 分钟（status 标注时间戳）；斜杠命令注册先例（user-commands）；paste 回退交互（经 F2 裁定改由 flow `prompt(text)` 承载）。

**B 线独有（全部成立，纳入）**：五反例存档表（指纹/UA/端点/JWT 直发/scene3+PAT——防规划回潮，进 design 事实节）；PAT 落盘偏离官方「仅内存」红线的合规论证（→ Q2 用户拍板接受 + 文档声明）；凭据引用名冲突检测（T4 运行时点名拒绝）；多实例 PAT 互斥未知（T0 spike ③）；org/project 发现端点未知（T0 spike ①，降级 = Config 手填）；折扣健康度比值告警线（credits/token 比对照）；credentials-local 真文件集成测试；官方 PAT 规范（model-provider-project-access-token.md）作为契约来源；envelope 成功码兼容（数字或字符串 0/200）。

**冲突消解**：A 的 N2「不读官方 CLI 凭据」（非目标）vs B 的 R8 降级方案「读官方 CLI 凭据导入」→ 裁定：MVP 坚持非目标不读；B 的降级路径仅作为 T0 spike ②（redirect_uri 校验）失败时的备案记录在 design，不进 MVP 任务。

## 四、自行裁定依据（查证记录）

1. **dsh-authorization**（README.zh.md）：flow 注册表 + `session.notify({url})` + `prompt(text/secret/select)` 与回调赛跑语义 + 「任何界面都能发起」→ F2 裁定。
2. **dsh-llm**（README.zh.md）：失败以稳定 code 到达消费方；事件面仅 `llm/adapters-updated`；「本服务从不自行重跑请求：重试是 dsh-llm-retry 的职责」→ F6 裁定。
3. **dsh-llm-pi-ai**（README.zh.md）：`apiKeyEnv` 按请求经凭据 seam 解析、热轮换；auth context 仅覆盖已安装提供方 → C2/F6。
4. **multi-root-workspace 研究文档 §8.5/§9.5**：外部 bundle 可 patch base 行；`--dump-config` 可离线做组合断言 → F1。
5. **dsh-llm-retry**（README.zh.md）：normal mode 合格 code = EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT（不含 AUTH）；retryPolicy「可更改其有界预算、合格 code 与退避」→ E6。
6. **~/.dsh/.credentials.yaml 键名复核**（脱敏）：现有 refs 仅 `ZAI_CODING_CN_API_KEY`，无 ZCODE_PLAN_PAT 冲突 → C13。

## 五、探索审视（补双边盲区）

| # | 发现 | 处置 |
| --- | --- | --- |
| E1 | headless profile 禁用托管凭据存储（dsh-headless README）→ zcode-plan 在 headless 下不可用 | README 装机面声明；非目标边界 |
| E2 | 凭据存储跨 profile 全局共享 → PAT owner 只需在一个 profile 运行，其他 profile 路由同样消费 ref | README 说明单 owner 多消费 |
| E3 | PAT 换发走 JWT+keyId（管理面），Key Secret 创建后即可丢弃、只持久化 keyId | 纳入 design：机密面最小化，Key Secret 不落盘 |
| E4 | dsh-atomic-write 锁语义：写路径设计为「网络在锁外、锁内纯文件」，默认 waitMs 足够 | design 注意事项 |
| E5 | PAT 效期计算用服务端返回的 expiresAt 绝对时间，消除容器时钟漂移影响 | design 实现要点 |
| E6 | retryPolicy 合格 code 可配置 → 为 zcode-plan 路由把 AUTH/INVALID_CREDENTIAL 纳入合格 code，续期竞态 401 重试时拿到新 PAT 自愈 | **重大缓解**：随 F1 bundle patch 默认带上；缓解 B-R4 与 F3 |
| E7 | 移除 zai-coding-zcode 前 agent-default-model 指向它，需先切默认路由（用户 scope 修订衍生） | 迁移指南任务步骤 1 |

## 六、设计树与前沿分轮问答

**设计树**：路由注册方式（F1）→ 挂靠 T6 合并语义实测、retryPolicy 默认值、安装体验；PAT 落盘边界（B-3）→ 依赖通道共识（C2），反向挂靠整体架构；命名（F4）→ 发布契约；旧路由移除（用户发起）→ 挂靠回退路径定义与迁移指南。三支互不阻塞，同轮为前沿。

**第一轮**（3 问）：
- Q1 路由注册方式 → **用户选：bundle patch 自动注册**（含 retryPolicy AUTH 合格 code 默认、T6 实测把关、手动样例降级）。
- Q2 PAT 落盘 → **用户选：接受写入凭据存储 + 文档声明偏离**。
- Q3 命名 → 用户未选组合，给出 scope 修订：「现有的zai-coding-zcode已经证明1.5x无效，可以移除了」→ 生成第二轮。

**第二轮**（2 问）：
- Q4 旧路由移除落点 → **用户选：提案含迁移指南任务**（切 agent-default-model → 删 zai-coding-zcode 路由行 → 验证新路由就绪；回退路径定义改为 zai-coding-cn；移除动作实施期由用户按指南执行，profile 不在仓库 scope）。
- Q5 命名（更新理由后重问）→ **用户选：zcode-plan / zcode-plan-bridge**。

## 七、Scope 修订（用户发起，两处）

1. **移除 `zai-coding-zcode` 路由**：原共识「N6 旧路由保留回退」修订为「zai-coding-zcode 废弃移除，回退路径 = zai-coding-cn（普通 API Key，现默认路由）」；提案 tasks 含迁移指南任务（E7）。
2. 其余 scope（bigmodel.cn 国内站单账号、MVP host-only 等）不变。

## 八、结论

前沿为空：A 线 D1–D6、B 线 6 项、分歧 F1–F6、单边遗漏、审视项全部落定，无静默假设。
设计定稿要点：纯 host 半凭证桥 `zcode-plan`（登录 flow → name+scene 双条件 find-or-create `zcode-plan-bridge` Key → 官方契约 PAT owner → `ZCODE_PLAN_PAT` 引用发布 → bundle patch 注册 `zcode-plan` 路由（retryPolicy 含 AUTH 合格 code）→ 迁移指南移除 zai-coding-zcode）。
待用户确认「已达成共识 / 可以落档」后进入阶段 1.7 代码设计。
