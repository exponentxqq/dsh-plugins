# diff-matrix：optimize-architecture（并行双线收敛记录）

> 输入：`line-a.md`（A 线：需求与价值、范围与边界）+ `line-b.md`（B 线：实现与约束、反例与风险）。
> 编排：并行 team 驱动（两线均具名成员，fresh，无回退；`--model` 未预置，team 编排下 lineA/lineB 路由不应用）。

## 一、三分类矩阵（交叉比对）

### 共识（两线一致，直接采信）

| # | 共识项 | A 线锚点 | B 线锚点 |
| --- | --- | --- | --- |
| C1 | 共享件只进 devDependencies（`workspace:*`）+ 构建期内联进各自自包含 `lib/`；禁入 `dependencies`（git tag 单目录安装解析不到） | §0.5 安装模型铁律、§3 第一取舍原则 | 硬边界 1、M4 ④ |
| C2 | multi-root-workspace 不纳入统一构建/统一 peer：仅对齐命令与约定层，构建内核（tsc+tsdown、精确枚举、ADR 体系）不动 | P3 推荐 b | M6 明确不做 + 非目标 2 |
| C3 | 收敛顺序：构建脚本 → 配置模板 → 测试资产先行（「死的重复」），运行时源码共享谨慎渐进 | S1/S2 优先、S3 谨慎试点制 | M1–M3 推荐、M4 可选须拍板 |
| C4 | 产物等价性是重构安全网：迁移前后 `lib/` 基准（哈希 / requiredWords·importedWords 模块词集合逐字比对） | 验证思路 1、T1 | 验证思路 2、T1 |
| C5 | 安装矩阵冒烟为验收红线：`link:` 本地安装、tag+`&path:` 安装、pnpm 10/11 构建授权路径、四格组合矩阵 | 验证思路 3 | 验证思路 3 |
| C6 | 升级链保持并强化单点性（dsh-baseline → upgrade → check → release），架构收敛后 dsh:check 增配一致性守护 | G3、T4 | 目标 1、T2/验证 6 |
| C7 | 分发方式不变：git tag 锚点、不发包 npm、统一版本 + 单 tag 不拆 | 非目标、A1 | 假设 1/2 |
| C8 | 重复已实证发生（build.mjs×6 漂移、tsconfig 4+2 分裂、stubs×3、attribution×3） | §0.3 实测 | §1 目标 1、L1–L3 实测 |
| C9 | 运行时共享须控制爆炸半径：字面量直写纪律不破坏（bundle 断言不稀释）、共享常量反例认知 | S3 取舍 | R1、M4 ②③ |
| C10 | 内部包误入 dependencies 的机器断言（dsh:check 增项） | —（T4 守护思想一致） | R2、T4 |

### 分歧（两线结论不同 → 裁定/复算/决策）

| # | 分歧点 | A 线立场 | B 线立场 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | 共享构建工具形态 | workspace 内部包 `tooling/`（devDep 版本锚定、类型友好、IDE 解析好） | 根级 `scripts/build-kit`（已有跨包 import `scripts/dsh-baseline.mjs` 先例、不进产物、零安装面） | 复算线 1（panel 路由）→ 并入第 5 步决策 |
| F2 | 运行时源码共享节奏 | 本次内试点 1–2 个纯函数（P2 推荐 b，T6） | M1–M3 先行，host 语义单独立项带行为 diff 清单（Q1 推荐 A→B 分段） | 复算线 2（panel 路由）→ 并入第 5 步决策 |

### 单边遗漏（逐项核验，绝不因单边而丢弃）

