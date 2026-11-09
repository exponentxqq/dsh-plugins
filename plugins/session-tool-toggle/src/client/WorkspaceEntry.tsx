/**
 * 工作区默认档分节（统一「工作区配置」页面的贡献方组件）+ 它的状态机
 * （code-design ① 1.3 / ③ 3.9：份额与寻址改由页面驱动）。
 *
 * **挂载面**：分节在 `workspace-config` 页面的 tabpanel 里挂载（`workspace-config.section`
 * 座位，本插件用 `ctx.slots.inject` 软注册，`src/client/index.ts` 的 `register` 包 try/catch，
 * 失败只 warn）。页面壳（页头 / 唯一的工作区选择框 / tab / 内容列）属于 holder
 * workspace-config，本文件只交付分节正文——**本节没有下拉、也不持有选择状态**：选择动作归
 * 页面工具栏那一个选择框（需求 3「三个分节不得各自携带工作区选择控件」）。
 *
 * 三个职责，按数据流自上而下：
 *
 * 1. **`useWorkspaceDefaults`**：工作区档的读写状态机（`phase` / `value` / `error` /
 *    `saving` / `saved`）。它不碰 DOM、不依赖座位，因此能脱离渲染单测；动作方法**不抛错**
 *    （失败落进状态），与 `panel-controller.ts` 同一纪律。目标由调用方每次现取
 *    （`initialTarget()`）——本变更后状态机自己不再记忆目标，`select` / `targetRef` 已删。
 * 2. **`WorkspaceDefaultsSection`**：分节正文入口。三态份额
 *    （`WorkspaceConfigWorkspaceContext`）决定渲染哪一路：`kind==='workspace'` → 交给
 *    `WorkspaceDefaultsTarget` 以 `{workspacePath: path}` 寻址；`unassigned` / `none` →
 *    渲染 `workspace.noTarget` 空态，且**不发请求**（空态下没有任何组件去取数，请求无从
 *    发出）。
 * 3. **目标寻址与重挂**：`<WorkspaceDefaultsTarget key={path}>` 把「工作区身份」并入组件
 *    挂载身份（D14）——页面换工作区 = 本节重挂 = 重新读取；不写「监听 props 变化再重读」的
 *    effect，也就不用处理「读在途时被切换」的竞态分支（旧请求在宿主侧照常完成，结果不再
 *    有人渲染）。
 *
 * **与 `/tools` 共用状态（零回归红线）**：本节不维护第二份关闭集。读与写都走
 * `resolveClient()` 现取的 `PanelClient`——与头部面板同一个 `connection`、同一条
 * `/session-tool-toggle` 通道、同一组端点（`workspace` / `panel`）；宿主侧所有入口共用
 * `src/host/control.ts` 的同一控制内核与同一 `workspaces.json`。因此节内写入后
 * `/tools workspace status` 读到同一条记录，命令面写入后本节下一次 `read()`（刷新 / 重挂）
 * 也看到同一状态。`test/workspace-editor.test.tsx` 的「与 /tools 共用状态」回归用例钉住
 * 这条链路。
 *
 * **失败展示的唯一实现点**是面板容器（`ToolPanelAction.tsx` 的 `failureOf`）：本文件复用它
 * 把 `PanelError` 映射成 `error.<code>` 文案与宿主的二级灰字，不再复制一份映射。唯一例外是
 * 传输码 `unavailable`——`connection` 尚未就绪时本插件本地合成一次「暂时不可能」（**不发**
 * 请求），渲染 `workspace.unavailable` 主文案、原始说明放二级灰字，排障方向不丢。
 *
 * **不引用上游工作区行的菜单座位**（DQ1=C 红线）：本文件不写该座位的常量、类型增补或
 * 注册代码，也不出现那个座位名（连注释都不写，`grep` 断言才能覆盖整个 `src/client/`）。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceEntry
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// 份额类型（三态上下文）的唯一权威在 @dsh-plugins/contracts（D-15）；`import type` 在
// `verbatimModuleSyntax` 下零产物，浏览器 bundle 不含契约包名。
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import type { WorkspaceAction, WorkspaceRequest, WorkspaceValue } from '../contract.ts'
import type { PanelFailure } from './DefaultsEditor.tsx'
import { WorkspaceDefaultsEditor } from './WorkspaceDefaultsEditor.tsx'
import { PanelError, type PanelClient } from './panel-client.ts'
import { failureOf } from './ToolPanelAction.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的翻译函数（命名空间键联合，与面板容器同一类型）。 */
export type Translate = TranslateNS<typeof NS>

