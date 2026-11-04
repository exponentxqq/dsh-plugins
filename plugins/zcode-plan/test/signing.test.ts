import { createCipheriv, createHash, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  SIGNING_APP_ID,
  SIGNING_CLIENT_VERSION,
  SIGNING_HANDSHAKE_PATH,
  SIGNING_INFO_PRIV,
  SIGNING_KDF_SALT,
  SigningError,
  buildHandshakeBody,
  decryptPrivateCipher,
  handshakeSignature,
  handshakeUrl,
  hkdfDerive,
  parseCredential,
  powChallenge,
  randomHex,
  requestSignature,
  solvePow,
} from '../src/host/bigmodel/signing.ts'
import { BIGMODEL_OPEN } from '../src/host/bigmodel/endpoints.ts'

/**
 * 固定向量（tasks 1.2）：全部为**自造凭证**（不含任何真实机密）+ RFC 权威锚点，
 * 用本仓库 Node 工具链预计算——锚定「实现与复刻脚本逐字节一致」：
 *
 * - `handshake_sig` / `priv_kdf_key`：ikm = `test-secret-ikm-material` 的握手签名
 *   与私钥派生密钥已知答案；
 * - `biz_sig` / `pow_challenge`：消息五元组
 *   `test0000key0000id\n1700000000000\n3.17.2\n00112233445566778899aabbccddeeff\naabbccdd00112233`
 *   的 Ed25519 签名（私钥 = RFC 8032 Test 1 种子）与 PoW challenge 已知答案。
 */
const VEC_API_KEY_ID = 'test0000key0000id'
const VEC_IKM = 'test-secret-ikm-material'
const VEC_TS = '1700000000000'
const VEC_NONCE = 'aabbccdd00112233aabbccdd00112233'
const VEC_SESSION_ID = '00112233445566778899aabbccddeeff'
const VEC_HANDSHAKE_SIG = 'IsBz3JdQG1NLFvEpeWvOTOiS4yATkkWebWZWmbg9lpY='
const VEC_PRIV_KDF_KEY = '662752d5eeaac41842cd6ae7744430b6c23b1a8e8d5c1b48f0e3d26b8f194349'
const VEC_BIZ_SIG = 'nYK1yepLNGr5lsYYm/E3Qou6wNhBm6G1XTesZIK1kBg4GpAxReWR4LZ6RwKEMufDKcG0h9irbdY3L1Xh4oIPDQ=='
const VEC_POW_CHALLENGE = '845fbe8e3ac1bf84e2b676b857cf5a60'

/** RFC 8032 Test 1 私钥种子（权威 Ed25519 锚点）。 */
const RFC8032_SK_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326191903d7645935ecb0a'

/** 构造自造 JWT（三段式，payload 带 `api_key`），供 parseCredential 三段式分支。 */
function makeJwt(apiKey: string): string {
  const payload = Buffer.from(JSON.stringify({ api_key: apiKey, sub: 'grill-me' }), 'utf8').toString('base64url')
  return `header.${payload}.signature`
}

describe('parseCredential 双形态解析（tasks 1.1）', () => {
  it('两段式裸 Key → apiKey / 前段 id / 后段 secret', () => {
    const parsed = parseCredential('abc123.someSecret456')
    expect(parsed).toEqual({ field: 'apiKey', apiKeyId: 'abc123', ikm: 'someSecret456', raw: 'abc123.someSecret456' })
  })

  it('三段式 JWT → accessToken / payload.api_key / ikm=完整 token', () => {
    const raw = makeJwt('jwt-key-9911')
    const parsed = parseCredential(raw)
    expect(parsed).toEqual({ field: 'accessToken', apiKeyId: 'jwt-key-9911', ikm: raw, raw })
  })

  it('畸形：无点 / 四段 / 两段空段 各自明确报错不静默', () => {
    expect(() => parseCredential('nodot')).toThrowError(SigningError)
    expect(() => parseCredential('a.b.c.d')).toThrowError(SigningError)
    expect(() => parseCredential('.secret')).toThrowError(SigningError)
    try {
      parseCredential('nodot')
    } catch (error) {
      expect((error as SigningError).reason).toBe('CRED_SHAPE')
    }
  })

  it('畸形：JWT payload 无 api_key → JWT_PAYLOAD', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'no-key' }), 'utf8').toString('base64url')
    try {
      parseCredential(`header.${payload}.signature`)
      expect.unreachable()
    } catch (error) {
      expect((error as SigningError).reason).toBe('JWT_PAYLOAD')
    }
  })

  it('畸形：JWT payload 非 base64 → JWT_PAYLOAD（不抛原生异常）', () => {
    try {
      parseCredential('header.%%%not-base64%%%.signature')
      expect.unreachable()
    } catch (error) {
      expect((error as SigningError).reason).toBe('JWT_PAYLOAD')
    }
  })
})