| # | 单边项 | 来源 | 核验结论 |
| --- | --- | --- | --- |
| O1 | 契约类型包 `@dsh-plugins/contracts`（座位契约是否抽出 holder） | A-P4 | **成立但倾向维持现状**：归档 D2/D3/D4 已定 holder 发 d.ts 为类型权威 + import type 纪律 + bundle 断言，B 线硬边界 2 与之相容；留第 5 步轻量确认 |
| O2 | 漂移守护挂载点（dsh:check vs 独立 arch:check） | A-P5 | **成立**：两线倾向 dsh:check（A 推荐 a；B「可挂进 dsh:check 或单独脚本」）≈共识，第 5 步轻量确认 |
| O3 | 最小 CI（push 跑 verify） | A-P6 | **成立**：B 未提；A 推荐另立事项。第 5 步轻量确认（本次范围边界） |
| O4 | 联动模式标准化（座位契约/半承载通道/host 解析沉淀为可复用契约层） | A-G4 | **成立且需调和表述**：落点限定「文档化 + 类型契约」，不新增运行时耦合边（与 B 硬边界 2/D13 一致）；不另立决策 |
| O5 | 基线冻结任务（迁移前记录 lib/ 基准哈希） | A-T1 | **成立**：B 验证思路 2 等价覆盖（模块词集合），合并入任务拆分首批 |
| O6 | 测试资产收敛（stubs 底座分层 / bundle 断言工厂 / locale-parity 参数化） | B-M3 | **成立**：A 未提；stubs 查证为有意分层（见裁定 4），收敛须「公共底座+插件扩展」，纳入任务拆分 |
| O7 | pnpm catalog 迁移 + upgrade-dsh.mjs 适配必须同批 | B-M2/Q4/R4 | **成立**：A 未提；真实耦合风险（不同批=下次 dsh:upgrade 静默写坏清单）。第 5 步决策（迁 or 不迁） |
| O8 | 豁免清单生成化（minimumReleaseAgeExclude 300+ 条） | B-M5 | **成立**：upgrade-dsh 内部优化、低风险低收益，纳入任务拆分尾部（不决策） |
| O9 | 字面量直写反例（共享常量致断言退化） | B-R1 | **成立**：纳入验收断言（共享化后字面量断言数不减少） |
| O10 | attribution 三份行为等价性风险（两轮 tier vs 简化路径） | B-R6 | **成立**：为 F2 决策的关键输入（试点/立项均须先做行为 diff 清单） |
| O11 | tsconfig 漂移裁决 | B-Q5 | **已自裁**（见裁定 3），不进决策 |
| O12 | 内部包版本策略 | B-Q3 | **成立**：依赖 F1/F2 结果；若引入任何共享包，推荐随仓库统一版本（release/check 已按全仓同版本设计）——第 5 步视前置答案问或不问 |
| O13 | monorepo 布局（平铺 vs 分组 vs packages/） | B-Q2 | **两线均倾向维持平铺**（A 隐含：范围表不提议重排；B 明确推荐 A 且有 v1.3.0 改名教训）；因用户需求点名「优化 monorepo 结构」，第 5 步确认 |

## 二、自行裁定（可查证项，主会话查证）

| # | 查证项 | 查了什么 | 结论 |
| --- | --- | --- | --- |
| 裁定 1 | 根级 scripts 跨包 import 先例 | `grep plugins/*/test` → `workspace-config/test/bundle.test.ts:33` import `../../../scripts/dsh-baseline.mjs` | **成立**：B-M1 的先例证据真实；不改变 F1 为分歧的事实 |
| 裁定 2 | `workspace:*` devDep 在 git 安装下安全 | 归档 `2026-11-05-unify-workspace-config-entry` design.md D12 + 假设 A5 | **成立**：探针 P1 已证 git 安装不装不改 devDeps，发布后真机复验 |
| 裁定 3 | tsconfig.base 4+2 分裂成因 | md5 分组 + `git log --follow`（user-commands 自创建 6cfea32 后从未更新）+ diff（差 2 行：`lib` 少 DOM/DOM.Iterable、无 `jsx:react-jsx`） | **漂移是债**（模板演进未同步，非有意差异）；Q5 裁定为对齐新版基准，模板化后 host 变体剥离 DOM/jsx 的细节留设计 |
| 裁定 4 | 三份 stubs 差异性质 | 两两 diff（405/414 行）+ 注释阅读（「替身只保留本插件用到的 DOM 形状」） | **有意分层非漂移**：M3 收敛走「公共底座+插件扩展」，禁止一步统一；B-R5 落定 |
| 裁定 5 | A-P2 首候选「宿主模块解析」重复 | `grep createRequire`：stt host-runtime ×5 vs multi-root roots.ts ×0（后者是路径 canonical 化语义） | **证伪 A 的首候选**：两处机制不同非逐字重复；运行时共享试点/立项的候选修正为 attribution ×3（173/112/126 行） |

## 三、分歧复算（第三线，panel 路由 fresh 子代理）

> 复算线不以任何既有草案为输入：只给中立分歧陈述 + 需求原文。