/** 工作区档的可见阶段；与 `PanelPhase` 同构（`idle` = 还没读过）。 */
export type WorkspacePhase = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * 工作区档的只读状态。
 *
 * stale-while-revalidate 与面板一致：`failed` 只是「最近一次操作没成功」，`value` 可能仍是
 * 上一份可用数据（刷新失败时正文不闪成空白）。
 */
export interface WorkspaceDefaultsState {
  /** 可见阶段。 */
  readonly phase: WorkspacePhase
  /** 最近一次成功取得的 `WorkspaceValue`（目标工作区视图 + 实际写入项 + universe：页面形态（`{workspacePath}`）= 工作区宇宙；面板形态（`{sessionId}`）= 会话视角宇宙）。 */
  readonly value?: WorkspaceValue
  /** 最近一次失败（读或写）；成功一次后清空。 */
  readonly error?: PanelError
  /** 写在途（保存/清空）：编辑区据此禁用按钮。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存」的瞬时确认）。 */
  readonly saved: boolean
}

/** `useWorkspaceDefaults` 的构造参数（code-design §3.9 冻结）。 */
export interface UseWorkspaceDefaultsOptions {
  /** 现取面板客户端：`connection` 可能晚于插件 `apply` 就绪，取不到时降级不发请求。 */
  readonly resolveClient: () => PanelClient | undefined
  /**
   * 每次读取现取的目标请求（寻址形态）。
   *
   * 本变更后由调用方闭包给出 `{ workspacePath }`（页面份额里的规范路径）；返回 `{}` 时
   * 状态机进 `failed('unavailable')` 且**不发**非法请求。
   */
  readonly initialTarget: () => WorkspaceRequest
}

/** 状态机的完整返回面（冻结签名：状态 + `read` / `update`）。 */
export interface WorkspaceDefaults extends WorkspaceDefaultsState {
  /** 读取当前目标的工作区档（挂载、显式刷新）。 */
  readonly read: () => Promise<void>
  /** 写当前目标的工作区档（`set` / `off` / `on` / `reset`；`read` 等价于 `read()`）。 */
  readonly update: (action: WorkspaceAction, addresses?: readonly string[]) => Promise<void>
}

/** 客户端缺席时的兜底说明（主文案由 `workspace.unavailable` 承担）。 */
const CLIENT_MISSING_MESSAGE = '工作区默认档客户端尚未就绪：connection 可能晚于插件 apply 挂载'

/** 目标请求缺寻址形态时的兜底说明（**不发请求**，缺寻址字段会被宿主判 bad-request）。 */
const NO_TARGET_MESSAGE = '当前没有可寻址的目标工作区：目标由页面选择框给出，空目标时本节呈现空态'

/** 写动作必须带非空地址（契约 §3.6.2：`set` / `off` / `on` 至少一条）。 */
const NO_ADDRESS_MESSAGE = '写入工作区默认档缺少地址：空单不发请求（契约要求 set / off / on 至少带一条地址）'

/**
 * 把任意抛出值归一成 {@link PanelError}（与 `panel-controller.ts` 的同名助手同一纪律：
 * 连不上与代码抛错的排障方向相反，不能混成一个码）。
 * @param error - 捕获到的任意值。
 * @returns 带稳定码的失败对象。
 */
function asPanelError(error: unknown): PanelError {
  if (error instanceof PanelError) return error
  return new PanelError('internal', error instanceof Error ? error.message : String(error))
}

/**
 * 请求体是否带了一个寻址形态（`sessionId` / `workspacePath` 恰好一个，见 D-11）。
 * @param request - 目标请求。
 * @returns 有寻址形态时为 true。
 */
function hasTarget(request: WorkspaceRequest): boolean {
  return request.sessionId !== undefined || request.workspacePath !== undefined
}

