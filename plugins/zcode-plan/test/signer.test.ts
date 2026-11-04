import { createCipheriv, createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { CODING_BASE_URL } from '../src/host/bigmodel/endpoints.ts'
import {
  SIGNING_COOLDOWN_MS,
  SIGNING_DEGRADED_THRESHOLD,
  SIGNING_RECORD_KEY,
  boundFingerprint,
  createSigner,
  type SendPort,
  type SigningRecordPort,
  type SigningKeyRecord,
} from '../src/host/bigmodel/signer.ts'
import { hkdfDerive, parseCredential, SIGNING_INFO_PRIV } from '../src/host/bigmodel/signing.ts'
import type { ClockPort, LogPort } from '../src/host/ports.ts'

/**
 * Signer 状态机集成单测（tasks 2.1–2.3）：全 fake（fetch / 时钟 / record / 日志），
 * 握手响应用真实协议自造（Ed25519 keypair + AES-GCM 加密），锁两级降级语义。
 *
 * 断言口径：**send 桩经 `Headers.entries()` 收头——头名一律小写**（Headers 规范化）。
 * D8 预握手语义：`setCredential(有效凭证)` 即触发一次后台握手（fire-and-forget），
 * 各用例的握手次数预期都把它算进去。
 */

// 夹具：自造凭证与私钥
const RAW_CRED = 'signer-key-id.test-secret-ikm-material'
const API_KEY_ID = 'signer-key-id'
const IKM = 'test-secret-ikm-material'

const { privateKey } = generateKeyPairSync('ed25519')
const PKCS8_B64 = (privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64')

/** 用真实协议自造握手成功响应（AES-256-GCM，AAD=apiKeyId，明文=base64 字符串）。 */
function handshakeEnvelope(): { code: number; data: { privateCipher: string } } {
  const key = hkdfDerive(IKM, SIGNING_INFO_PRIV)
  const iv = randomBytes(12)
  const enc = createCipheriv('aes-256-gcm', key, iv)
  enc.setAAD(Buffer.from(API_KEY_ID, 'utf8'))
  const body = Buffer.concat([enc.update(Buffer.from(PKCS8_B64, 'utf8')), enc.final()])
  return { code: 200, data: { privateCipher: Buffer.concat([iv, body, enc.getAuthTag()]).toString('base64') } }
}

function okResponse(): Response {
  return new Response('{}', { status: 200 })
}

function rejectedResponse(code: string, status = 400): Response {
  return new Response(JSON.stringify({ error: { code } }), { status })
}

/** 结算 fire-and-forget 预握手（微任务链在 setTimeout 宏任务前清空）。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * 可编程 fake fetch：握手 URL 走队列（Error 成员 = 握手失败），**握手次数在分支内
 * 累加**（Array.from 的 map 是构造期求值，不能拿数组长度当次数）。
 */
function makeFetch(options: {
  handshakeResults?: Array<Response | Error>
  onHandshake?: () => void
}) {
  const calls: string[] = []
  const handshakeResults = [...(options.handshakeResults ?? [])]
  let handshakeCount = 0
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    calls.push(`${String(init.method)} ${input}`)
    if (input.includes('/v2/client')) {
      handshakeCount += 1
      options.onHandshake?.()
      const next = handshakeResults.shift()
      if (next === undefined) throw new Error('测试握手队列空')
      if (next instanceof Error) throw next
      return next
    }
    return new Response('{}', { status: 404 })
  }
  return { fetch, calls, handshakeCount: () => handshakeCount }
}

function makeClock(): { clock: ClockPort; advance: (ms: number) => void } {
  let now = 1_700_000_000_000
  return {
    clock: { now: () => now, setTimeout: () => 0, clearTimeout: () => {} },
    advance: (ms) => {
      now += ms
    },
  }
}

function makeRecord(): { record: SigningRecordPort; rows: Map<string, SigningKeyRecord> } {
  const rows = new Map<string, SigningKeyRecord>()
  return {
    rows,
    record: {
      read: async () => rows.get(SIGNING_RECORD_KEY),
      write: async (record) => {
        rows.set(SIGNING_RECORD_KEY, record)
      },
      clear: async () => {
        rows.delete(SIGNING_RECORD_KEY)
      },
    },
  }
}

function makeLog() {
  const lines: string[] = []
  const log: LogPort = {
    info: (m) => lines.push(`info:${m}`),
    warn: (m) => lines.push(`warn:${m}`),
    error: (m) => lines.push(`error:${m}`),
  }
  return { log, lines }
}

/**
 * 组装全 fake Signer。**coding 编程响应挂在 send 桩**（intercept 直调 send、不经
 * fake fetch）：`coding(init, n)` 的 n 是 send 的调用次序（1 起），返回 Response
 * 即本次响应；省略返回 200。
 */
function makeSigner(options: {
  handshakeResults?: Array<Response | Error>
  coding?: (init: RequestInit, n: number) => Response
}) {
  const { fetch, calls, handshakeCount } = makeFetch({ handshakeResults: options.handshakeResults })
  const { clock, advance } = makeClock()
  const { record, rows } = makeRecord()
  const { log, lines } = makeLog()
  const signer = createSigner({ fetch, clock, log, record })
  const sent: Array<Record<string, string>> = []
  const send: SendPort = async (_input, init) => {
    sent.push(Object.fromEntries(new Headers(init.headers).entries()))
    const scripted = options.coding?.(init, sent.length)
    return scripted ?? okResponse()
  }
  const call = (init?: RequestInit): Promise<Response> =>
    signer.intercept(`${CODING_BASE_URL}/chat/completions`, { method: 'POST', ...init }, send)
  return { signer, call, send, sent, calls, handshakeCount, clock, advance, record, rows, log, lines }
}

describe('Signer 拦截判定（tasks 2.2）', () => {
  it('非目标（GET / 其他域）原样透传，coding 请求不注头的才计 fail-open', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle() // 预握手成功（1 次）
    const send: SendPort = async (_input, init) => {
      const headers = new Headers(init.headers)
      expect(headers.get('x-client-sig')).toBeNull() // GET / 他域不注入
      return okResponse()
    }
    const getResponse = await t.signer.intercept(`${CODING_BASE_URL}/chat/completions`, { method: 'GET' }, send)
    const otherDomain = await t.signer.intercept('https://example.com/api/coding/paas/v4/chat', { method: 'POST' }, send)
    expect(getResponse.status).toBe(200)
    expect(otherDomain.status).toBe(200)
    expect(t.handshakeCount()).toBe(1) // 仅预握手，透传不触发握手
    expect(t.signer.status().counters.signedOk).toBe(0)
  })

  it('无凭证时目标请求基线直连（不注头不握手）', async () => {
    const t = makeSigner({})
    const response = await t.call()
    expect(response.status).toBe(200)
    expect(t.sent[0] ?? {}).not.toHaveProperty('x-client-sig')
    expect(t.handshakeCount()).toBe(0)
    expect(t.signer.status().credentialFingerprint).toBeUndefined()
  })
})

