/**
 * 「当前会话」事实与会话用量读数的 holder 装配薄层。
 *
 * 页面在动作发生前要说出两件事：用户当前看的是哪个会话（决定会话管理分节的归属与
 * `main` 视图的绑定），以及每个会话的 `updatedAt`（默认选择策略 Q10 的「最近使用」档）。
 * 两件事实的**唯一实现**在 `tooling/client-kit` 的 `./client-session` 里：两步结构探测
 * （`snapshot.current` → `byId[*].retainedBy.mainView > 0`）与 `{ updatedAtById }` 投影，
 * 连同 `getSnapshot` 必须按方法调用的教训都在那边，本文件不复制任何实现。
 *
 * **为什么 holder 侧还要薄层**（P3 附录裁定）：client-kit 是 tooling 包，零上游 DSH
 * import（连 cordis 的 `Context` 类型也不能引），所以 `ctx.get('sessions')` 这一步只能由
 * 消费方完成；本文件就是这个消费点，同时让页面与 `index.ts` 拿到收 `ctx` 的签名
 * （`code-design.md` ③ §3.10）。client-kit 以 TS 源分发、构建期内联（AR1：内部包只进
 * `devDependencies`），产物里不留内部包词。
 *
 * **每次现取、不缓存**：`sessions` 服务可能晚于 holder 的 `apply` 就绪，客户端对象也
 * 可能被宿主替换；在 `apply` 期把服务或快照闭包缓存下来，晚到的那次探测就永远读不到。
 * 因此两个函数都不持有状态——取值发生在**调用点**，读的是那一刻的 `ctx.get`。
 *
 * 探测语义（两步的取舍、为什么按结构而不是按版本）见 `@dsh-plugins/client-kit/client-session`
 * 的模块头；multi-root 侧经其 `src/compat/client-session.ts` 薄 re-export 消费同一实现（P3 已落地：
 * 唯一实现在 `tooling/client-kit`）。
 *
 * @module dsh-plugin-workspace-config/client/session-context
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SessionUsageSnapshot } from '@dsh-plugins/client-kit/client-session';
/**
 * 会话 `updatedAt` 投影的形状（re-export 自 client-kit 的唯一权威）。
 *
 * 只取默认策略要的两栏：键是会话 id，值是**只有** `updatedAt` 一栏的对象——列表行上的
 * `title` / `displayTitle` / `projectionValues` 都不投影，避免把易变的展示面固化成
 * 内部 API。
 */
export type { SessionUsageSnapshot };
/**
 * 读取当前会话 id（两步探测：`snapshot.current` → `byId[*].retainedBy.mainView > 0`）。
 *
 * 每次调用现取 `ctx.get('sessions')`：服务晚到 / 客户端对象被替换时都能读到当下事实。
 *
 * @param ctx - 浏览器侧根上下文。`sessions` 不在本包依赖声明的 `Context` 面里，按结构
 *   软读（cordis 的未声明名重载返回 `any`，原样交给 client-kit 收 `unknown` 的实现）；
 *   服务缺席是受支持状态（返回 `undefined`）。
 * @returns 当前会话 id；没有主视图持有的会话时为 `undefined`。
 */
export declare function currentSessionIdOf(ctx: ClientContext): string | undefined;
/**
 * 读取会话 `updatedAt` 投影（`{ updatedAtById }`）。
 *
 * 服务在场时总是返回投影（目录为空就是空表）；服务缺席 / 快照不可读才返回 `undefined`——
 * 那才是「读数不可用」，与「零会话」是不同事实。
 *
 * @param ctx - 浏览器侧根上下文（同上，每次现取 `ctx.get('sessions')`）。
 * @returns `{ updatedAtById }` 投影，或缺席 / 不可读时为 `undefined`。
 */
export declare function sessionUsageOf(ctx: ClientContext): SessionUsageSnapshot | undefined;
