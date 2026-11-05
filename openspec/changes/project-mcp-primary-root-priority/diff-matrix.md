# diff-matrix — project-mcp-primary-root-priority（阶段 1.5 收敛留痕）

> 编排：并行双线（team 驱动，成员 `spec-plan-…-line-a` / `line-b`，均 fresh、无回退）。
> 路由留痕：team 编排下 `lineA`/`lineB` 映射值不应用（成员锁定 Lead 模型 glm-5.3）。
> 输入：`line-a.md`（方向 A：需求/价值/边界）+ `line-b.md`（方向 B：实现/约束/反例）。
> 本文件落档后复制入 `openspec/changes/project-mcp-primary-root-priority/`，落档副本为权威。

## 1. 三分类矩阵（第 1 步交叉比对）

### 共识（两线一致，直接采信）

| # | 结论 |
| --- | --- |
| C1 | 根因 = `attribution.ts` `update()` 把 primary 与 granted 混排一张 canonical 表（registry 顺序）+ `attribute()` 逐层 `find` 首条命中（主会话复核 attribution.ts:66-96 属实） |
| C2 | 方案 = 逐层上溯不变、**层内两轮匹配**（先 primary 轮后 granted 轮）、跨层维持最近层优先（推荐，终裁见决策项 Q1） |
| C3 | `roots.ts` / `scan.ts` 零改动（scan 的 serverName 先到先得仲裁依赖有序 root set） |
| C4 | isolation 三面（tool / name / resource）单点派生自 `ports.attribute(cwd)`（isolation.ts 结构 + `index.ts:97` 端口），归属改判自动跟随、隔离侧零改动（两线独立读码 + 主会话复核） |
| C5 | 测试核心四组：A.primary=B.granted（B 在 registry 前）→ 归 A（bug 回归）；仅 granted → 归 B；层级竞争按 Q1 裁定断言；无命中 → null（fail-closed 不变）；既有 7 用例保持绿（基线 7/7 实跑） |
| C6 | `openspec/specs/dsh-project-mcp/spec.md:107` 归属判定句「逐级向上找最近的已登记根」无 primary/granted 之分，须随本变更改写（主会话核实原文） |
| C7 | 归属返回的 `roots` 仍是赢方 workspace 完整根集合——变的只是谁赢，不是赢者可见范围 |
| C8 | dotfiles 仓 `dsh/README.md` 约 L305 待改句已定位原文：「由 `dsh-plugin-project-mcp` 扫描并按工作区隔离，**只有 opc 工作区**（主根，或以 opc 为附加根）的会话可见 `mcp__dbx__*`」（仅列句，dotfiles 侧另行处理） |
| C9 | attribution.ts 模块头注释（现「nearest level that IS one of the registered roots」设计说明）改写为最终规则的设计说明（需求边界 3 落点） |

### 分歧（两线结论不同）

| # | 分歧 | 裁定去向 |
| --- | --- | --- |
| F1 | 发布版本号：A 线 1.5.1（patch，归属正确性修复）vs B 线 1.6.0（minor，对外可见行为变化） | 不可查证（策略取向），两线均确认不影响实现结构 → 不派复算，列决策项 Q3 |
| F2 | 改动面：A 线含插件 README:55-56「归属判定」段改写；B 线改面仅 attribution.ts + test | 第 2 步自行裁定（见下 R2） |

### 单边遗漏（逐项核验，绝不因单边丢弃）

