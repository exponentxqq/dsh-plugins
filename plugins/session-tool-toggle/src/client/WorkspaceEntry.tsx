/**
 * 工作区默认档分节（统一「工作区配置」弹窗的贡献方组件）+ 它的状态机
 * （code-design §3.4 / ① 触达面 #37，原 footer 入口与自绘对话框在本次变更中拆除）。
 *
 * **挂载面迁移**：旧实现是 `sidebar.footer.*` 座位上的「触发按钮 + 自绘 `Modal` 对话框」；
 * 现在弹窗壳（header / nav / 内容列 / 关闭）属于 holder `dsh-plugin-workspace-config`，
 * 本文件只交付分节正文 `WorkspaceDefaultsSection`——holder 以 `children` 声明
 * `workspace-config.section`，本插件用 `ctx.slots.inject` 软注册（`src/client/index.ts`
 * 的 `register` 包 try/catch，失败只 warn）。旧触发按钮、footer 动作条（刷新/关闭）与
 * `Modal` 壳一并删除：刷新按钮由编辑器 dialog 形态自带（`WorkspaceDefaultsEditor.tsx`
 * 的 addRow），关闭由统一弹窗提供。
 *
 * 三个职责，按数据流自上而下：
 *
 * 1. **`useWorkspaceDefaults`**：工作区档的读写状态机（`phase` / `value` / `error` /
 *    `saving` / `saved`）。它不碰 DOM、不依赖座位，因此能脱离渲染单测；动作方法
 *    **不抛错**（失败落进状态），与 `panel-controller.ts` 同一纪律。**原样保留**，迁移
 *    只剥壳、不动状态机（既有 13 条 editor 用例继续覆盖它）。
 * 2. **`WorkspaceDefaultsSection`**：分节正文。挂载即读一次（`read()`），loading / failure
 *    两态沿用旧对话框的渲染分支；正文交给 `WorkspaceDefaultsEditor` 的 `dialog` 形态——
 *    **保留工作区下拉**（用户落档裁决：不改当前会话也能预先设默认档，去掉下拉等于删能力，
 *    见 code-design 待决问题 Q2 选项 a / D-13）。
 * 3. **目标寻址**：默认按**当前会话**（`{sessionId}` 形态）——宿主据此解析 cwd 的归属并
 *    返回 `workspace.key`；下拉切换后改用 `{workspacePath}` 形态（D-11：只接受已登记
 *    工作区的规范路径）。未登记目录也能读：`{sessionId}` 形态允许未归属（`registered:false`），
 *    此时 choices 仍可切换，不会把本节卡死。
 *
 * **与 `/tools` 共用状态（零回归红线）**：本节不维护第二份关闭集。读与写都走
 * `resolveClient()` 现取的 `PanelClient`——与头部面板同一个 `connection`、同一条
 * `/session-tool-toggle` 通道、同一组端点（`workspace` / `panel`）；宿主侧所有入口共用
 * `src/host/control.ts` 的同一控制内核与同一 `workspaces.json`。因此节内写入后
 * `/tools workspace status` 读到同一条记录，命令面写入后本节下一次 `read()`（刷新 / 重开
 * 统一弹窗）也看到同一状态。`test/workspace-editor.test.tsx` 的「与 /tools 共用状态」
 * 回归用例钉住这条链路。
 *
 * **失败展示的唯一实现点**是面板容器（`ToolPanelAction.tsx` 的 `failureOf`）：本文件复用它
 * 把 `PanelError` 映射成 `error.<code>` 文案与宿主的二级灰字，不再复制一份映射。唯一例外是
 * 传输码 `unavailable`——本插件会本地合成两种「暂时不可能」：`connection` 尚未就绪、当前
 * 没有可定位的会话（此时**不发**非法请求）；两者都渲染 `workspace.unavailable` 主文案，
 * 原始说明放二级灰字，排障方向不丢。
 *
 * **不引用上游工作区行的菜单座位**（DQ1=C 红线）：本文件不写该座位的常量、类型增补或
 * 注册代码，也不出现那个座位名（连注释都不写，`grep` 断言才能覆盖整个 `src/client/`）。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceEntry
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DefaultsUniverse, WorkspaceAction, WorkspaceRequest, WorkspaceValue } from '../contract.ts'
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
 * 上一份可用数据（刷新失败时对话框不闪成空白）。
 */
