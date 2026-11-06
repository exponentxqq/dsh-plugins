/**
 * 跨 cordis 版本兼容面：host Connection 通道挂载的 caller-fiber 归位。
 *
 * 依包规约（AGENTS.md 不变量 7）本文件承载「因上游版本而异的代码」——本 helper 对
 * allowlist 内全部受支持版本（cordis 4.0.5 / 4.1.0）执行同一条结构探测路径，无版本号
 * 分支；收敛于此以便后续 cordis 形状变化的适配面有唯一落点。
 */
import { type Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
/**
 * Mount view over the host Connection whose channel registrations belong to
 * the CALLER's fiber, as the upstream contract states ("Host Connection
 * service whose channel registrations belong to the caller fiber").
 *
 * Why this exists: every property access and `get()` in cordis 4 returns a
 * traceable view of a service, and on that view the `rpc` getter binds its
 * registration to `this.ctx` — a shadow context carrying the connection
 * provider's creation fiber, which never injects `webServer`. The
 * registration then dies with `cannot get property "webServer" without
 * inject` (the route never reaches the route table, and every panel request
 * falls through to the static SPA fallback as HTTP 405). The fix is
 * structural, not a version branch: unwrap the raw service via cordis's
 * `symbols.original` (identical on cordis 4.0.5 and 4.1.0, so one writing
 * covers every supported release) and re-expose `ctx` as THIS fiber's
 * context. `get rpc()` runs with the receiver as `this`, so the registration
 * lands on the fiber that injected `webServer` — exactly the caller fiber
 * the contract names. Everything except `ctx` is forwarded untouched: the
 * route's `this.admit` closure still resolves against the raw instance, and
 * the proxy never mutates it.
 * @param ctx - the mounting fiber's context (this row's injected callback ctx).
 * @param connection - the Connection service as read from any context.
 * @returns a read-only view used only to mount channels; do not hold onto it.
 */
export declare function callerConnectionOf(ctx: Context, connection: HostConnectionHandle): HostConnectionHandle;