describe('Signer 握手与缓存（tasks 2.1）', () => {
  it('预握手 → 目标请求注入七头 → record 落盘 → 2xx 计 signedOk', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle() // 预握手：写 record + 内存缓存
    const response = await t.call()
    expect(response.status).toBe(200)
    const headers = t.sent[0] ?? {}
    expect(headers['x-app-id']).toBe('zcode')
    expect(headers['x-client-version']).toBe('3.17.2')
    expect(headers['x-client-sig']).toBeTruthy()
    expect(headers['x-client-pow']).toMatch(/^[0-9a-f]{32}$/)
    expect(headers['x-session-id']).toMatch(/^[0-9a-f]{32}$/)
    expect(headers['x-client-ts']).toBeTruthy()
    expect(headers['x-client-nonce']).toBeTruthy()
    expect(t.signer.status().counters.signedOk).toBe(1)
    expect(t.signer.status().cached).toBe(true)
    expect(t.rows.get(SIGNING_RECORD_KEY)?.pkcs8B64).toBe(PKCS8_B64)
    expect(t.rows.get(SIGNING_RECORD_KEY)?.fingerprint).toBe(boundFingerprint(parseCredential(RAW_CRED)))
  })

  it('并发 5 请求仅 1 次握手（预握手单飞 + 内存命中共享）', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await Promise.all([settle(), t.call(), t.call(), t.call(), t.call(), t.call()])
    expect(t.handshakeCount()).toBe(1)
    expect(t.signer.status().counters.signedOk).toBe(5)
  })

  it('record 快路径：落盘私钥指纹匹配即恢复（call 阶段零握手）', async () => {
    const t = makeSigner({})
    await t.record.write({
      v: 1,
      fingerprint: boundFingerprint(parseCredential(RAW_CRED)),
      pkcs8B64: PKCS8_B64,
      createdAt: 0,
    })
    t.signer.setCredential(RAW_CRED)
    await settle() // 预握手：非 force → record 快路径命中 → 免握手恢复
    const beforeCall = t.handshakeCount()
    const response = await t.call()
    expect(response.status).toBe(200)
    expect(t.handshakeCount()).toBe(beforeCall) // call 阶段零握手（内存/record 命中）
    expect(t.signer.status().counters.signedOk).toBe(1)
  })

  it('setCredential(undefined) 清缓存 + record 清理', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle()
    expect(t.rows.get(SIGNING_RECORD_KEY)).toBeTruthy()
    t.signer.setCredential(undefined)
    expect(t.signer.status().cached).toBe(false)
    expect(t.signer.status().credentialFingerprint).toBeUndefined()
    await settle()
    expect(t.rows.get(SIGNING_RECORD_KEY)).toBeUndefined()
  })

  it('凭证形态不可解析明确报不静默（通道不启用，路由基线直连）', async () => {
    const t = makeSigner({})
    t.signer.setCredential('nodot-at-all')
    expect(t.signer.status().lastResult).toContain('credential_shape')
    const response = await t.call()
    expect(response.status).toBe(200)
    expect(t.sent[0] ?? {}).not.toHaveProperty('x-client-sig')
  })
})