| # | 来源 | 内容 | 核验结果 |
| --- | --- | --- | --- |
| U1 | A | 插件 README:55「归属判定」段须同步改写 | **成立，纳入改面**（主会话读 README 核实：现行描述「最近命中的那个根所属工作区」与目标语义不符） |
| U2 | A | README:115 冒烟表「/tmp（无归属）」记录已失效须加注/重测 | **不成立**（该表是独立 DSH_HOME 同构实例的历史记录，非本机断言；修复后 fail-closed 用例依然成立）——可选加注，非必要改动 |
| U3 | A | 本会话 additional roots 含 /tmp、/home/docker/.cache 来源未查明 | **范围外事实**（宿主概念与插件 attribution 无关，归属只读两个 registry；见审视 E3） |
| U4 | B | web profile 是 link 安装（symlink → 本仓），仓库重建重启即生效 | **成立**（readlink 实证）——修正 A 线任务 7「三 profile 一律 tag 安装」 |
| U5 | B | acp/headless 是真实拷贝、停 v1.1.1，须走 tag 安装 | **成立**（package.json version 实证） |
| U6 | B | 表更新撕裂风险：`update()` 应本地建全量两表后一次提交 | **成立**（现行 `update()` 先赋 workspaces 后建表，确有撕裂窗）——纳入实现要点 |
| U7 | B | granted 复述 primary（`granted()` 可能回含主根，roots.ts 已注明） | **成立**——两表各存各的、每层 primary 先查使其无害；须测试用例锚定 |
| U8 | B | 存量会话语义：工具面下次 `tools/change`、资源面下次 `agent/created` 才跟随 | **成立**（既有边界非本次引入）——验证步骤明确「开新会话」 |
| U9 | B | acp/headless 跨 4 个 minor 升级的随车差异未逐一审计 | **成立**——升级后逐 profile 过验证；是否随轮升级列决策项 Q4 |
| U10 | B | `workspaceRegistry.list()` 顺序 = 存储 `workspaceIds` 数组序 | **主会话实证采信**（解析 storage：#8 opc / #10 dotfiles / #11 dsh-plugins / #12 os(path=/home/docker)，与需求现象吻合） |
| U11 | B | 测试用例 d（双授予 tiebreak：registry 首者）、e（granted 复述 primary 的路径完整性） | **成立，纳入测试面**（本机 dotfiles 被 opc 与 /home/docker 双授予，tiebreak 非理论场景） |

## 2. 自行裁定记录（第 2 步，可查证项不转提问）

| # | 查了什么 | 结论 |
| --- | --- | --- |
| R1 | attribution.ts 全文、roots/scan/isolation/index 关键段 | 两线引用的代码事实全部属实 |
| R2 | 插件 README:53-62、:107-125 | U1 成立（README:55 必改）；U2 不成立（独立实例历史记录）→ 改面含 README 归属判定段 |
| R3 | 容器 `~/.dsh/storages/{workspace,multi_root_workspace}.json` 全量解析 | 登记顺序 #0-#12 如 U10；授予关系：opc→[dotfiles(11-05 03:26 新增), apigen, /home/docker/.cache, /tmp]；/home/docker→[dotfiles, docker, dsh-plugins]；cloud-the-sky→[skills]；dsh-plugins→[dotfiles]；**dotfiles→[dsh-plugins(11-05 03:34 新增)]** |
| R4 | 三 profile 安装形态 | U4/U5 成立（web=LINK→本仓、acp=1.1.1 拷贝、headless=1.1.1 拷贝） |
| R5 | 容器 dsh 版本与插件 peer | dsh=0.2.1-rc.5；project-mcp peerDependencies `@deepseek-ai/dsh >=0.2.1-rc.5 <0.3.0` 满足，升级不阻塞（注：dsh 范围在 peerDependencies 而非 engines.dsh，AGENTS.md 表述与 package.json 实况的细微出入不影响本次规划） |
| R6 | spec.md:107 原文、dotfiles README 待改句原文 | C6/C8 的行号与内容属实 |
| R7 | A 线待决 3 / B 线 D3（openspec 提案先后） | **降级为流程事实**：本流程落档即产出 openspec 变更（specs delta 就是 spec.md:107 的修订载体），「提案先行」由流程自身满足——无需问用户 |
| R8 | 复算必要性（第 3 步） | 唯一真分歧 F1（版本号）不满足「影响方案走向」（两线均确认实现结构不变）→ 不派第三线，列决策项 |

## 3. 探索审视（第 4 步，加载 openspec-explore；补双边盲区）