| 分歧 | 复算线 | 状态 | 结论 |
| --- | --- | --- | --- |
| F1 构建工具形态 | subagent b8279773（deepseek-official/deepseek-flash） | 已回执 | **甲**（workspace 私有构建包 + 薄声明入口）。与 A 线同向 → **2:1（A+复算 : B）**，形成结论仍需用户确认（第 5 步） |
| F2 运行时共享节奏 | subagent 4090680e（deepseek-official/deepseek-flash） | 已回执 | **乙（加强版）**，明确否决甲。与 B 线同向 → **2:1（B+复算 : A）**，形成结论仍需用户确认（第 5 步） |

### F1 复算结论摘要（第三线独立裁决）

- **裁决**：选甲——`tooling/build-kit`（`@dsh-plugins/build-kit`，private:true、0.0.0、type:module、仅依赖 esbuild、scripts 仅 lint/test），做成「构建策略库」；各包 build.mjs 降为 5–10 行薄声明入口。前提：策略从包事实推导（包名读 package.json、kind 由 `dsh.client.platform` / `src/client/index.ts` 推断、host external 默认 `['node:*']`）。
- **关键实测**：① 构建工具不在分发单元内——六包 `files` 均不含 build.mjs、profile 实装目录（project-mcp/web-ux）无 build.mjs、git snapshot 只列 dependencies → 甲/乙对安装模型**等价**，「lib 自包含」不能否定甲；② `workspace:*` 已有三包先例（v1.5.0 实测可装，装出 manifest 保留字段而依赖图不含）；③ 根级跨包 import 先例仅一处（测试读常量），外推成六个构建入口 import 带依赖的库是「类比不是同构」。
- **决定性理由（R2）**：根 package.json 全是 `pnpm -r run …` 递归命令、pnpm 递归默认不含 workspace root——乙的根级 kit **天然在 lint/test/typecheck 门禁之外（监督盲区）**；甲让 kit 成为普通 workspace 包、可带自己的测试（CSS 多模块去重、壳形状、host 零外部 import）直接进递归门禁。
- **其余理由**：R1 workspace:* 让声明/解析/安装/发现四件事同时成立，乙是 pnpm 看不见的边；R3 乙把 `../../` 写进六入口，monorepo 重排六点同步漏改即构建失败（与「优化 monorepo 结构」目标相悖）；R4 甲可同时容纳「构建期库」与未来「内联型运行时共享」；R5 与 workspace-config 类型契约的 workspace:* 机制同构（已验证机制的复用）。
- **风险与缓解**：K1 devDeps 永久带 `workspace:*` 进装出 manifest（今天无害；缓解=守卫断言只许 devDependencies + private:true + 0.0.0 + 挂 dsh:check）；K2 release/check/upgrade 只扫 plugins/* 的治理盲区（缓解=文档明写 kit 不在发布契约内 + 守卫断言 kit 依赖白名单仅 esbuild、无 DSH 包、scripts 仅 lint/test）；K3 递归命令面扩张（守卫断言 scripts）；K4 调试间接层（薄入口显式传 root、kit 日志带插件名）；K5 过度统一（kit 作用域锁死六个 esbuild 包，multi-root 不卷入）。
- **顺手修复**：统一 cssModulesPlugin 的「包+模块」data-dash-css 去重维度，顺手修 session-tool-toggle 潜伏的 CSS 去重 bug（现仅 1 个 module 未暴露）。
- **改判条件**：放弃 pnpm workspace / 出现「只 checkout plugins/<name> 子目录也能构建」硬需求 / kit 缩到 <30 行无依赖 / DSH 安装链开始装 devDeps。

### F2 复算结论摘要（第三线独立裁决）

- **裁决**：本次只收敛「死的重复」（构建/配置/测试资产）+ 补产物门禁与行为对照夹具；host 运行时语义源码（attribution/watcher/triggers/host-io）单独立项、带行为 diff 清单走 OpenSpec 正式变更。
- **前提纠正 3 处（实测）**：① 源码级包间依赖并非零——multi-root/stt/web-ux 三包 devDep `dsh-plugin-workspace-config: workspace:*`（ADR-0013 决策 3：编译期类型依赖）；② 三份 attribution 是 2 份近同构（project-mcp 173L / user-commands 126L）+ 1 份不同契约（stt 112L：无根集合、未登记回退 canonical cwd + warn，fail-open）；③ 安装模型铁律再确认（profile lock 只列 dependencies，devDeps 软链全断）。
- **行为等价性未证的实证**：近同构两份有 3 处会给出不同答案——update 并发窗口（快照旧表原子提交 vs 原地 clear 逐个 claim）、双工作区同 primaryRoot（主根表先写者胜 vs owners/roots 后写者覆盖自相矛盾）、roots[0]≠primaryRoot（按位置 vs 按值跳过）；project-mcp 8418f73 修复未同步到 user-commands（复制漂移实证）。
- **理由**（R1–R6）：合并前置是规范裁定非文件搬运（spec delta）；仓库已两次明文定「复制 + provenance」为既定模式（docblock 互证）；共享源码包是 monorepo 拓扑变更（release.mjs 遍历 plugins/ 每目录会崩 → 须落 plugins/ 外，pnpm-workspace/README/三脚本认知全动）；升级收益≈0（三份 attribution 只 import node:path，零 DSH 面）；可量化收益在资产层（tsconfig.base×4 全同、host 构建驱动 3 份同一 51–58 行、stubs 行重合 44–50%）；先例性反转须 ADR 级论证。
- **乙的风险缓解**：漂移继续 → ① user-commands 并发窗口作独立 bug 修复（对齐 project-mcp 已证规则）② 跨包行为对照夹具（同场景表跑两套 Attributor）③ docblock 互加 provenance 指针；机制后置无限期 → 写死触发条件（第 4 个消费方 / 归属规则变更 / DSH 大版本）+ 本次预置机制选型；资产收敛过度设计 → 只抽无分支部分、先 2 包验证再推广。
- **验收清单增量**：④ **真缺口**——产物自包含门禁只有 4 包有 bundle 断言，三个 host-only 包（project-mcp/user-commands/zcode-plan）没有；补共享「产物契约检查」（host 只允许 `node:*` 与声明过的 external 词）——这正是未来内联共享源的安全网；⑥ 预立 openspec 提案 `host-attribution-consolidation`（design.md 附 diff 矩阵 + 机制选型 + 触发条件）。
- **补充优化方向（需求点名要求）**：① 插件脚手架/模板生成（防第 4 份复制的正解）；② 验证分档（verify 现=递归 verify:all 且 multi-root smoke 需运行中 dsh，缺 fast/full 两档）；③ 「不变式只有部分包落地」比重复更贵——bundle 纯度、docs:check 类门禁统一成共享检查；④ 明确「上游已有就用上游」选型规则（`@deepseek-ai/dsh-atomic-write` 好先例；上游 `resolveByPath` 无祖先上溯=本地实现合理存在的依据，写进 design）。

## 四、探索审视（补双边盲区，openspec-explore 姿态）

- **新发现 1（lint 配置面）**：`.oxlintrc.json` 仅 3 份（stt=workspace-config 同 md5；multi-root 独立=fork 有意），其余 4 包无配置走默认——轻度不一致，纳入配置收敛小项（一致性白名单），非决策。
- **新发现 2（files 字段）**：六软插件 `files` 形态一致（`lib/**/*.js`+`src`+`cordis.patch.yml`）；workspace-config 多 `lib/**/*.d.ts` 为 D4 类型权威有意差异；multi-root 为 fork 形态。**已核验，无需动**。
- **新发现 3（src 目录约定不成文）**：host-only 三包 `host/`+`index.ts`、双端三包 `client/`+（`host/` 或根模块）——约定存在但不成文；「新增插件脚手架清单」文档任务（A-T8/B-T5）应涵盖此内容点。
- **审视排除 1（换构建器）**：六软插件换 tsdown/统一构建器——审视后排除：esbuild 直用已被 6 包验证，build.mjs 骨架含深度定制（cssModulesPlugin/ModuleLoader 壳/require banner），换构建器使 bundle 字节断言全变、收益（产 d.ts）仅 workspace-config 需要（已用 tsc 单独产）。
- **降级待决**：Q5 → 裁定 3；O1 契约类型包两线相容（维持现状倾向）；catalog 与 `minimumReleaseAgeExclude`/`allowBuilds` 交互未实测（B-R8①）——留实施期验证项，不阻塞 Q4 决策（推荐附「同批适配」条件）。
- **共识细化（O4 调和）**：「便于插件联动」的落点 = 座位契约/半承载通道/host 模式的**文档化 + 类型契约**，不新增四包间运行时加载边（D2/D3/D4/D13 继续有效）。

## 五、设计树与前沿分轮（grill-me）

### 设计树总览

```
optimize-architecture
├─ Q1 构建工具形态（F1）─→ 甲：tooling/build-kit 私有包
├─ Q2 运行时共享节奏（F2）─→ 用户自定义：一次性做到最优，不留代办（否决乙加强版的单独立项）
│   ├─ Q5 attribution 并发 bug ─→ a：并入本次独立任务组
│   ├─ Q6 语义共享范围 ─→ 全做（attribution 内核×3 + triggers/watcher/host-io/roots×2；locales 排除）
│   └─ [自裁] stt 策略保留（内核共享+未命中策略参数化——stt「未登记可承载工作区档」是其 spec 背书语义）
│       [自裁] user-commands 规范对齐以 project-mcp 为蓝本（两包 spec 本就同义，主根压倒附加根+先到先得+fail-closed）
│       [留设计] #3 roots[0]≠primaryRoot 异常裁定（两包 spec 均未覆盖的规范空白）
├─ Q3 monorepo 布局 ─→ a：维持 plugins/* 平铺 + 顶层 tooling/
├─ Q4 pnpm catalog ─→ a：迁 + upgrade-dsh.mjs 同批适配
├─ Q9 脚手架形态 ─→ 模板生成命令 pnpm gen:plugin
│   └─ Q11 dsh-plugin-writer skill 同步 ─→ 纳入本次（跨仓 dotfiles，独立任务组单独 commit）
└─ Q10 最小 CI ─→ 本次做（GitHub Actions：install→lint→typecheck→build→test→dsh:check；multi-root smoke 分档/skip）
```

### 问答记录

**第一轮**（5 问，2026-11-06；第一版因「选项缺举例说明」被用户打回，补例重问后通过）：

| # | 问题 | 答复 | 来源 |
| --- | --- | --- | --- |
| Q1 | 共享构建工具形态 | **甲**：tooling/build-kit 私有包（@dsh-plugins/build-kit，private、0.0.0、仅依赖 esbuild；薄声明入口；kit 自带测试进递归门禁） | 复算 2:1 + 用户 |
| Q2 | 运行时共享节奏 | **未选选项，自定义「一次性做到最优，不要留代办」**——否决乙加强版的「单独立项延后」，本次完成运行时语义收敛 | 用户 |
| Q3 | monorepo 布局 | **a**：维持平铺 + 顶层 tooling/（安装面零破坏） | 两线共识 + 用户 |
| Q4 | pnpm catalog | **a**：迁 + upgrade-dsh 同批适配 | B 线 + 用户 |
| Q5 | attribution 并发 bug | **a**：并入本次独立任务组（对齐 project-mcp 已证规则 + 测试 + spec 回归声明） | 复算线缓解① + 用户 |

**第二轮**（3 问）：

| # | 问题 | 答复 | 来源 |
| --- | --- | --- | --- |
| Q6 | host 语义共享范围（Q2 口径确认） | **全做**：attribution 内核×3（策略参数化）+ triggers/watcher/host-io/roots×2 对齐合并；locales×4 排除（自裁：文案文件非语义重复） | 用户（Q2 口径） |
| Q9 | 脚手架形态 | **模板生成命令**（pnpm gen:plugin <name> --kind）；并上浮新问题 Q11 | 复算线建议 + 用户 |
| Q10 | 最小 CI | **本次做**（GitHub Actions 最小门禁，multi-root smoke 分档/skip） | A 线 P6 + 用户 |

**第三轮**（1 问）：

| # | 问题 | 答复 | 来源 |
| --- | --- | --- | --- |
| Q11 | dsh-plugin-writer skill 同步调整（用户上浮；查证 5 处强耦合，实体在 dotfiles 仓） | **纳入本次**：独立任务组「G-doc-sync（所属仓：dotfiles）」，dotfiles 单独 commit | 查证 + 用户 |

### 降级裁定补充（第三轮前后查证）

- stt attribution 的「未登记目录可承载工作区档（registered:false + canonical cwd 键）」是其 spec 背书的业务语义（docblock 明文「spec：不要求先登记」），非复算线所称「退化」——共享形态定为**内核共享 + 未命中策略参数化**，不统一行为、不破坏任何包的 spec（自裁）。
- user-commands spec（「三层优先级与会话遮蔽」Requirement）与 project-mcp spec:107 **本就同义**（主根压倒附加根、登记顺序先到先得、fail-closed）——「以 project-mcp 为蓝本」= 回归两包各自 spec，非行为变更；docblock「不共享代码（可各自单独安装）」的旧结论由 ADR 正式推翻（构建期内联模式下两插件仍可各自单独安装，D12 探针背书）（自裁）。
- #3（roots[0]≠primaryRoot 契约被破坏时的行为）两包 spec 均未覆盖——规范空白，留阶段 1.7 设计线裁定并写入 spec delta。

## 六、收敛结论

**前沿为空**（9 项决策全落定、设计树每条分支走到、无静默假设项），阶段 1.5 收敛结束。合并方案概要：

1. **资产收敛（死的重复）**：`tooling/build-kit` 私有包（甲）收敛 6 份 build.mjs、tsconfig 根模板（对齐新版裁定）、stubs 公共底座+扩展、`.oxlintrc` 一致化、5 条逐字重复 scripts 模板化；三 host-only 包补产物自包含断言。
2. **运行时语义收敛（活的重复，一次性做）**：`tooling/host-kit`（命名设计线定）承载 attribution 内核（策略参数化：stt=canonical-cwd 键 / pm·uc=fail-closed）+ triggers/watcher/host-io/roots 两包对齐合并；devDep + 构建期内联，安装自包含、可各自单独安装不变；user-commands 并发 bug 修复（Q5-a）；行为对照夹具；ADR 推翻「不共享代码」旧结论。
3. **monorepo**：plugins/* 平铺不动 + 顶层 tooling/（Q3-a）；devDeps 迁 pnpm catalog + upgrade-dsh 同批适配（Q4-a）。
4. **扩展与守护**：`pnpm gen:plugin` 模板生成命令（Q9）；漂移守护挂 dsh:check（共识）+ 内部包禁入 dependencies 断言（C10）+ kit 治理断言（K2/K3）；最小 GitHub Actions CI（Q10）。
5. **跨仓**：dsh-plugin-writer skill 同步改版（Q11，dotfiles 仓单独 commit）。
6. **维持不变**：multi-root 边界（C2）、契约类型包维持 holder 导出（O1 共识）、字面量直写纪律（C9）、git tag 分发与统一版本（C7）、豁免清单生成化纳入任务尾部（O8）。

## 七、grill-me 追认轮（落档提交 600df68 之后，2026-11-06）

> 主题（用户拍板）：审视落档方案中未经用户直接拍板的残留决策。四轮十一问，前沿清空。

| # | 问题 | 答复 | 影响 |
| --- | --- | --- | --- |
| Q1 | 访谈主题 | 审视落档方案的残留决策 | — |
| Q2 | `#3` 裁定（roots[0]≠primaryRoot → 保根+诊断）追认 | **追认**（经实例详解：例 B 中 pm 现状会静默丢根 fail-closed 无日志；例 C 消除 uc 自相矛盾） | 维持 spec delta 原文 |
| Q3 | 类型检查形态（tsc -b → 双 `tsc -p --noEmit`、去 composite） | **接受** | 维持 D-1 |
| Q4 | 变更名 `optimize-architecture` | **追认** | — |
| Q5 | 契约类型包：维持 holder 导出 vs 抽 contracts | **本次顺带抽 `@dsh-plugins/contracts` 包**（推翻本文件 O1 共识与收敛结论第 6 条） | 触发 D-15 与工件修订（见下） |
| Q6 | 产物断言落点（D-7 上移仓级 vs 三包各写） | **追认 D-7**（1.6 表三行 bundle.test 矛盾以 D-7 为准） | 维持 tasks 原样 |
| Q7 | stt CSS 去重潜伏 bug 顺手修复 | **追认**（产物字节变化属预期，模块词硬断言不变） | 维持 G1 |
| Q8 | CI 边界（不跑需运行中 dsh 的 smoke） | **接受** | 维持 R5 |
| Q9 | contracts 权威形态 | **权威完全转移**（holder 与三贡献方全部直连；否决 holder re-export 双入口） | 见 D-15 / code-design 1.4b |
| Q10 | （推导项，未问）contracts 位置 = `tooling/contracts` | 按 Q3-a + D-9 推导；spec 层无需 delta（requirement「依赖仅限类型」查证后更成立） | — |
| Q11 | scope 变更落档方式 | **立即修订五工件 + 追加 commit** | 本轮修订即为执行 |

**本轮产生的工件修订**：proposal（四包/Impact/O1 修订）、design（D-15 + 追认记录 + G4 断言）、tasks（G4 新增 5.5 contracts 任务、5.6 收口顺延；G6 7.3 补 D4 修订验证）、code-design（一页纸四包、1.4b 触达面 C1–C4、D-15、G4 第 6 点、对应关系表修订）、本文件本节。`#3` 实例详解（例 A/B/C）以对话记录为准。
