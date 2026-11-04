// 折扣对拍·签名臂探针：插件线格式逐字复刻（PAT 三段式分支）——协议常量与头组
// 对齐 plugins/zcode-plan/src/host/bigmodel/{signing.ts,signer.ts}：
//   field='accessToken'、握手体 {accessToken,nonce,sig,ts}、Authorization: Bearer <PAT>、
//   apiKeyId 取 JWT payload 的 api_key、IKM = 完整 PAT。
// 无签名对照臂就是一条普通 curl（见 verify-discount.sh 的 probeB），无需脚本。
// 用法：PAT=<token> BODY_FILE=<body.json> node replicate-sign-pat.mjs [端点base] [模型]
//       HANDSHAKE_ONLY=1 只验握手解密（零额度消耗，预检用）
// stdout 单行：http=… prompt=… cached=… out=… theory=<理论积分>
//   理论积分 = (非缓存输入×2.3 + 缓存命中×1.7 + 输出×24)/10000（GLM-5.3 官方系数）。
// 来源：/home/docker/.cache/zcode-rate-test/replicate-sign-pat.mjs（signed-channel 4.2 验收原始现场）。
import crypto from 'node:crypto'
import fs from 'node:fs'

const PAT = process.env.PAT || ''
const BASE = process.argv[2] || 'https://open.bigmodel.cn/api/coding/paas/v4'
const MODEL = process.env.MODEL || process.argv[3] || 'glm-5.3'
const KDF_SALT = 'WD_CLIENT_SIGN_KDF_SALT' // SIGNING_KDF_SALT
const APP_ID = 'zcode' // SIGNING_APP_ID
const HS_PATH = '/api/paas/c1f3a7e2/v2/client' // SIGNING_HANDSHAKE_PATH
const CLIENT_VERSION = '3.17.2' // SIGNING_CLIENT_VERSION
const UA = 'ZCode/3.17.2 ai-sdk/provider-utils/4.0.39 runtime/node.js/24' // signer.ts ZCODE_USER_AGENT

const enc = (s) => { return new TextEncoder().encode(s) }
const b64 = (u8) => { return Buffer.from(u8).toString('base64') }
const hex = (u8) => { return Array.from(u8).map((b) => { return b.toString(16).padStart(2, '0') }).join('') }
const rndHex = (n) => { return hex(crypto.getRandomValues(new Uint8Array(n))) }
const hkdf = (ikm, info) => { return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(ikm, 'utf8'), Buffer.from(KDF_SALT, 'utf8'), Buffer.from(info, 'utf8'), 32)) }

// parseCredential 三段式分支：apiKeyId = JWT payload.api_key，ikm = 完整 PAT
function parsePat(token) {
  const seg = token.split('.')
  if (seg.length !== 3) throw new Error('PAT 不是三段式')
  const payload = JSON.parse(Buffer.from(seg[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  if (typeof payload.api_key !== 'string' || payload.api_key.length === 0) throw new Error('JWT payload 缺 api_key')
  return { apiKeyId: payload.api_key, ikm: token }
}

if (!PAT) {
  console.error('缺 PAT 环境变量（先跑 refresh-snap.mjs 刷新快照）')
  process.exit(1)
}
if (!process.env.BODY_FILE && process.env.HANDSHAKE_ONLY !== '1') {
  console.error('缺 BODY_FILE 环境变量')
  process.exit(1)
}
void MODEL

const body = process.env.BODY_FILE ? fs.readFileSync(process.env.BODY_FILE, 'utf8') : ''

;(async () => {
  const cred = parsePat(PAT)
  console.error(`① 解析 PAT：apiKeyId=${cred.apiKeyId}`)

  const ts0 = String(Date.now())
  const nonce0 = rndHex(16)
  const sig0 = b64(crypto.createHmac('sha256', hkdf(cred.ikm, 'getSignKey_hmac'))
    .update(`get_sign_key\n${cred.apiKeyId}\n${ts0}\n${nonce0}`, 'utf8').digest())
  console.error('② 握手 get_sign_key（accessToken 分支）…')
  const hs = await fetch(`https://open.bigmodel.cn${HS_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: PAT, nonce: nonce0, sig: sig0, ts: ts0 }),
  })
  const j = await hs.json().catch(() => { return {} })
  if (j.code !== 200) throw new Error(`握手失败 http=${hs.status} code=${j.code} msg=${j.msg}`)
  const cipher = Buffer.from(j.data.privateCipher, 'base64')
  const key = hkdf(cred.ikm, 'ed25519_priv')
  const plain = crypto.createDecipheriv('aes-256-gcm', key, cipher.subarray(0, 12))
  plain.setAAD(enc(cred.apiKeyId))
  plain.setAuthTag(cipher.subarray(cipher.length - 16))
  const plainB64 = Buffer.concat([plain.update(cipher.subarray(12, cipher.length - 16)), plain.final()])
  const pkcs8 = Buffer.from(plainB64.toString('utf8'), 'base64')
  const priv = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  console.error('   私钥解密 ✅')

  if (process.env.HANDSHAKE_ONLY === '1') {
    console.log('handshake_only=ok')
    return
  }

  const sessionId = rndHex(16)
  const ts = String(Date.now())
  const nonce = rndHex(16)
  console.error('③ PoW solve（8-bit）…')
  const challenge = crypto.createHash('sha256').update(`${cred.apiKeyId}\n${APP_ID}\n${sessionId}\n${ts}`).digest('hex').slice(0, 32)
  let pow
  {
    const salt = rndHex(12)
    for (let i = 0; i <= 0xffffffff; i++) {
      const cand = `${salt}${i.toString(16).padStart(8, '0')}`
      if (crypto.createHash('sha256').update(`${challenge}\n${cand}`).digest()[0] === 0) { pow = cand; break }
    }
    if (pow === undefined) throw new Error('PoW 无解')
  }
  const sig = b64(crypto.sign(null, Buffer.from(`${cred.apiKeyId}\n${ts}\n${CLIENT_VERSION}\n${sessionId}\n${nonce}`, 'utf8'), priv))
  console.error('   签名 ✅')

  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'X-App-Id': APP_ID,
      'X-Client-Nonce': nonce,
      'X-Client-Pow': pow,
      'X-Client-Sig': sig,
      'X-Client-Ts': ts,
      'X-Client-Version': CLIENT_VERSION,
      'X-Session-Id': sessionId,
      'X-Zcode-Agent': 'glm',
      'X-Zcode-App-Version': CLIENT_VERSION,
      'X-Zcode-Query-Source': 'main_turn',
      'X-Zcode-Session-Type': 'main',
    },
    body,
  })
  const r = await resp.json().catch(() => { return {} })
  const u = r.usage || {}
  const ct = u.prompt_tokens_details?.cached_tokens ?? 0
  const theory = ((u.prompt_tokens - ct) * 2.3 + ct * 1.7 + (u.completion_tokens || 0) * 24) / 10000
  console.log(`http=${resp.status} prompt=${u.prompt_tokens ?? '?'} cached=${ct} out=${u.completion_tokens ?? '?'} theory=${theory.toFixed(2)} err=${r.error?.code ?? r.error?.message ?? ''}`)
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