/**
 * 组装一次写请求：`reset` 不带 `addresses`（契约禁止该组合同现），其余写动作必须带。
 * @param request - 目标请求（寻址形态）。
 * @param action - 写动作。
 * @param addresses - 目标地址。
 * @returns 可上发的请求体；地址为空时返回 `undefined`（调用方本地失败，不发请求）。
 */
function writeRequestOf(
  request: WorkspaceRequest,
  action: WorkspaceAction,
  addresses?: readonly string[],
): WorkspaceRequest | undefined {
  if (action === 'reset') return { ...request, action }
  if (addresses === undefined || addresses.length === 0) return undefined
  return { ...request, action, addresses }
}

/**
 * 释放「写在途」标志（幂等）。
 *
 * 一次写的结果被更新的一轮作废时（重复刷新），**值**不再采用，但 `saving` 是请求生命周期的
 * 事实，必须复位；否则编辑区会永久禁用（比不更新值更糟）。
 * @param previous - 当前状态。
 * @returns 复位后的状态；本来不在途时原样返回（identity 稳定，避免无谓重渲染）。
 */
function releaseSaving(previous: WorkspaceDefaultsState): WorkspaceDefaultsState {
  return previous.saving ? { ...previous, saving: false } : previous
}

/**
 * 工作区默认档的状态机（读 / 写 / 刷新 / 失败态）。
 *
 * - **目标现取**：每次读/写都问 `initialTarget()`（本变更后恒为调用方闭包给出的
 *   `{workspacePath}`）；「换工作区」由分节的 `key` 重挂承担，状态机不记忆目标。
 * - **最后写入者胜**：每次读/写递增序号，迟到的响应（重复刷新）不落状态。
 * - **不撒谎**：客户端缺席、无寻址形态、写动作缺地址都在本地进 `failed`，绝不发一个会被
 *   宿主拒绝的请求来「产生错误」。
 *
 * @param options - 依赖注入面（见 {@link UseWorkspaceDefaultsOptions}）。
 * @returns 状态与动作（动作方法不抛错，promise 只作 join 点）。
 */
