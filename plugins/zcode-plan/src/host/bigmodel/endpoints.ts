/**
 * bigmodel / zcode 端点与契约字面量的唯一出处（H4；R2 的收口点）。
 *
 * **所有会被上游改动的 URL、路径模板与请求字面量都集中在本文件**：`client.ts`
 * 与后续任务（login-flow / loopback / route-config）一律从这里 import，文件内
 * 之外不允许出现 `https://` 字面量（tasks.md 3.1 的验证句即查这一点）。
 *
 * 实测出处（T0）：`spike-token-contract.md`（换证端点与响应字段）、
 * `spike-loopback.md`（authorize 端点本体与回调路径）、`spike-pat-mutex.md`
 * （PAT 签发响应字段）、`test-b.sh` / `test-pat.sh`（列 Key / 建 Key / 用量）。
 * 头形态的不对称（管理面 `Bearer`、用量裸 JWT）在 `client.ts` 处标注，此处只收 URL。
 *
 * @module dsh-plugin-zcode-plan/host/bigmodel/endpoints
 */

/** bigmodel.cn 管理面域（列 Key / 建 Key / 换 PAT 的 biz API 与授权页都在此域）。 */
export const BIGMODEL_WEB = 'https://bigmodel.cn'

/** bigmodel 开放平台域（Coding Plan 的 completions 入口，路由声明用）。 */
export const BIGMODEL_OPEN = 'https://open.bigmodel.cn'

/** Coding Plan 的 OpenAI 兼容入口（路由 `baseURL`；PAT 直接以它调用 completions）。 */
export const CODING_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'

/**
 * 授权页端点本体（RE-4：`bigmodel.cn/login`，非 `/api/auth/authorize`——后者带
 * JWT 请求返回 404 已证伪）。完整授权 URL 由 T5 构造：
 * `?appId=<AUTHORIZE_APP_ID>&redirect=<urlencoded>&state=<32hex>`。
 */
export const AUTHORIZE_URL = `${BIGMODEL_WEB}/login`

/** 授权页 `appId` 固定值（RE-4 / T0 源码佐证：zcode 客户端走 `appId=zcode`）。 */
export const AUTHORIZE_APP_ID = 'zcode'

/**
 * 登录换证端点（RE-1 / T0 钉死的**现行**路径）。
 *
 * `POST` JSON `{ provider, code, redirect_uri, state }`（免 appSecret），成功判定
 * `code===0`，管理面 JWT 在 `data.bigmodel.access_token`。常量名沿用设计期的
 * `TOKEN_BY_AUTH_CODE_URL`（旧 `bigmodel.cn/api/auth/tokenByAuthCode` 端点已废弃
 * 不实现——它要求官方已不内置的 `appSecret`，实测业务码 1500）。
 */
export const TOKEN_BY_AUTH_CODE_URL = 'https://zcode.z.ai/api/v1/oauth/token'

/** 本地回环回调路径（loopback 服务器监听 + authorize `redirect` 尾段，逐字一致）。 */
export const CALLBACK_PATH = '/oauth/callback/bigmodel'

/**
 * 用量读数端点（T0 实测在 **www** 域，与管理面 biz API 的裸域不同）。
 * `GET`，头形态见 `client.ts`（裸 JWT + `bigmodel-organization` + `bigmodel-project`）。
 */
export const USAGE_LIMIT_URL = 'https://www.bigmodel.cn/api/monitor/usage/quota/limit'

/** 换 PAT 时上报的 `clientVersion` 缺省值（跟随官方 ZCode 客户端版本，T0 实测值）。 */
export const DEFAULT_CLIENT_VERSION = '0.17.0'

/** 换 PAT 请求体的 `clientType` 固定值（`test-pat.sh:14-18` 实测）。 */
export const CLIENT_TYPE = 'zcode'

/** 换证请求体的 `provider` 固定值（RE-1：`{provider:'bigmodel', …}`）。 */
export const PROVIDER = 'bigmodel'

/** 建桥接 Key 的 `usageScene` 固定值（scene=1 才能换 PAT；存量 scene=3 Key 不得误用，C5）。 */
export const KEY_USAGE_SCENE = 1

/** biz API 里 Key 资源的路径模板（org / proj 为路径段，按 T0 实测逐字拼接）。 */
function keyBasePath(organization: string, project: string): string {
  return `${BIGMODEL_WEB}/api/biz/v1/organization/${organization}/projects/${project}/api_keys`
}

/**
 * 列 Key 的完整 URL（`GET`；`data: [{ name, apiKey, usageScene, … }]`，
 * `apiKey` 字段即路径语义里的 keyId）。
 */
export function keyListPath(organization: string, project: string): string {
  return keyBasePath(organization, project)
}

/**
 * 建 Key 的完整 URL（`POST`，与列 Key **同一路径**；体 `{ name, usageScene }`，
 * `data.apiKey` 为新 keyId）。
 */
export function keyCreatePath(organization: string, project: string): string {
  return keyListPath(organization, project)
}

/**
 * 换 PAT 的完整 URL（`POST` `<key 列表路径>/{keyId}/access_tokens`；
 * 体 `{ clientType, clientVersion }`）。
 */
export function patIssuePath(organization: string, project: string, keyId: string): string {
  return `${keyBasePath(organization, project)}/${keyId}/access_tokens`
}
