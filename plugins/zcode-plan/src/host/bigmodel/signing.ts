/**
 * 官方客户端请求签名协议（纯函数层；zcode-plan-signed-channel 组 1）。
 *
 * 协议出处：官方 ZCode runtime（`zcode-app-cli@3.17.2-44` 内嵌 `zcode.cjs`）逆向 +
 * 纯 Node 复刻实测命中折扣（RE-8；`/home/docker/.cache/zcode-rate-test/replicate-sign.mjs`）。
 * 本模块只做**确定性协议原语**：常量、凭证解析（双形态）、HKDF/HMAC/AES-GCM/Ed25519/PoW——
 * 不持有状态、不碰网络（状态机与 fetch 包装在 `signer.ts`，组 2）。
 *
 * 协议概要（逐行对齐复刻脚本）：
 * 1. `get_sign_key` 握手：`POST {BIGMODEL_OPEN}{SIGNING_HANDSHAKE_PATH}`，体
 *    `{[field]: 凭证原文, nonce, sig, ts}`（`field` = `apiKey`（裸 Key）/ `accessToken`（PAT））；
 *    sig = HMAC-SHA256(HKDF(IKM, info='getSignKey_hmac'),
 *    `get_sign_key\n<apiKeyId>\n<ts>\n<nonce>`)——**换行分隔**（空格分隔 4011 实证）。
 * 2. 私钥解密：AES-256-GCM（key = HKDF(IKM, info='ed25519_priv')、iv = cipher[0:12]、
 *    AAD = apiKeyId、tag = 末 16 字节），明文是 base64 字符串**再解一层**得 PKCS#8 Ed25519。
 * 3. 每请求签名：Ed25519 over `<apiKeyId>\n<ts>\n<version>\n<sessionId>\n<nonce>`
 *    （换行分隔）→ `X-Client-Sig`（base64）。
 * 4. PoW（8-bit）：challenge = SHA-256(`<apiKeyId>\nzcode\n<sessionId>\n<ts>`) hex 前 32 字符；
 *    解 = `<12 字节随机 hex><counter 8 位 hex>`，使 SHA-256(`<challenge>\n<解>`) 首字节为 0。
 *
 * 机密纪律（同 D-12）：本模块函数的入参含机密（IKM / 私钥），但**返回值与错误文案不含**——
 * {@link SigningError} 文案只含原因分类与结构描述，不回显任何凭证 / 密钥材料。
 *
 * @module dsh-plugin-zcode-plan/host/bigmodel/signing
 */

import {
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as edSign,
  type KeyObject,
} from 'node:crypto'
import { BIGMODEL_OPEN } from './endpoints.ts'

// ---------------------------------------------------------------------------
// 协议常量（tasks 1.1 的「常量集中」出处；官方升级时人工改这里，明确报错不伪装）
// ---------------------------------------------------------------------------

/** HKDF salt（官方 `WD_CLIENT_SIGN_KDF_SALT` 字面字符串）。 */
export const SIGNING_KDF_SALT = 'WD_CLIENT_SIGN_KDF_SALT'

/** 官方 appId（`X-App-Id` / PoW challenge 成分）。 */
export const SIGNING_APP_ID = 'zcode'

/** 握手路径（版本 hash `c1f3a7e2` 为官方当前值；升级变更时此处集中修改）。 */
export const SIGNING_HANDSHAKE_PATH = '/api/paas/c1f3a7e2/v2/client'

/** 官方客户端版本（签名消息第三成分与 `X-Client-Version`）。 */
export const SIGNING_CLIENT_VERSION = '3.17.2'

/** HKDF info：握手认证密钥。 */
export const SIGNING_INFO_HANDSHAKE = 'getSignKey_hmac'

/** HKDF info：私钥解密密钥。 */
export const SIGNING_INFO_PRIV = 'ed25519_priv'

/** PoW 难度（前导零位数）。 */
export const SIGNING_POW_BITS = 8

