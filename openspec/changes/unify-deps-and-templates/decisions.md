# unify-deps-and-templates 收敛留痕（串行，spec-plan 阶段 1.5）

来源：explore.md 待决节 D1–D3，grill-me 单轮收敛（2026-11-07），用户逐项确认。

## D1 `DSH_MULTI_ROOT_COMPAT=warn` enforcement 机制 → **删除**

- 裁定：整体删除——`src/compat/dsh-version.ts` 的 `compatEnforcement`、`src/compat.ts` 的 warn 分支（assertSupportedInstallation 仅剩 enforce 语义，函数形态随之简化）、`tests/compat.spec.ts` 的 warn 相关断言（含 line 235 提示语断言与 line 81 upgradeLane 分支）、根 `scripts/upgrade-dsh.mjs` 输出里的 `DSH_MULTI_ROOT_COMPAT=warn ...` 提示行。
- 依据：机制存在理由是「在尚未入台账的候选版本上跑完整行为矩阵」；台账（a 形态）删除后车道意义消失，保留即死代码。
- 连锁面：G-C 触达面第 4/5 条已预列；探测车道（`DSH_CLI=<版本> pnpm smoke`）保留但语义变为回归验证（ADR-0009 修订注写明）。

## D2 `SUPPORTED_DSH_RELEASES` / `SupportedDshRelease` 导出面 → **直接删除**

- 裁定：不保留 deprecated 别名；`src/index.ts` 导出面删除两项，`src/compat.ts` 的转发删除。
- 依据：仓内零消费者（grep 证实：消费面仅 compat.ts / index.ts / tests / check-dsh-compat.mjs，全部在本变更改写范围内）；范围判定下逐版本类型无意义。
- 连锁面：multi-root lib 产物模块词集变化（删除导出）——check-artifacts 基线比对属预期差异，变更说明中记「multi-root 产物词集预期变化」；B 断言无 `@dsh-plugins/` 语义不受影响。

## D3 dsh-baseline spec delta 形态 → **删旧 + 新增 + 改写**

- 裁定：
  1. REMOVED「multi-root 精确支持矩阵」整节（含三 scenario：新基线宿主受支持 / 被裁剪版本拒绝启动 / 绿灯不等于授权）；
  2. ADDED「multi-root 软范围放行」：启动判定 SHALL 由基线派生软范围（`>=<基线> <<主>.<次+1>.0`）承载——域内放行完整加载、域外拒绝启动并输出范围；两 scenario（域内/域外）；
  3. MODIFIED「peer 枚举与 allowlist 一致」→「multi-root peer 与软范围一致」：23 项 DSH peers 与 `dsh.engines.dsh` SHALL 逐字等于派生范围；cordis peer 范围不受影响；
  4. MODIFIED「基线常量唯一来源与软范围派生」：「六个软插件」→「全部插件」（multi-root 并入）。
- 依据：保持 requirement 粒度与旧文本一一对应（归档 sync 面清晰），合并改写丢失对应关系。
- 连锁面：spec delta 随本变更落档；openspec validate --strict 必须绿；主 specs 由归档 sync（执行侧不做）。

## 收敛结束声明

前沿为空：explore.md 待决项 D1–D3 全部落定，其余条目为事实或 1.7 设计细节（范围常量载体、手写比较器实现、template.json 键面、AR2 适配逻辑、check-dsh-baseline 特判删除形态），无用户决策残留。已达成共识，可进阶段 1.7。
