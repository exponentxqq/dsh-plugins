# 验证记录 — multi-root-at-mention-and-rename

> 执行期验证汇总与人工核对决策。实测数据 2026-10-19，记录落档 2026-10-20。

## 各任务验证结果（全部绿）

| 任务 | 验证句 | 结果 |
| --- | --- | --- |
| 1.1 git mv + lockfile | `test ! -e 旧目录 && test -d 新目录`；lockfile diff 仅 importer key | exit 0；200 R + 1 行互换 |
| 1.2 仓级路径引用 | grep 四文件旧路径串 | exit 1（0 命中） |
| 1.3 插件内路径引用 | grep 插件 md 旧路径串；包名保留计数 | exit 1（0 命中）；13 行包名保留 |
| 1.4 全量门禁（口径 R1） | 清零 grep（命中数 0）+ `pnpm install --frozen-lockfile && build && typecheck && test && lint && docs:check` | 全部 exit 0；test 386+5skip/61/96/136 |
| 2.1 OPTIONAL_CORE_PACKAGES | `grep -c "'@deepseek-ai/dsh-file-reference"` | 输出 2 |
| 2.2 peers 三处 | `compat:check` 含 "agree"；`pnpm dsh:check` | 双 exit 0（45 包全 0.2.1-rc.2） |
| 2.3 行数叙事 | grep `multi-root-file-references` ≥6 处；docs:check | 命中 6；exit 0 |
| 3.1 两新文件 | 插件 typecheck | exit 0 |
| 3.2 三处接线（口径 R2） | build；产物动态导入恰 1 处、零内联 | exit 0；L45 恰 1 处、计数 0 |
| 3.3 两新 spec | vitest 两 spec | 18 passed |
| 3.4 扩展既有测试 | vitest optional-peers + patch | 13 passed |
| 4.1 ADR-0012 | docs:check；索引 grep ≥1 | exit 0；中英索引各 1 |
| 4.2 架构 §6.2 | grep 6.2 命中；fileReferences ≥2；docs:check | 3 处/4/exit 0 |
| 4.3 双语 README + 不变量 | docs:check；`grep -c 'Eleven invariants'` | exit 0；输出 1 |
| 5.1 journey 断言 | build + smoke:compose + smoke:journey | 全 exit 0；compose 46/46、journey 60/60（5 条新 @ 断言全绿） |
| 5.2 计数回填 + 迁移说明 | 新 path grep 命中；docs:check；旧值零残留 | 7 处/exit 0/exit 1 |
| 5.3 全仓 verify | 仓根 `pnpm verify` | exit 0（26s；405+61+96+136 tests；smoke 46/99/60） |

## 人工核对决策（5.3 后半）

- **决策**：用户于 2026-10-20 选择「脚本级等效验收」——不停留真实 profile 验收。
- **等效依据**：`smoke:journey` 在真实 dsh 容器（0.2.1-rc.2，临时 `$DSH_HOME`）实跑 60/60 全绿，其中 5 条新断言覆盖全链路——空 query 出附加根目录候选（fileRootCandidate）→ `${extra}/` 钻入候选全绝对（fileDrilledAbsolute）→ 裸模糊不含附加根（fileFuzzyExcludes）→ `/workspace-folders remove 1` 成功（fileRevoked）→ 撤销后候选消失（fileCandidateGone）。与任务原文人工核对清单（起新会话 → add → `@` 看根候选 → 钻入 → remove 后消失）一一对应。
- **真实 profile 人工验收**：未执行（用户明示豁免，以脚本级等效验收替代）；profile 侧迁移按 tasks.md「Workflow follow-up」在发布 v1.3.0 后进行。