/** PoW 随机盐字节数（hex 后 24 字符）。 */
export const SIGNING_POW_SALT_BYTES = 12

/** nonce / sessionId 的随机字节数（hex 后 32 字符，对齐复刻实验）。 */
export const SIGNING_RANDOM_BYTES = 16

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

/** 签名协议失败原因分类（错误文案不回显任何机密——只含分类与结构描述）。 */
export type SigningErrorReason =
  | 'CRED_SHAPE'
  | 'JWT_PAYLOAD'
  | 'CIPHER'
  | 'POW_EXHAUSTED'
  | 'POW_ABORTED'

/** 签名协议层错误（`parseCredential` / 解密 / PoW 的统一载体；组 2 转译成事件计数）。 */
export class SigningError extends Error {
  /** 失败原因分类（状态面 / 单测的判定键）。 */
  readonly reason: SigningErrorReason

  /**
   * @param reason - 失败原因分类。
   * @param message - 对人结构描述（**不得含机密值**）。
   */
  constructor(reason: SigningErrorReason, message?: string) {
    super(message ?? reason)
    this.name = 'SigningError'
    this.reason = reason
  }
}

// ---------------------------------------------------------------------------
// 凭证解析（D2：双形态，PAT 一等公民）
// ---------------------------------------------------------------------------

/** 握手体的凭证字段名（官方按形态二选一）。 */
export type CredentialField = 'apiKey' | 'accessToken'

/** 解析产物：`field` 是握手体键名，`apiKeyId` 是签名与 AAD 绑定键，`ikm` 是 HKDF 输入。 */
export interface ParsedCredential {
  readonly field: CredentialField
  readonly apiKeyId: string
  /** HKDF 输入机密：裸 Key 取 secret 段；PAT 取完整 token。 */
  readonly ikm: string
  /** 凭证原文（握手体字段值；PAT 分支即完整 token）。 */
  readonly raw: string
}

/**
 * 凭证双形态解析（D2；对齐官方 `nPr` 语义）：
 *
 * - 两段式 `id.secret`（裸 API Key）→ `{field: 'apiKey', apiKeyId: 前段, ikm: 后段}`；
 * - 三段式 JWT / PAT → payload 的 `api_key` 字段作 apiKeyId、`ikm` = 完整 token、
 *   `field: 'accessToken'`；
 * - 其余（无点 / 多于三段 / 空段 / payload 无 `api_key`）→ {@link SigningError}
 *   明确报错不静默（官方实现静默不签名——本设计改为显式失败，避免静默丢折扣）。
 *
 * @param raw - 凭证原文（裸 Key 或 PAT）。
 * @returns 解析产物。
 * @throws 形态不符时 {@link SigningError}（reason = `CRED_SHAPE` / `JWT_PAYLOAD`）。
 */
export function parseCredential(raw: string): ParsedCredential {
  const segments = raw.split('.')
  if (segments.length === 2) {
    const [id, secret] = segments as [string, string]
    if (id.length === 0 || secret.length === 0) {
      throw new SigningError('CRED_SHAPE', '两段式凭证存在空段')
    }
    return { field: 'apiKey', apiKeyId: id, ikm: secret, raw }
  }
  if (segments.length === 3) {
    const apiKeyId = jwtApiKey(segments[1] ?? '')
    if (apiKeyId === undefined) {
      throw new SigningError('JWT_PAYLOAD', 'JWT payload 缺 api_key 字段')
    }
    return { field: 'accessToken', apiKeyId, ikm: raw, raw }
  }
  throw new SigningError('CRED_SHAPE', `凭证段数 ${segments.length} 不属任何已知形态（两段式 / 三段式）`)
}