| # | 发现 | 处置 |
| --- | --- | --- |
| E1 | **双边盲区（重大）**：dotfiles(#10) 也 grant 了 dsh-plugins（今天 03:34 添加）——#10 的 granted 条目抢在 #11 自身 primary 之前，**dsh-plugins 目录会话现状归属 dotfiles**（docker logs 实锤：`cwd=…/person/dsh-plugins roots=2 visible=[]`，roots=2 = dotfiles 根集合）。B 线「dsh-plugins 侥幸正确」结论**错误**（漏算该授予）；两线沙盘的「行为变化面恰好等于 bug 本身」修正为「变化面 = dotfiles 系（opc→dotfiles）+ dsh-plugins 系（dotfiles→dsh-plugins）」。visible 碰巧双侧皆空故无感知 | 修正合并视图；发布说明点名两系变化；测试用例 a 已覆盖同构场景 |
| E2 | A 线验证断言「dotfiles 会话 roots=1」**有误**：修复后 dotfiles 会话归 dotfiles workspace，root set = [dotfiles, dsh-plugins(granted)] = **roots=2**（visible=[] 仍成立，两根均无 `.dsh/mcp/`）；日志历史行 `roots=1` 是 03:26 前旧况 | 修正验证断言：dotfiles 重启后 `roots=2 visible=[]`、无 dbx/figma/yunxiao |
| E3 | 本会话 additional roots=[dotfiles, /home/docker/.cache, /tmp] 与归属推演（dotfiles root set=[dotfiles, dsh-plugins]）不匹配 → 宿主另有根来源机制，与插件 attribution（只读两个 registry）无关 | 范围外事实记录（= A 线风险 6），不升级为待决，不改范围 |
| E4 | 「#12 os」与「/home/docker」非矛盾：workspace title=os、primary path=/home/docker（storage 实证两者同一） | 术语澄清入设计说明 |
| E5 | B 线两 Map 草图中 `primaryTable.set` 为覆盖式（后写胜），与 A 线「同层多 primary 取 registry 首条」及混排表 find 首条语义**相反** | 提示设计线：primaryTable 须「首写保留」（`if (!has) set`），与 grantedTable 同法，保持 registry 顺序 tiebreak 一致 |
| E6 | 软依赖降级（multi-root 缺席 → 只扫主根）下两轮方案自然退化为一轮 primary，无需特判 | 设计说明须写明该退化 |
| E7 | 双向授予（A grant B 且 B grant A，本机 dotfiles↔dsh-plugins 实况）已被用例 a（A.primary=B.granted→归 A）本质覆盖，不必另立用例 | 测试面不加重复用例，说明即可 |
| E8 | dsh-plugins 系修复前后日志同形（roots=2 visible=[]），实机无法从该行区分归属变化——若需实证该系变化，须临时在 dotfiles 或 dsh-plugins 根放探针配置（冒烟方法） | 可选加强验证，写入任务备选 |

## 4. 决策项与问答记录（第 5 步，grill-me 设计树·前沿第 1 轮）

前沿 4 问（互相独立，一轮问完；每题附推荐与来源）：

| Q | 问题 | 推荐 | 来源 | 答复 |
| --- | --- | --- | --- | --- |
| Q1 | 跨层竞争：近层仅 granted 命中、更远层 primary 命中，谁赢 | a 最近层优先、层内 primary 优先（`.cache` 下会话归 opc） | 双线共识推荐 + B 线反例（另一案致超范围行为变化、嵌套授予失效） | **✅ 近层赢**（用户第 2 轮确认；首问措辞不通俗，举例重问后选定） |
| Q2 | 共享根/双授予裁定 | 显式授予即归属、无授予 fail-closed、双授予按 registry 顺序首者、不做路径特判；设计说明写明 commonRoots 启用后的退化边界 | 双线共识推荐 | **✅ 按推荐落定**。用户答复为核心意图锚点：「我只想当 dotfiles 作为独立工作区时，不要加载任何不属于它的 mcp/skill 等工具」——由 primary 轮赢直接保证（主会话明确陈述此对应关系，非静默假设）。附注：修复后 dotfiles 会话根集合 = [dotfiles, dsh-plugins]（用户自己授予），若要完全独立可自行撤销该授予（用户配置操作，不在本变更范围） |
| Q3 | 发布版本号 | 1.6.0（minor） | B 线推荐 + semver 惯例（A 线推荐 1.5.1，两线相左故上浮） | **✅ 先不发版不推送**——发版（pnpm release/tag）、push、profile 升级整体后移为后续动作，版本号留待发版时再定；本变更 tasks 不含发版执行，升级步骤仅文档化 |
| Q4 | acp/headless（现 1.1.1）是否随轮一并升到新 tag | 一并升 | A 线任务默认 + B 线推荐 A 选项 | **✅ 仅 web 先行**——web 是 link 安装（改完重建重启即生效）承担验证；acp/headless 留 1.1.1，升级步骤写入文档并标注暂缓 |

第 2 轮前沿重算：Q1 定 → 层级竞争测试断言方向定；Q2 定 → tiebreak 测试定；Q3/Q4 定 → tasks 结构定（发版后移、验证以 web link 先行）。**前沿为空，收敛结束（第 7 步）**。未被任何裁决吸收的原始决策意图（用户 Q2 原话）作为需求锚点随落档进入 proposal。