export function useWorkspaceDefaults(options: UseWorkspaceDefaultsOptions): WorkspaceDefaults {
  // 注入面可能每次渲染都是新对象：骑 ref，动作方法的 identity 才能稳定（挂载 effect 只跑一次）。
  const resolveRef = useRef(options.resolveClient)
  resolveRef.current = options.resolveClient
  const initialTargetRef = useRef(options.initialTarget)
  initialTargetRef.current = options.initialTarget

  const [state, setState] = useState<WorkspaceDefaultsState>({
    phase: 'idle',
    saving: false,
    saved: false,
  })

  /** 请求序号：只有最后一次发出的请求可以落状态。 */
  const seqRef = useRef(0)
  /** 挂载标记：卸载后不再 `setState`（StrictMode 的挂载-卸载-重挂会复位它）。 */
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // 作废在途请求：卸载（或 StrictMode 的重挂）后回来的响应没有渲染对象。
      seqRef.current += 1
    }
  }, [])

  /** 现取客户端；解析器抛错按「未就绪」处理（状态机承诺动作方法不抛错）。 */
  const clientOf = useCallback((): PanelClient | undefined => {
    try {
      return resolveRef.current()
    } catch {
      return undefined
    }
  }, [])

  /**
   * 本地降级：不发请求，直接把「暂时不可能」写进状态。
   * @param message - 排障用的原始说明（二级灰字）。
   */
  const failLocally = useCallback((message: string): void => {
    if (!mountedRef.current) return
    seqRef.current += 1
    setState((previous) => ({
      ...previous,
      // 有旧数据时保持阶段不变（stale-while-revalidate），没有数据时才是 failed。
      phase: previous.value === undefined ? 'failed' : previous.phase,
      error: new PanelError('unavailable', message),
      saving: false,
      saved: false,
    }))
  }, [])

  const read = useCallback(async (): Promise<void> => {
    const client = clientOf()
    if (client === undefined) {
      failLocally(CLIENT_MISSING_MESSAGE)
      return
    }
    const target = initialTargetRef.current()
    if (!hasTarget(target)) {
      failLocally(NO_TARGET_MESSAGE)
      return
    }
    const seq = (seqRef.current += 1)
    setState((previous) => ({ ...previous, phase: 'loading', error: undefined, saved: false }))
    try {
      // action 显式给 read：`initialTarget()` 只负责寻址形态，动作归本状态机。
      const value = await client.workspace({ ...target, action: 'read' })
      if (!mountedRef.current) return
      if (seq !== seqRef.current) return
      // 展开上一份状态而不是整份替换：读不拥有 `saving`（那是写在途的事实），
      // 同时把「刚读到的档」交给渲染层。
      setState((previous) => ({ ...previous, phase: 'ready', value, error: undefined, saved: false }))
    } catch (error: unknown) {
      if (!mountedRef.current || seq !== seqRef.current) return
      setState((previous) => ({ ...previous, phase: 'failed', error: asPanelError(error), saved: false }))
    }
  }, [clientOf, failLocally])

  const update = useCallback(async (action: WorkspaceAction, addresses?: readonly string[]): Promise<void> => {
    // `read` 不是写动作：交给读取路径，避免把「刷新」做成一次多余的写回执。
    if (action === 'read') {
      await read()
      return
    }
    const client = clientOf()
    if (client === undefined) {
      failLocally(CLIENT_MISSING_MESSAGE)
      return
    }
    const target = initialTargetRef.current()
    if (!hasTarget(target)) {
      failLocally(NO_TARGET_MESSAGE)
      return
    }
    const request = writeRequestOf(target, action, addresses)
    if (request === undefined) {
      failLocally(NO_ADDRESS_MESSAGE)
      return
    }
    const seq = (seqRef.current += 1)
    setState((previous) => ({ ...previous, saving: true, error: undefined, saved: false }))
    try {
      const value = await client.workspace(request)
      if (!mountedRef.current) return
      if (seq !== seqRef.current) {
        // 结果已被更新的一轮作废（重复刷新）：值不采用，但 `saving` 必须复位——
        // 否则编辑区永久禁用，用户再也点不动保存。
        setState(releaseSaving)
        return
      }
      setState((previous) => ({ ...previous, phase: 'ready', value, saving: false, saved: true }))
    } catch (error: unknown) {
      if (!mountedRef.current) return
      if (seq !== seqRef.current) {
        setState(releaseSaving)
        return
      }
      setState((previous) => ({ ...previous, saving: false, saved: false, error: asPanelError(error) }))
    }
  }, [clientOf, failLocally, read])

  return { ...state, read, update }
}

/**
 * 工作区默认档分节的 props（code-design ③ 3.9 冻结形状）。
 *
 * 座位是 `workspace-config.section`（list / root），owner 份额是页面下传的**纯数据**
 * `{ workspace }`（holder 的 `renderSlot` 注入）；`resolveClient` 由座位注册面的 `inject`
 * 提供，`t` 由 `locale: NS` 合成。没有关闭回调（关闭语义随弹窗壳一并删除，Q7），也
 * **没有** `currentSessionId`（会话探测已迁 holder，D12）——本节不再读会话，寻址只认份额里
 * 的规范路径。
 */