/** 从 JWT payload 段（base64url）提取 `api_key` 字段；解析失败或缺字段返回 `undefined`。 */
function jwtApiKey(payloadSegment: string): string | undefined {
  try {
    const b64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const json: unknown = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    const value = (json as Record<string, unknown>).api_key
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// 密钥派生与握手材料
// ---------------------------------------------------------------------------

/**
 * HKDF-SHA256 派生（32 字节；salt = {@link SIGNING_KDF_SALT} 字面字符串）。
 *
 * @param ikm - 输入机密（裸 Key 的 secret 段或完整 PAT）。
 * @param info - 用途分离串（`getSignKey_hmac` / `ed25519_priv`）。
 * @returns 32 字节派生密钥。
 */
export function hkdfDerive(ikm: string, info: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(ikm, 'utf8'), Buffer.from(SIGNING_KDF_SALT, 'utf8'), Buffer.from(info, 'utf8'), 32),
  )
}

/**
 * 握手认证签名：HMAC-SHA256(key = HKDF(IKM, 'getSignKey_hmac'),
 * `get_sign_key\n<apiKeyId>\n<ts>\n<nonce>`) 的 base64。
 *
 * @param ikm - 输入机密。
 * @param apiKeyId - 凭证键 id。
 * @param ts - 毫秒时间戳字符串。
 * @param nonce - 随机 nonce（hex）。
 * @returns base64 签名（握手体 `sig` 字段值）。
 */
export function handshakeSignature(ikm: string, apiKeyId: string, ts: string, nonce: string): string {
  const key = hkdfDerive(ikm, SIGNING_INFO_HANDSHAKE)
  return createHmac('sha256', key)
    .update(`get_sign_key\n${apiKeyId}\n${ts}\n${nonce}`, 'utf8')
    .digest('base64')
}

/**
 * 构造握手完整 URL（域取 `endpoints.ts` 的 `BIGMODEL_OPEN`，路径为本模块常量）。
 */
export function handshakeUrl(): string {
  return `${BIGMODEL_OPEN}${SIGNING_HANDSHAKE_PATH}`
}

/**
 * 构造握手请求体 `{[field]: 凭证原文, nonce, sig, ts}`（`field` 按凭证形态二选一）。
 *
 * @param cred - 已解析凭证。
 * @param ts - 毫秒时间戳字符串。
 * @param nonce - 随机 nonce（hex）。
 * @returns JSON 可序列化请求体。
 */
export function buildHandshakeBody(cred: ParsedCredential, ts: string, nonce: string): Record<string, string> {
  return {
    [cred.field]: cred.raw,
    nonce,
    sig: handshakeSignature(cred.ikm, cred.apiKeyId, ts, nonce),
    ts,
  }
}

// ---------------------------------------------------------------------------
// 私钥解密与请求签名
// ---------------------------------------------------------------------------

/**
 * 解密服务端下发的 `privateCipher`（AES-256-GCM → base64 再解一层 → PKCS#8）。
 *
 * 结构：iv = cipher[0:12]、密文体 = cipher[12:-16]、tag = 末 16 字节、AAD = apiKeyId；
 * 明文是 base64 **字符串**（官方 `boo(new TextDecoder().decode(i))`），再解一层才是
 * PKCS#8 DER。
 *
 * @param ikm - 输入机密（派生解密密钥）。
 * @param apiKeyId - AAD 绑定键。
 * @param cipherB64 - 服务端 `data.privateCipher`（base64）。
 * @returns Ed25519 私钥对象。
 * @throws 结构 / 解密 / 导入失败时 {@link SigningError}（reason = `CIPHER`）。
 */
export function decryptPrivateCipher(ikm: string, apiKeyId: string, cipherB64: string): KeyObject {
  const cipher = Buffer.from(cipherB64, 'base64')
  if (cipher.length < 12 + 16 + 1) {
    throw new SigningError('CIPHER', 'privateCipher 长度不足（< 29 字节）')
  }
  const key = hkdfDerive(ikm, SIGNING_INFO_PRIV)
  const plain = createDecipheriv('aes-256-gcm', key, cipher.subarray(0, 12))
  plain.setAAD(Buffer.from(apiKeyId, 'utf8'))
  plain.setAuthTag(cipher.subarray(cipher.length - 16))
  let plainB64: Buffer
  try {
    plainB64 = Buffer.concat([plain.update(cipher.subarray(12, cipher.length - 16)), plain.final()])
  } catch {
    throw new SigningError('CIPHER', 'privateCipher 解密失败（密钥或 AAD 不匹配）')
  }
  let der: Buffer
  try {
    der = Buffer.from(plainB64.toString('utf8'), 'base64')
  } catch {
    throw new SigningError('CIPHER', '解密明文不是合法 base64 字符串')
  }
  try {
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
  } catch {
    throw new SigningError('CIPHER', '解密结果不是合法 PKCS#8 私钥')
  }
}