describe('Signer 两级降级（D5：请求级 fail-open / 状态级 degraded）', () => {
  it('握手失败 → 当次 fail-open 透传 + 60s 冷却窗内不重握手，冷却后自动重试', async () => {
    const t = makeSigner({ handshakeResults: [new Error('handshake code=4011'), Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle() // 预握手失败 1 次 → 冷却窗
    expect(t.signer.status().counters.handshakeFailed).toBe(1)
    const duringCooldown = await t.call()
    expect(duringCooldown.status).toBe(200)
    expect(t.sent[0] ?? {}).not.toHaveProperty('x-client-sig') // 冷却窗内 fail-open 无签名
    expect(t.signer.status().counters.degradedUnsigned).toBe(1)
    t.advance(SIGNING_COOLDOWN_MS + 1)
    const afterCooldown = await t.call()
    expect(afterCooldown.status).toBe(200)
    expect((t.sent[1] ?? {})['x-client-sig']).toBeTruthy() // 冷却结束自动重试成功
    expect(t.signer.status().counters.signedOk).toBe(1)
  })

  it(`连续 ${SIGNING_DEGRADED_THRESHOLD} 次失败进入 degraded：新请求显式报错拒绝`, async () => {
    const t = makeSigner({
      handshakeResults: Array.from({ length: SIGNING_DEGRADED_THRESHOLD }, () => new Error('handshake code=4011')),
    })
    t.signer.setCredential(RAW_CRED)
    await settle() // 失败 1
    t.advance(SIGNING_COOLDOWN_MS + 1)
    await t.call() // 失败 2（fail-open）
    t.advance(SIGNING_COOLDOWN_MS + 1)
    await t.call() // 失败 3 → degraded
    expect(t.signer.status().degraded).toBe(true)
    await expect(t.call()).rejects.toThrowError(/止损/)
    expect(t.signer.status().counters.degradedRejected).toBe(1)
    expect(t.lines.some((l) => l.includes('止损态'))).toBe(true)
  })

  it('resetFailures 恢复止损态并重握手成功', async () => {
    const t = makeSigner({
      handshakeResults: [
        new Error('handshake code=4011'),
        new Error('handshake code=4011'),
        new Error('handshake code=4011'),
        Response.json(handshakeEnvelope()),
      ],
    })
    t.signer.setCredential(RAW_CRED)
    await settle() // 失败 1
    t.advance(SIGNING_COOLDOWN_MS + 1)
    await t.call() // 失败 2
    t.advance(SIGNING_COOLDOWN_MS + 1)
    await t.call() // 失败 3 → degraded
    expect(t.signer.status().degraded).toBe(true)
    t.signer.resetFailures()
    expect(t.signer.status().degraded).toBe(false)
    t.advance(SIGNING_COOLDOWN_MS + 1)
    const response = await t.call() // 队列第 4 个：握手成功
    expect(response.status).toBe(200)
    expect((t.sent[2] ?? {})['x-client-sig']).toBeTruthy()
    expect(t.signer.status().counters.signedOk).toBe(1)
  })

  it('签名被拒 → 失效重握手 → 重签重发成功（恢复路径）', async () => {
    const t = makeSigner({
      handshakeResults: [Response.json(handshakeEnvelope()), Response.json(handshakeEnvelope())],
      coding: (_init, n) => (n === 1 ? rejectedResponse('VERIFY_SIGNATURE_INVALID') : okResponse()),
    })
    t.signer.setCredential(RAW_CRED)
    await settle()
    const response = await t.call()
    expect(response.status).toBe(200)
    expect(t.signer.status().counters.signedOk).toBe(1)
    expect(t.signer.status().lastResult).toBe('signed_after_resign')
    expect(t.handshakeCount()).toBe(2) // 预握手 + 重握手
  })

  it('重签重发仍被拒 → 请求级 fail-open（第三发无签名版，透传被拒响应）', async () => {
    const t = makeSigner({
      handshakeResults: [Response.json(handshakeEnvelope()), Response.json(handshakeEnvelope())],
      coding: () => rejectedResponse('3007'),
    })
    t.signer.setCredential(RAW_CRED)
    await settle()
    const response = await t.call()
    expect(response.status).toBe(400) // 第三发 = 无签名版原样透传被拒响应
    expect(t.sent[2] ?? {}).not.toHaveProperty('x-client-sig') // fail-open 无签名版
    expect(t.signer.status().counters.resignFailed).toBe(1)
    expect(t.signer.status().lastResult).toBe('resign_rejected:3007')
  })

  it('非签名原因的 4xx 原样透传（不触发重握手）', async () => {
    const t = makeSigner({
      handshakeResults: [Response.json(handshakeEnvelope())],
      coding: () => rejectedResponse('RATE_LIMIT', 429),
    })
    t.signer.setCredential(RAW_CRED)
    await settle()
    const response = await t.call()
    expect(response.status).toBe(429)
    expect(t.signer.status().counters.resignFailed).toBe(0)
    expect(t.handshakeCount()).toBe(1) // 仅预握手
  })
})

describe('Signer epoch 竞态与事件计数（tasks 2.1/2.3）', () => {
  it('同凭证重复 setCredential 是 no-op（不重握手）', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle()
    expect(t.signer.status().cached).toBe(true)
    const before = t.handshakeCount()
    t.signer.setCredential(RAW_CRED)
    await settle()
    expect(t.handshakeCount()).toBe(before)
  })

  it('状态快照各字段：counters / lastHandshakeAt / lastResult 落点', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle()
    await t.call()
    const status = t.signer.status()
    expect(status.counters.signedOk).toBe(1)
    expect(status.counters.handshakeFailed).toBe(0)
    expect(status.lastHandshakeAt).toBeGreaterThan(0)
    expect(status.lastResult).toBe('signed')
    expect(status.credentialFingerprint).toBe(boundFingerprint(parseCredential(RAW_CRED)))
  })

  it('PoW 解可独立验证（challenge + x-client-pow 的 SHA-256 首字节为 0）', async () => {
    const t = makeSigner({ handshakeResults: [Response.json(handshakeEnvelope())] })
    t.signer.setCredential(RAW_CRED)
    await settle()
    await t.call()
    const pow = (t.sent[0] ?? {})['x-client-pow'] ?? ''
    const ts = (t.sent[0] ?? {})['x-client-ts'] ?? ''
    const sessionId = (t.sent[0] ?? {})['x-session-id'] ?? ''
    const challenge = createHash('sha256').update(`${API_KEY_ID}\nzcode\n${sessionId}\n${ts}`, 'utf8').digest('hex').slice(0, 32)
    expect(createHash('sha256').update(`${challenge}\n${pow}`, 'utf8').digest()[0]).toBe(0)
  })
})
