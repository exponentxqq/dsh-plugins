/**
 * 侧栏 footer 的工作区默认档入口 + 自绘对话框（code-design §3.10 / 触达面 C3，任务 7.3）。
 *
 * 为什么是 footer：基线 `0.2.1-rc.5` 的工作区行 `...` 菜单在 `dsh-client-ui-workspace`
 * 内部硬编码、没有插件座位（DQ1=C：上游座位软注册本期不实现，见 `seats.ts` 的注释与
 * D-12）。可用的 additive 座位是 `sidebar.footer.action`（list / root，owner 只有
 * `{wide}`），本文件只交付**组件与它的状态机**，座位注册归任务 7.6 的
 * `src/client/index.ts`（`register` 包 try/catch，失败只 warn）。
 *
 * 三个职责，按数据流自上而下：
 *
 * 1. **`useWorkspaceDefaults`**：工作区档的读写状态机（`phase` / `value` / `error` /
 *    `saving` / `saved`）。它不碰 DOM、不依赖座位，因此能脱离渲染单测；动作方法
 *    **不抛错**（失败落进状态），与 `panel-controller.ts` 同一纪律。
 * 2. **`WorkspaceFooterAction`**：footer 触发按钮（宽态带文案、折叠态只有图标）+ 打开时
 *    渲染的模态对话框。对话框复用 primitives 的 `Modal`（body portal），内部交给
 *    `WorkspaceDefaultsEditor` 的 `dialog` 形态（任务 7.2）。
 * 3. **目标寻址**：默认按**当前会话**（`{sessionId}` 形态）——宿主据此解析 cwd 的归属并
 *    返回 `workspace.key`；下拉切换后改用 `{workspacePath}` 形态（D-11：只接受已登记
 *    工作区的规范路径）。未登记目录也能读：`{sessionId}` 形态允许未归属（`registered:false`），
 *    此时 choices 仍可切换，不会把入口卡死。
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
import {
  Button,
  IconRefreshOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
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
 * footer 触发按钮 + 对话框的 props（code-design §3.10 冻结）。
 *
 * 座位是 `sidebar.footer.action`（list / root），owner 只有 `{wide}`；`resolveClient` 与
 * `currentSessionId` 由座位注册面的 `inject` 提供，`t` 由 `locale: NS` 合成。
 */
export interface WorkspaceFooterActionProps {
  /** footer 座位只给 `wide`（`SidebarFooterActionOwnerProps`；`false` = 折叠成 56px 图标栏）。 */
  readonly wide?: boolean
  /** 每次动作现取（`connection` 可能晚于 `apply` 就绪，与头部入口同一纪律）。 */
  readonly resolveClient: () => PanelClient | undefined
  /** 当前会话 id 的探测（任务 7.4 的 `current-session.ts` 在装配层注入；没有会话时返回 `undefined`）。 */
  readonly currentSessionId: () => string | undefined
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 侧栏 footer 的工作区默认档入口。
 *
 * 触发按钮**恒渲染**（不因 `connection` 缺席而隐藏：入口是唯一发现面）；挂载即读一次
 * 以预热 choices，每次打开对话框再读一次（会话可能已切换）。折叠态（`wide === false`）
 * 只剩图标，`title` / `aria-label` 承担可发现性（U4 的截图确认项在组 8）。
 * @param props - 座位 owner 份额、注入的探测面与 `t`。
 * @returns footer 触发器与（打开时的）模态对话框。
 */
export function WorkspaceFooterAction(props: WorkspaceFooterActionProps): ReactNode {
  const { resolveClient, currentSessionId, t } = props
  const [open, setOpen] = useState(false)

  // `initialTarget` 每次读时现取当前会话；用 useCallback 让 hook 的 ref 骑住同一函数。
  const initialTarget = useCallback((): WorkspaceRequest => {
    const sessionId = currentSessionId()
    return sessionId === undefined || sessionId === '' ? {} : { sessionId }
  }, [currentSessionId])

  const { phase, value, error, saving, saved, read, update, select } = useWorkspaceDefaults({
    resolveClient,
    initialTarget,
  })

  // 挂载 refresh：footer 常挂，先把 choices 与当前工作区的档拉到手；失败也只是对话框里的一句话。
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

  const close = useCallback((): void => {
    setOpen(false)
  }, [])

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    // 打开时重读：会话可能已切换，工作区档也可能被命令面改过。
    if (next) void read()
  }

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<IconRefreshOutlineRegular />}
        aria-label={t('workspace.refresh')}
        disabled={phase === 'loading' || saving}
        onClick={() => {
          void read()
        }}
      >
        {t('workspace.refresh')}
      </Button>
      <Button variant="outline" size="sm" onClick={close}>
        {t('panel.close')}
      </Button>
    </>
  )

  const rail = props.wide === false

  return (
    <>
      <div className={css.workspaceEntry}>
        <Button
          variant="ghost"
          size="sm"
          className={rail ? css.workspaceEntryRail : css.workspaceEntryTrigger}
          icon={<IconWorkspaceTreeOutlineRegular />}
          aria-label={rail ? t('workspace.title') : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={t('workspace.scope')}
          onClick={toggle}
        >
          {rail ? null : <span className={css.workspaceEntryLabel}>{t('workspace.title')}</span>}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title={t('workspace.title')}
        closeLabel={t('panel.close')}
        className={css.workspaceDialog}
        contentClassName={css.content}
        footer={footer}
      >
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
              choices={value.choices}
              variant="dialog"
              saving={saving}
              saved={saved}
              failure={failure}
              onSelect={select}
              onUpdate={(action, addresses) => {
                void update(action, addresses)
              }}
              onRefresh={() => {
                void read()
              }}
              t={t}
            />
          )}
      </Modal>
    </>
  )
}