export interface WorkspaceDefaultsSectionProps {
  /** 页面级工作区上下文（三态：`workspace` / `unassigned` / `none`）。 */
  readonly workspace: WorkspaceConfigWorkspaceContext
  /** 每次动作现取（`connection` 可能晚于 `apply` 就绪，与头部入口同一纪律）。 */
  readonly resolveClient: () => PanelClient | undefined
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/** `WorkspaceDefaultsTarget` 的 props（本文件内部面：份额里的 `path` 已由分节解出）。 */
interface WorkspaceDefaultsTargetProps {
  /** 目标工作区的规范路径（`{workspacePath}` 寻址键）。 */
  readonly workspacePath: string
  /** 每次动作现取的面板客户端。 */
  readonly resolveClient: () => PanelClient | undefined
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 单个目标工作区的读写分节（`useWorkspaceDefaults` 的唯一挂载点）。
 *
 * 由 `WorkspaceDefaultsSection` 以 `key={path}` 挂载：换工作区 = 本组件卸载重建 = 重新
 * `read()`，`phase` / `value` / `saving` 全部回到初始态（D14 的「换工作区 = 重挂重读」）。
 *
 * @param props - 目标路径、`resolveClient` 与 `t`。
 * @returns loading / failure / 编辑器三态之一。
 */
function WorkspaceDefaultsTarget(props: WorkspaceDefaultsTargetProps): ReactNode {
  const { workspacePath, resolveClient, t } = props

  // `initialTarget` 每次读时现取 `{ workspacePath }`；`useCallback` 让 hook 的 ref 骑住同一
  // 函数（本挂载内目标不变，换工作区由 `key` 换挂载）。
  const initialTarget = useCallback((): WorkspaceRequest => ({ workspacePath }), [workspacePath])

  const { value, error, saving, saved, read, update } = useWorkspaceDefaults({
    resolveClient,
    initialTarget,
  })

  // 挂载即读一次：分节在页面 tab 命中本节时挂载，先把目标工作区的档拉到手；失败也只是节内的
  // 一句话。刷新走编辑器 dialog 形态自带的按钮（`onRefresh`）。
  useEffect(() => {
    void read()
  }, [read])

  // 传输码 `unavailable` 走本地降级文案（`connection` 尚未就绪的「暂时不可能」）；其余码复用
  // 面板容器的唯一映射点。
  const failure = useMemo<PanelFailure | undefined>(() => {
    if (error === undefined) return undefined
    if (error.code === 'unavailable') {
      return error.message === ''
        ? { text: t('workspace.unavailable') }
        : { text: t('workspace.unavailable'), detail: error.message }
    }
    return failureOf(error, t)
  }, [error, t])

  return (
    <div className={css.workspaceBody}>
      {value === undefined
        ? (failure === undefined
          ? <p className={css.loading}>{t('workspace.loading')}</p>
          : (
            <div className={css.failureBlock} role="alert">
              <p className={css.error}>{failure.text}</p>
              {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
            </div>
          ))
        : (
          <WorkspaceDefaultsEditor
            workspace={value.workspace}
            universe={value.universe}
            variant="dialog"
            saving={saving}
            saved={saved}
            failure={failure}
            onUpdate={(action, addresses) => {
              void update(action, addresses)
            }}
            onRefresh={() => {
              void read()
            }}
            t={t}
          />
        )}
    </div>
  )
}

/**
 * 统一「工作区配置」页面里的工作区默认档分节。
 *
 * 页面按 tab 选中挂载本节（D8：一次只渲染一个选中分节，切走即卸载、切回重新挂载并重读），
 * 选择框换工作区时以 `key` 重挂（D14）。份额不是有效工作区时只渲染空态：`unassigned` 与
 * `none` 两态都**不发**寻址请求（spec「未分配项的分节语义」「清单未就绪降级」）——因为空态
 * 下根本不挂载会取数的 `WorkspaceDefaultsTarget`，请求无从发出。
 *
 * 正文交给 {@link WorkspaceDefaultsTarget}（hooks 只在拿到有效目标后调用，避免空态 ↔ 有效
 * 目标切换时 hooks 数量变化），再交给 `WorkspaceDefaultsEditor` 的 `dialog` 形态——节内
 * **没有**下拉，也没有对话框根（不渲染 `role="dialog"`）。
 *
 * @param props - 页面份额、注入的 `resolveClient` 与 `t`。
 * @returns 空态或目标工作区的编辑器。
 */
export function WorkspaceDefaultsSection(props: WorkspaceDefaultsSectionProps): ReactNode {
  const { workspace, resolveClient, t } = props

  // 无有效目标（未分配 / 工作区服务未就绪）：空态，且不挂载任何会取数的组件。
  if (workspace.kind !== 'workspace') {
    return (
      <div className={css.workspaceBody}>
        <p className={css.empty}>{t('workspace.noTarget')}</p>
      </div>
    )
  }

  // 换工作区 = 换 `key` = 重挂重读（D14）；不做 props 对齐 effect，也不留下旧目标的读数。
  return (
    <WorkspaceDefaultsTarget
      key={workspace.path}
      workspacePath={workspace.path}
      resolveClient={resolveClient}
      t={t}
    />
  )
}
