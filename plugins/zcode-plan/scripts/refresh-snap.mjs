// 快照刷新：从 dsh 凭据存储提取对拍所需的登录 JWT / org / project / 现行 PAT，
// 以 0600 权限写入 WORK_DIR 点文件（.jwt/.org/.proj/.pat）——机密只落仓外缓存目录，
// 永不回显到 stdout、永不进入仓库；诊断行只含非机密字段（效期时刻、keyId 前 8 位、
// 指纹哈希）。
// 用法：node refresh-snap.mjs
//   CREDENTIALS_FILE  凭据存储路径，默认 $HOME/.dsh/.credentials.yaml
//   DSH_ROOT          dsh 安装根（解析 js-yaml 用），默认 /usr/local/lib/node_modules/@deepseek-ai/dsh
//   WORK_DIR          快照目录，默认 ${XDG_CACHE_HOME:-~/.cache}/zcode-rate-test
// 前置：已 /zcode-plan login（存储里有 zcode-plan/bigmodel-login 记录）。
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

function loadYaml() {
  const roots = [
    process.env.DSH_ROOT,
    '/usr/local/lib/node_modules/@deepseek-ai/dsh',
  ].filter(Boolean)
  for (const root of roots) {
    try {
      const req = createRequire(join(root, 'package.json'))
      const y = req('js-yaml')
      return y.default ?? y
    } catch { /* 尝试下一个解析根 */ }
  }
  const req = createRequire(import.meta.url)
  const y = req('js-yaml') // 兜底：脚本自身位置向上解析（pnpm workspace 可达时）
  return y.default ?? y
}

const store = loadYaml().load(
  fs.readFileSync(process.env.CREDENTIALS_FILE ?? join(homedir(), '.dsh/.credentials.yaml'), 'utf8'),
)
const login = store.records['zcode-plan/bigmodel-login']?.payload
if (!login?.jwt) {
  console.error('存储里没有 zcode-plan/bigmodel-login 登录记录——先执行 /zcode-plan login')
  process.exit(1)
}
const pat = store.refs?.ZCODE_PLAN_PAT
if (typeof pat !== 'string' || pat.length < 20) {
  console.error(`ZCODE_PLAN_PAT 引用形态异常（typeof=${typeof pat}）——先 /zcode-plan login 或 refresh`)
  process.exit(2)
}

const workDir = process.env.WORK_DIR
  ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'zcode-rate-test')
fs.mkdirSync(workDir, { recursive: true })
for (const [name, value] of [['.jwt', login.jwt], ['.org', login.organization], ['.proj', login.project], ['.pat', pat]]) {
  const file = join(workDir, name)
  fs.writeFileSync(file, value)
  fs.chmodSync(file, 0o600)
}

// 诊断（全非机密）：PAT 为 JWT 形态，读 payload.exp 佐证效期
const payload = JSON.parse(Buffer.from(pat.split('.')[1], 'base64url').toString('utf8'))
const signing = store.records['zcode-plan/bigmodel-signing-key']?.payload
console.log(`快照已刷新 → ${workDir}/{.jwt,.org,.proj,.pat}（0600）`)
console.log(`诊断: PAT.exp=${payload.exp ? new Date(payload.exp * 1000).toISOString() : '无'}  api_key前8=${String(payload.api_key ?? '').slice(0, 8)}  now=${new Date().toISOString()}`)
console.log(`诊断: 登录时间=${login.loginAt ? new Date(login.loginAt).toISOString() : '?'}  签名密钥=${signing ? `已缓存（指纹 ${signing.fingerprint}）` : '未缓存'}`)