export interface WorkspaceDefaultsState {
  /** 可见阶段。 */
  readonly phase: WorkspacePhase
  /** 最近一次成功取得的 `WorkspaceValue`（目标工作区视图 + 下拉项）。 */
  readonly value?: WorkspaceValue
  /** 最近一次失败（读或写）；成功一次后清空。 */
  readonly error?: PanelError
  /** 写在途（保存/清空）：编辑区据此禁用按钮。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存」的瞬时确认）。 */
  readonly saved: boolean
}

/** `useWorkspaceDefaults` 的构造参数（code-design §3.10 冻结）。 */
export interface UseWorkspaceDefaultsOptions {
  /** 现取面板客户端：`connection` 可能晚于插件 `apply` 就绪，取不到时降级不发请求。 */
  readonly resolveClient: () => PanelClient | undefined
  /**
   * 初始目标请求（每次读取时现取；未 `select` 过新目标时用它）。
   *
   * footer 侧按 `currentSessionId()` 构造 `{sessionId}`；没有可定位的会话时返回 `{}`——
   * 状态机据此进 `failed('unavailable')` 且**不发**非法请求。
   */
  readonly initialTarget: () => WorkspaceRequest
}

/** 状态机的完整返回面（冻结签名：状态 + `read` / `update` / `select`）。 */
export interface WorkspaceDefaults extends WorkspaceDefaultsState {
  /** 读取当前目标的工作区档（挂载、打开对话框、显式刷新）。 */
  readonly read: () => Promise<void>
  /** 写当前目标的工作区档（`set` / `off` / `on` / `reset`；`read` 等价于 `read()`）。 */
  readonly update: (action: WorkspaceAction, addresses?: readonly string[]) => Promise<void>
  /** 切换目标工作区（下拉）并立即重读。 */
  readonly select: (key: string) => void
}

/** 客户端缺席时的兜底说明（主文案由 `workspace.unavailable` 承担）。 */
const CLIENT_MISSING_MESSAGE = '工作区默认档客户端尚未就绪：connection 可能晚于插件 apply 挂载'

/** 当前没有可定位的会话时的兜底说明（**不发请求**，请求体缺寻址字段会被宿主判 bad-request）。 */
const NO_SESSION_MESSAGE = '当前没有可定位的会话：先打开一个会话，或用下拉切换到已登记的工作区'

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
 * 一次写的结果被更新的一轮作废时（切换目标、重复刷新），**值**不再采用，但 `saving` 是
 * 请求生命周期的事实，必须复位；否则编辑区会永久禁用（比不更新值更糟）。
 * @param previous - 当前状态。
 * @returns 复位后的状态；本来不在途时原样返回（identity 稳定，避免无谓重渲染）。
 */
function releaseSaving(previous: WorkspaceDefaultsState): WorkspaceDefaultsState {
  return previous.saving ? { ...previous, saving: false } : previous
}

/**
 * 工作区默认档的状态机（读 / 写 / 刷新 / 失败态）。
 *
 * - **目标记忆**：`select(key)` 之前每次都现取 `initialTarget()`（当前会话可能切换，footer
 *   常挂而 props 不变）；`select` 之后固定为 `{workspacePath}`，直到组件卸载。
 * - **最后写入者胜**：每次读/写递增序号，迟到的响应（切换目标、重复刷新）不落状态。
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

  /** `select` 选中的目标；`undefined` = 跟随 `initialTarget()`（当前会话）。 */
  const targetRef = useRef<WorkspaceRequest | undefined>(undefined)
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

  /** 现取目标请求（`select` 过就用它，否则问 `initialTarget()`）。 */
  const targetOf = useCallback((): WorkspaceRequest => targetRef.current ?? initialTargetRef.current(), [])

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
    const target = targetOf()
    if (!hasTarget(target)) {
      failLocally(NO_SESSION_MESSAGE)
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
  }, [clientOf, failLocally, targetOf])

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
    const target = targetOf()
    if (!hasTarget(target)) {
      failLocally(NO_SESSION_MESSAGE)
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
        // 结果已被更新的一轮作废（切换目标 / 重复刷新）：值不采用，但 `saving` 必须复位——
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
  }, [clientOf, failLocally, read, targetOf])

  const select = useCallback((key: string): void => {
    // 空键（未知选项）不改变目标：保持当前工作区，避免发一个必被拒绝的 workspacePath。
    if (key === '') return
    targetRef.current = { workspacePath: key }
    void read()
  }, [read])

  return { ...state, read, update, select }
}

