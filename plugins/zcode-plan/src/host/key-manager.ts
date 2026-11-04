/**
 * 桥接 Key 的 find-or-create 管理器（H10；C5 / D-10 / D-14）。
 *
 * 本模块把「桥接 Key」的定位收口成一个有状态的小对象：缓存命中的 `keyId`
 * 直接复用（续期路径零额外往返）；未命中时 `listKeys` 按**双条件**查找
 * （`name === 'zcode-plan-bridge'` && `usageScene === 1`——C5：scene=1 才能换
 * PAT，存量 scene=3 Key 不得误用）；仍没有才 `createKey` 新建（体由 client
 * 统一发 `{ name, usageScene: 1 }`，取 `data.apiKey` 作 keyId）。
 *
 * RE 纪律（D-14）：**永不删改存量 Key**——本模块没有任何删除/改名路径；同名
 * 存量 Key（哪怕不是本插件建的）只要双条件命中就复用。多行同时命中时取第一行。
 *
 * 失效与重查：PAT 签发拿到 `KEY_LOST`（HTTP 404，client 层映射）说明缓存的
 * keyId 已失效（Key 被人删了），owner 调 {@link KeyManager.invalidateKey} 清
 * 缓存后重新 `ensureKey`（重新 find-or-create）——重查**最多一轮**、由 owner
 * 侧计数把守（防 invalidate → issue → invalidate 的环）。作废只清缓存，**不
 * 调任何服务端删除**。
 *
 * 状态（§3.5 第二级 KeyState）随流程推进：`creating`（find-or-create 进行中）
 * → `ready`（拿到 keyId）→ 失败/作废回 `unknown`。
 *
 * @module dsh-plugin-zcode-plan/host/key-manager
 */

import type { BigmodelClient } from './bigmodel/client.ts'
import { KEY_USAGE_SCENE } from './bigmodel/endpoints.ts'
import type { LoginGrant } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import type { LogPort } from './ports.ts'

/** 桥接 Key 的显示名（D-10 双条件之一；createKey 与 listKeys 匹配都用它）。 */
export const KEY_NAME = 'zcode-plan-bridge'

/** Key 状态（§3.5 状态机第二级；status 渲染的读数来源）。 */
export type KeyState = { kind: 'unknown' } | { kind: 'ready'; keyId: string } | { kind: 'creating' }

/** `ensureKey` 的入参（H10 记名 `{client, grant}`）：client 在调用侧注入，本模块不持有。 */
export interface EnsureKeyInput {
  /** bigmodel 客户端面（listKeys / createKey 都走它）。 */
  client: BigmodelClient
  /** 登录 grant（取 `jwt` 与身份字段；由调用方保证 organization/project 已解析）。 */
  grant: LoginGrant
}

/** 桥接 Key 管理面（H10）。 */
export interface KeyManager {
  /**
   * find-or-create：缓存命中直接返回；否则 `listKeys` 双条件查找命中即复用其
   * keyId（client 已把响应的 `apiKey` 字段收紧为 `keyId`）；都没有则 `createKey`
   * 取新 keyId。失败原样上抛 `BridgeError`（分类由 owner 做），状态回 `unknown`。
   */
  ensureKey(input: EnsureKeyInput): Promise<string>
  /**
   * 作废缓存的 keyId（PAT 签发 404 后由 owner 调用；下一轮 `ensureKey` 重新
   * find-or-create）。只清「仍与缓存一致」的 keyId：迟到代次的作废不会误清
   * 新代次刚查到的缓存。
   */
  invalidateKey(keyId: string): void
  /** 当前 Key 状态（§3.5 KeyState；返回快照拷贝）。 */
  state(): KeyState
}

/**
 * 造桥接 Key 管理器（H10）。并发约束：owner 已单飞，本模块不做自己的单飞。
 *
 * @param deps.log - 诊断出口（复用/新建/作废各留一行，只含名字与 keyId——
 *   keyId 非 secret，可进日志）。
 */
export function createKeyManager(deps: { log: LogPort }): KeyManager {
  let keyState: KeyState = { kind: 'unknown' }
  let cachedKeyId: string | undefined

  return {
    async ensureKey(input: EnsureKeyInput): Promise<string> {
      // 缓存命中：零网络直接复用（失效由换 PAT 的 404 → invalidate 重查兜底）。
      if (cachedKeyId !== undefined) {
        keyState = { kind: 'ready', keyId: cachedKeyId }
        return cachedKeyId
      }
      const { jwt, organization, project } = input.grant
      if (organization === undefined || project === undefined || !jwt || jwt.length === 0) {
        throw new BridgeError('AUTH_STATE', '登录记录缺少 organization/project，无法定位桥接 Key，请重新登录')
      }
      keyState = { kind: 'creating' }
      try {
        const rows = await input.client.listKeys({ jwt, organization, project })
        // 双条件命中（C5/D-10）：名 + usageScene===1；永不删改存量 Key（D-14）。
        const hit = rows.find((row) => row.name === KEY_NAME && row.usageScene === KEY_USAGE_SCENE)
        const keyId =
          hit !== undefined
            ? hit.keyId
            : await input.client.createKey({ jwt, organization, project, name: KEY_NAME })
        cachedKeyId = keyId
        keyState = { kind: 'ready', keyId }
        deps.log.info(
          hit !== undefined
            ? `已复用桥接 Key（${KEY_NAME}，usageScene=${KEY_USAGE_SCENE}）`
            : `已新建桥接 Key（${KEY_NAME}，usageScene=${KEY_USAGE_SCENE}）`,
        )
        return keyId
      } catch (error) {
        keyState = { kind: 'unknown' }
        throw error
      }
    },

    invalidateKey(keyId: string): void {
      if (cachedKeyId !== keyId) {
        // 缓存已不是这个 keyId（从未就绪 / 已被换掉 / 已作废）：无需动作。
        return
      }
      cachedKeyId = undefined
      keyState = { kind: 'unknown' }
      // 只清本地缓存，不调任何服务端删除（D-14：永不删改存量 Key）。
      deps.log.warn(`桥接 Key 缓存已作废（${KEY_NAME}），下轮将重新查找`)
    },

    state(): KeyState {
      return { ...keyState }
    },
  }
}
