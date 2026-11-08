# `@dsh-plugins/client-kit`

DSH **client 半（浏览器）** 的共享运行时函数包（本仓第五个 tooling 包）：当前会话探测与
会话 `updatedAt` 投影的唯一实现。被 `dsh-plugin-workspace-config`（变更
`2026-11-08-workspace-config-page` 的 G2）与 `dsh-plugin-multi-root-workspace`（同变更 G6）
以 **TypeScript 源**消费，由各包的 esbuild 构建就地内联——产物里没有
`@dsh-plugins/client-kit` 这个词（B3 断言）。

- `private`、`0.0.0`、`dependencies: {}`：`exports` 的 `types` 与 `default` 都指向
  `./src/client-session.ts`，消费侧两轨解析——tsc 走 `exports.types`（消费方在
  `devDependencies` 声明 `@dsh-plugins/client-kit` 后由 pnpm 链接解析），esbuild 走同一
  `exports` 做构建期内联。如需与 host-kit 同款的 `paths` 便捷映射，由消费方接入时在根
  `tsconfig.plugin.base.json` 一并登记。
- 零 `@deepseek-ai/*` 依赖与 import：连 cordis 的 `Context` 类型也不进（tooling 包约束，
  `AR2` 自动纳管），因此签名收的是 `sessions` 而不是 `ctx`——`ctx.get('sessions')` 由消费方
  完成，本包只做结构软读。

## 导出契约

| 入口 | 形状 | 语义 |
| --- | --- | --- |
| `./client-session` | `currentSessionIdOf(sessions: unknown): string \| undefined` | 两步结构探测：`snapshot.current` 显式选择 → `byId[*].retainedBy.mainView > 0` 回退 |
| `./client-session` | `sessionUsageOf(sessions: unknown): SessionUsageSnapshot \| undefined` | `{ updatedAtById }` 投影：只取默认选择策略要的 `updatedAt` 一栏；服务缺席 / 不可读返回 `undefined`，服务在场但目录为空返回空表 |

`SessionUsageSnapshot` 的键是会话 id（行 `id` 优先、缺省回退目录键），值只有
`{ updatedAt }`；行上的 `title` / `displayTitle` / `projectionValues` 一律不进读数。

## 四条纪律

1. **每次动作现取**，不缓存、不订阅：`sessions` 服务可能晚于 `apply` 就绪，客户端对象也可能
   被宿主替换。在 `apply` 期闭包缓存服务或快照，服务晚到时探测就永远读不到。
2. **`getSnapshot` 必须按方法调用**：真实 store 要读 `this`；把函数摘出来裸调会丢绑定，即使
   会话已选中也返回 `undefined`（回归用例钉住）。
3. **结构探测而非版本比较**：本包只服务唯一基线（`scripts/dsh-baseline.mjs` 派生），快照形状
   用 `unknown` 逐层收窄，不做多版本兼容层。
4. **服务缺席是受支持状态**：返回 `undefined`，消费方进入 `unavailable` 降级，不发非法请求。

## 上游快照锚点（dsh `0.2.2-rc.1` 安装树，漂移时按此定位）

| 事实 | 位置 |
| --- | --- |
| `SessionListState`（`ids` / `byId` / `phase` / `projectionsBySession`，**无 `current`**） | `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:50-59` |
| `SessionSummary`（`id`、`updatedAt`、`retainedBy`） | 同文件 `:16-48` |
| `SessionRetainInfo.retainedBy`（只记正数的来源计数） | `@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/sessions.d.ts:36-41` |
| `SessionReferenceSourceMap` 增补 `mainView` 来源 | `@deepseek-ai/dsh-client-ui-session/lib/types/client/index.d.ts:101-105` |
| `mainView` retention 喂工作区浏览器的 `containsCurrent` | `@deepseek-ai/dsh-client-ui-workspace/lib/types/client/tree.d.ts:146` |

**为什么两步**：只读 `current` 会在没有该字段的基线上永远报「无会话」（入口永远拿不到
`sessionId`）；只取目录第一行会指到用户没在看的会话。所以先取显式选择，缺席时再取主视图持有
的第一行（枚举顺序 = 目录插入顺序 = 上游主绑定投影自己的扫描顺序）。

## 消费方指针

| 消费方 | 用法 | 落地 |
| --- | --- | --- |
| `plugins/workspace-config/src/client/session-context.ts`（原计划新建） | 薄组合：`currentSessionIdOf(ctx.get('sessions'))` / `sessionUsageOf(ctx.get('sessions'))`，保留 holder 内的装配语义 | 同变更 G2 |
| `plugins/multi-root-workspace/src/compat/client-session.ts` | 删除本地实现，改 re-export / 直接消费同一入口（消费点 `src/client/index.ts`） | 同变更 G6 |

「每次现取」的调用点纪律留在消费方：它们各自持有 `ctx`，本包只接收 `ctx.get('sessions')` 的
结果，不决定何时读。

## 治理与验证

`scripts/check-architecture.mjs` 的 `TOOLING_CONTRACT` 登记
`client-kit: { runtime: [], scripts: ['lint', 'typecheck', 'test'] }`（AR2：private / `0.0.0` /
零运行时依赖 / devDeps 仅工具链白名单），`pnpm-workspace.yaml` 的 `packages` 显式列出
`tooling/client-kit`（AR7 恰五包）——两者与本包同批登记。

```bash
pnpm --filter @dsh-plugins/client-kit lint
pnpm --filter @dsh-plugins/client-kit typecheck
pnpm --filter @dsh-plugins/client-kit test
```