/**
 * 工作区默认档分节的 props（code-design §3.4 的迁移对照：`close` + `t` + 注入面）。
 *
 * 座位是 `workspace-config.section`（list / root），owner 份额只有 `{ close }`（holder
 * 统一弹窗注入）；`resolveClient` 与 `currentSessionId` 由座位注册面的 `inject` 提供，
 * `t` 由 `locale: NS` 合成。旧 footer 入口 props 的 `wide` 随该座位一起消失——分节宽度由
 * holder 的内容列决定，本组件不感知宽窄形态。
 */
export interface WorkspaceDefaultsSectionProps {
  /** 每次动作现取（`connection` 可能晚于 `apply` 就绪，与头部入口同一纪律）。 */
  readonly resolveClient: () => PanelClient | undefined
  /** 当前会话 id 的探测（`current-session.ts` 在装配层注入；没有会话时返回 `undefined`）。 */
  readonly currentSessionId: () => string | undefined
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
  /**
   * holder 弹窗的关闭动作（座位 owner 份额，`renderSlot` 时注入）。
   *
   * 本节没有整窗跳转流程，不消费它（关闭统一由 holder 弹窗提供）；声明它是为了让本组件的
   * props 与 `WorkspaceConfigSectionOwnerProps` 的份额严格对齐。
   */
  readonly close: () => void
}

/**
 * 统一「工作区配置」弹窗里的工作区默认档分节。
 *
 * 分节由 holder 的 `renderSlot('workspace-config.section', { close }, { only })` 挂载：一次
 * 只渲染一个选中分节（D8），切走即卸载、切回重新挂载并重读。挂载即读一次以预热 choices
 * 与当前工作区的档；失败也只是节内的一句话（不阻塞其它分节）。
 *
 * 正文交给 `WorkspaceDefaultsEditor` 的 `dialog` 形态：**保留工作区下拉**（Q2=a 的用户裁决），
 * 关闭/外壳由 holder 弹窗提供，本节不再自带 `Modal`、没有对话框根（不渲染 `role="dialog"`）。
 *
 * @param props - 座位 owner 份额、注入的探测面与 `t`。
 * @returns 分节正文（loading / failure / 编辑器三态之一）。
 */
export function WorkspaceDefaultsSection(props: WorkspaceDefaultsSectionProps): ReactNode {
  const { resolveClient, currentSessionId, t } = props

  // `initialTarget` 每次读时现取当前会话；用 useCallback 让 hook 的 ref 骑住同一函数。
  const initialTarget = useCallback((): WorkspaceRequest => {
    const sessionId = currentSessionId()
    return sessionId === undefined || sessionId === '' ? {} : { sessionId }
  }, [currentSessionId])

  const { value, error, saving, saved, read, update, select } = useWorkspaceDefaults({
    resolveClient,
    initialTarget,
  })

  /**
   * 跨目标缓存的「上一份宇宙」（W9 / ③ 3.19）。
   *
   * 宇宙是**会话视角**的读数：目标切到 `{workspacePath}` 寻址后，响应里的 `universe` 是 `null`
   * （宿主只按会话合成它）。没有这份缓存，下拉一切换分组清单就整块消失——记住最后一份非空
   * 宇宙，切目标期间仍能显示清单与三计数（U1 的近似语义，D-18 / W14 记录了已知限制）。
   *
   * 不变式：只在「已有非空宇宙」时被写；切目标、写目标、刷新目标都不清空它。
   */
  const remembered = useRef<DefaultsUniverse | null>(null)
  /** 渲染用的宇宙：当前响应优先，被抹成 `null` 时退回缓存（从未读到过才是 `null`）。 */
  const universe = value?.universe ?? remembered.current

  /** 下拉切换前记住当前宇宙：切到 `{workspacePath}` 后响应里 `universe` 为 null。 */
  const selectAndRemember = (key: string): void => {
    if (value?.universe !== undefined && value.universe !== null) remembered.current = value.universe
    select(key)
  }

  // 挂载即读一次：分节在弹窗打开（`only` 命中本节）时挂载，先把 choices 与当前工作区的档
  // 拉到手；失败也只是节内的一句话。刷新走编辑器 dialog 形态自带的按钮（`onRefresh`）。
  useEffect(() => {
    void read()
  }, [read])

  // 传输码 `unavailable` 走本地降级文案（连接未就绪 / 没有可定位的会话两种「暂时不可能」）；
  // 其余码复用面板容器的唯一映射点。
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
            universe={universe}
            choices={value.choices}
            variant="dialog"
            saving={saving}
            saved={saved}
            failure={failure}
            onSelect={selectAndRemember}
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
