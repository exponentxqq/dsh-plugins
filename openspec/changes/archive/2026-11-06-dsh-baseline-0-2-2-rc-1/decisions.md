# decisions.md — 2026-11-06-dsh-baseline-0.2.2-rc.1 收敛留痕(串行 grill-me)

## 设计树

```
根:DSH 基线 0.2.1-rc.5 → 0.2.2-rc.1 升级变更定案
├── Q1 收尾范围(仓库升级 / 发版批次 / 含官方包)
├── Q2 根 README·AGENTS.md 基线行历史漂移是否顺带修正
├── Q3 变更名
├── Q4 支持矩阵策略(追加 / 裁剪)
│   └── Q5 裁剪边界(仅当 Q4=裁剪)── 0.2.x 全留 / 0.2.1+ / 双版本 / 仅新基线
└── (事实自查,非决策)acp/headless 只装 project-mcp@1.1.1 软范围插件,
    「不发版」下不受 0.2.2-rc.1 宿主影响;官方包仅装在 web profile。
```

## 第一轮(2026-11-06,4 问全前沿)

| # | 问题 | 用户答复 | 仍待决 |
| --- | --- | --- | --- |
| Q1 | 收尾范围到哪一层 | **自定义**:「仓库升级但不发版,且把 browser-use/chrome-devtools-mcp 也一并升级」 | 否(官方包升级行为并入 tasks 收尾组,非独立决策) |
| Q2 | 根文档基线行历史漂移是否顺带修正 | 顺带修正 | 否 |
| Q3 | 变更名 | `2026-11-06-dsh-baseline-0.2.2-rc.1` | 否 |
| Q4 | 支持矩阵追加还是裁剪 | **裁剪旧项**(与推荐「追加式」相反) | 引出 Q5 |

## 第二轮(1 问,新前沿)

| # | 问题 | 用户答复 | 仍待决 |
| --- | --- | --- | --- |
| Q5 | SUPPORTED_DSH_RELEASES 裁剪到哪条线 | **只留 0.2.1+**:0.2.1-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1 共 3 项(去掉 0.1.x 六项与 0.2.0 两项,11→3) | 否 |

## 裁定依据与结论

1. **收尾范围 = 升级不发版 + 官方包升级**:
   - 本仓七插件走完整升级车道(probe→提升→enforce→全绿),web profile(link:)重启即生效;
   - **不 release、不打 tag、不重装 acp/headless**(实测它们只装 project-mcp@1.1.1,软范围兼容新宿主,无阻塞);
   - web profile 内官方包 `@deepseek-ai/dsh-browser-use`、`@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` 升至 0.2.2-rc.1(npm 已发版),目标:web profile 整体零 incompatible 警告;
   - 发版(v1.5.1)显式排除,留待 project-mcp-isolation-enforcement 收尾后另行决定。
2. **支持矩阵 = 裁剪到 0.2.1+ 三项**(策略变更,非纯提升):
   - allowlist 与 21 项 DSH peer 枚举同步收敛为 3 项逐项或;compat.spec.ts 的 join 断言与 CI releases 轴自动跟随;
   - ADR-0009 追加段须记录**裁剪决策及理由**(宿主已全量 0.2.2-rc.1,旧项为未再使用的回滚声明负担),并按需精简 0.1.x 历史叙述;
   - AGENTS.md H3、README/README.en、workflow 文档、.agent/note 同步。
3. **文档漂移顺带修正**:根 README.md / AGENTS.md 基线行(0.2.1-rc.2 → 0.2.2-rc.1 实况)。
4. **变更名**:`2026-11-06-dsh-baseline-0.2.2-rc.1`;/tmp 规划材料与落档目录同名。

## 收敛结束

两轮后前沿为空(所有衍生项为跟随性事实或规划默认,无静默假设);未答项:无。

## 落档分歧点轮(2026-11-06,阶段 1.7 上浮 6 条一次问清)

| # | 问题 | 用户答复 | 结论 |
| --- | --- | --- | --- |
| Q-A | web profile 重启实测由谁执行 | 操作者会话外执行(推荐) | agent 给命令与判据,操作者在会话外 `docker restart dsh` 并回报 |
| Q-B | 「插件都可用」验收口径 | 本仓+官方包(推荐) | 只承诺本仓七插件 + 两官方包零 incompatible;第三方 10 包只记录不升级,新警告上浮不扩面 |
| Q-C | schemastery 提升是否纳入脚本 | **纳入脚本**(否决设计线「维持人工」推荐) | 机制追问后选**从候选树推导**:upgrade-dsh.mjs 新增 schemasteryRequiredBy(npm view dsh-tools@target 声明,与 cordisRequiredBy 同构),自动重写三插件 devDep + 豁免 |
| Q-D | chrome-devtools-mcp 1.12.0 override | 保留(推荐) | 既有 profile 决策,非本变更范围 |
| Q-E | 与在途 project-mcp 变更的提交顺序 | 路径隔离提交(推荐) | 本变更改动按路径隔离单独提交,不等在途变更;禁止 git add -A |
| Q-F | node 工具链与 dsh 新 engines 偏差 | 反问「dsh容器本身的node版本不是24.21.0吗」→ 实测确认 | **事实修正**:dsh 容器内 node v24.21.0 满足 engines >=24.9.0(用户正确);偏差仅宿主包装链 volta v22.18.0;处置 = pnpm 验证命令统一在 dsh 容器内执行,宿主链偏差记录+失败兜底,不做独立治理项 |

## 变更名适配留痕

Q3 用户定名 `2026-11-06-dsh-baseline-0.2.2-rc.1`,但 OpenSpec 变更名仅允许小写字母/数字/连字符(点不合法),机械适配为 `2026-11-06-dsh-baseline-0-2-2-rc-1`(语义零变化);/tmp 规划材料目录同步迁移。

## 落档轮收敛结束

落档分歧点全部定案,前沿为空;未答项:无。