/**
 * 每请求 Ed25519 签名（`X-Client-Sig`）：消息为换行分隔五元组
 * `<apiKeyId>\n<ts>\n<version>\n<sessionId>\n<nonce>`，base64 输出。
 *
 * @param privateKey - 握手取得的 Ed25519 私钥。
 * @param apiKeyId - 凭证键 id。
 * @param ts - 毫秒时间戳字符串（与本请求 `X-Client-Ts` 同值）。
 * @param sessionId - 会话 id（hex）。
 * @param nonce - 本请求随机 nonce（hex）。
 * @returns base64 签名。
 */
export function requestSignature(
  privateKey: KeyObject,
  apiKeyId: string,
  ts: string,
  sessionId: string,
  nonce: string,
): string {
  const message = `${apiKeyId}\n${ts}\n${SIGNING_CLIENT_VERSION}\n${sessionId}\n${nonce}`
  return edSign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64')
}

// ---------------------------------------------------------------------------
// PoW（8-bit 前导零）
// ---------------------------------------------------------------------------

/**
 * PoW challenge：SHA-256(`<apiKeyId>\nzcode\n<sessionId>\n<ts>`) hex 前 32 字符。
 */
export function powChallenge(apiKeyId: string, sessionId: string, ts: string): string {
  return createHash('sha256')
    .update(`${apiKeyId}\n${SIGNING_APP_ID}\n${sessionId}\n${ts}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/**
 * PoW 求解（同步循环；每 1024 次迭代让位检查取消信号——D4）。
 *
 * 候选解 = `<12 字节随机 hex><counter 8 位 hex>`，满足
 * SHA-256(`<challenge>\n<候选解>`) 首字节为 0（{@link SIGNING_POW_BITS} 前导零位）。
 * 平均 ~256 次哈希（<5ms），同步求解与官方实现同型。
 *
 * @param apiKeyId - challenge 成分。
 * @param sessionId - challenge 成分。
 * @param ts - challenge 成分（毫秒时间戳字符串）。
 * @param signal - 取消信号（可省）。
 * @returns 候选解字符串（`X-Client-Pow` 头值）。
 * @throws 取消时 reason = `POW_ABORTED`；counter 穷尽时 reason = `POW_EXHAUSTED`。
 */
export function solvePow(apiKeyId: string, sessionId: string, ts: string, signal?: AbortSignal): string {
  const challenge = powChallenge(apiKeyId, sessionId, ts)
  const salt = randomBytes(SIGNING_POW_SALT_BYTES).toString('hex')
  for (let counter = 0; counter <= 0xffffffff; counter++) {
    if (counter % 1024 === 0 && signal?.aborted === true) {
      throw new SigningError('POW_ABORTED', 'PoW 求解被取消')
    }
    const candidate = `${salt}${counter.toString(16).padStart(8, '0')}`
    if (createHash('sha256').update(`${challenge}\n${candidate}`, 'utf8').digest()[0] === 0) {
      return candidate
    }
  }
  throw new SigningError('POW_EXHAUSTED', 'PoW counter 穷尽无解')
}

// ---------------------------------------------------------------------------
// 随机材料
// ---------------------------------------------------------------------------

/**
 * 生成 hex 随机串（nonce / sessionId 用；字节量 {@link SIGNING_RANDOM_BYTES} → 32 hex 字符）。
 *
 * @param bytes - 随机字节数。
 * @returns hex 字符串。
 */
export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}