describe('hkdfDerive / handshakeSignature 已知答案（tasks 1.2）', () => {
  it('hkdfDerive：ed25519_priv 派生密钥与预计算向量逐字节一致', () => {
    expect(hkdfDerive(VEC_IKM, SIGNING_INFO_PRIV).toString('hex')).toBe(VEC_PRIV_KDF_KEY)
    // 交叉锚：直接用 node hkdfSync 复算同参数（锁定 salt/info 拼装）。
    const direct = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(VEC_IKM, 'utf8'),
        Buffer.from(SIGNING_KDF_SALT, 'utf8'),
        Buffer.from(SIGNING_INFO_PRIV, 'utf8'),
        32,
      ),
    )
    expect(hkdfDerive(VEC_IKM, SIGNING_INFO_PRIV).equals(direct)).toBe(true)
  })

  it('handshakeSignature：换行分隔消息与预计算向量逐字节一致', () => {
    expect(handshakeSignature(VEC_IKM, VEC_API_KEY_ID, VEC_TS, VEC_NONCE)).toBe(VEC_HANDSHAKE_SIG)
  })

  it('handshakeUrl：BIGMODEL_OPEN + 握手路径', () => {
    expect(handshakeUrl()).toBe(`${BIGMODEL_OPEN}${SIGNING_HANDSHAKE_PATH}`)
  })

  it('buildHandshakeBody：字段名按形态二选一，sig/ts/nonce 齐全', () => {
    const bare = buildHandshakeBody(parseCredential('k1.s1'), VEC_TS, VEC_NONCE)
    expect(Object.keys(bare).sort()).toEqual(['apiKey', 'nonce', 'sig', 'ts'])
    expect(bare.apiKey).toBe('k1.s1')
    const pat = buildHandshakeBody(parseCredential(makeJwt('jwt-key-1')), VEC_TS, VEC_NONCE)
    expect(Object.keys(pat).sort()).toEqual(['accessToken', 'nonce', 'sig', 'ts'])
    expect(pat.accessToken.startsWith('header.')).toBe(true)
  })
})

describe('decryptPrivateCipher round-trip 与错误分支（tasks 1.2）', () => {
  it('自造 privateCipher 加解密 round-trip：还原出同一 PKCS#8 私钥', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const der = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer
    const kdfKey = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(VEC_IKM, 'utf8'),
        Buffer.from(SIGNING_KDF_SALT, 'utf8'),
        Buffer.from(SIGNING_INFO_PRIV, 'utf8'),
        32,
      ),
    )
    const iv = randomBytes(12)
    const plain = Buffer.from(der.toString('base64'), 'utf8')
    const enc = createCipheriv('aes-256-gcm', kdfKey, iv)
    enc.setAAD(Buffer.from(VEC_API_KEY_ID, 'utf8'))
    const body = Buffer.concat([enc.update(plain), enc.final()])
    const tag = enc.getAuthTag()
    const cipherB64 = Buffer.concat([iv, body, tag]).toString('base64')
    const restored = decryptPrivateCipher(VEC_IKM, VEC_API_KEY_ID, cipherB64)
    expect((restored.export({ format: 'der', type: 'pkcs8' }) as Buffer).equals(der)).toBe(true)
  })

  it('错误分支：长度不足 / AAD 不符 / 明文非 base64 各归 CIPHER', () => {
    expect(() => decryptPrivateCipher(VEC_IKM, VEC_API_KEY_ID, Buffer.alloc(10).toString('base64'))).toThrowError(
      SigningError,
    )
    // 正确密文 + 错 apiKeyId（AAD 不匹配 → GCM final 抛）。
    const kdfKey = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(VEC_IKM, 'utf8'),
        Buffer.from(SIGNING_KDF_SALT, 'utf8'),
        Buffer.from(SIGNING_INFO_PRIV, 'utf8'),
        32,
      ),
    )
    const iv = randomBytes(12)
    const enc = createCipheriv('aes-256-gcm', kdfKey, iv)
    enc.setAAD(Buffer.from(VEC_API_KEY_ID, 'utf8'))
    const body = Buffer.concat([enc.update(Buffer.from('aGVsbG8=', 'utf8')), enc.final()])
    const wrongAad = Buffer.concat([iv, body, enc.getAuthTag()]).toString('base64')
    try {
      decryptPrivateCipher(VEC_IKM, 'other-key-id', wrongAad)
      expect.unreachable()
    } catch (error) {
      expect((error as SigningError).reason).toBe('CIPHER')
    }
  })
})

describe('requestSignature / powChallenge / solvePow（tasks 1.2 / 1.3）', () => {
  it('requestSignature：RFC 8032 私钥 + 五元组消息与预计算向量逐字节一致', () => {
    const privateKey = createPrivateKey({
      key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(RFC8032_SK_HEX, 'hex')]),
      format: 'der',
      type: 'pkcs8',
    })
    expect(requestSignature(privateKey, VEC_API_KEY_ID, VEC_TS, VEC_SESSION_ID, VEC_NONCE)).toBe(VEC_BIZ_SIG)
  })

  it('powChallenge：已知答案一致', () => {
    expect(powChallenge(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS)).toBe(VEC_POW_CHALLENGE)
  })

  it('solvePow：解可验证（challenge+解 SHA-256 首字节为 0）', () => {
    const pow = solvePow(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS)
    const challenge = powChallenge(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS)
    expect(createHash('sha256').update(`${challenge}\n${pow}`, 'utf8').digest()[0]).toBe(0)
    expect(pow).toMatch(/^[0-9a-f]{24}[0-9a-f]{8}$/)
  })

  it('solvePow：同输入两次解不同（随机盐）', () => {
    const a = solvePow(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS)
    const b = solvePow(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS)
    expect(a).not.toBe(b)
  })

  it('solvePow：预取消信号立即中止（POW_ABORTED）', () => {
    const controller = new AbortController()
    controller.abort()
    try {
      solvePow(VEC_API_KEY_ID, VEC_SESSION_ID, VEC_TS, controller.signal)
      expect.unreachable()
    } catch (error) {
      expect((error as SigningError).reason).toBe('POW_ABORTED')
    }
  })

  it('randomHex：长度与字符集正确', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/)
    expect(randomHex(12)).toMatch(/^[0-9a-f]{24}$/)
  })

  it('协议常量：appId / clientVersion / 握手路径冻结', () => {
    expect(SIGNING_APP_ID).toBe('zcode')
    expect(SIGNING_CLIENT_VERSION).toBe('3.17.2')
    expect(SIGNING_HANDSHAKE_PATH).toBe('/api/paas/c1f3a7e2/v2/client')
  })
})
