// 生成折扣对拍用的请求体：等长但内容互异（每次运行内容全新）——规避服务端
// 前缀缓存命中：缓存命中的输入按更低价格计费，会污染「签名 0.67 vs 无签名
// ~1.5 计量刻度」的判读（历史上「PAT 3–4 分 vs 基线 14–15 分」假阳性即此陷阱）。
// 用法：node gen.mjs [每臂字符数] [仅生成该臂，如 o1]
//      默认 26000 字符 ×5 臂；折扣对拍口径为 52000 字符、只取 o1：
//      node gen.mjs 52000 o1
// 输出目录：WORK_DIR/bodies（WORK_DIR 见 verify-discount.sh，仓外，绝不入仓库）。
// 来源：/home/docker/.cache/zcode-rate-test/gen.mjs（时间种子掺入，臂间无长共享前缀）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORK_DIR = process.env.WORK_DIR
  ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'zcode-rate-test')
const OUT = join(WORK_DIR, 'bodies')
mkdirSync(OUT, { recursive: true })

// 可复现 LCG，按臂播种——种子掺入时间，每次重跑内容也不同
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}
const WORDS = ['山岳', '河流', '星辰', '原野', '风暴', '灯塔', '航线', '齿轮', '琥珀', '回声',
  '峡谷', '潮汐', '旷野', '矿脉', '苔原', '港湾', '雾霭', '列车', '果园', '堤岸']
const UNITS = ['公里', '吨位', '度数', '批次', '节点', '千瓦', '公顷', '节', '桶', '箱']

function makeContent(seed, chars) {
  const rnd = lcg(seed)
  const parts = []
  let n = 0
  while (n < chars) {
    const w1 = WORDS[(rnd() * WORDS.length) | 0]
    const w2 = WORDS[(rnd() * WORDS.length) | 0]
    const u = UNITS[(rnd() * UNITS.length) | 0]
    const v = String((rnd() * 99999) | 0).padStart(5, '0')
    const line = `记录${parts.length + 1}：${w1}与${w2}的关联值是${v}${u}。`
    parts.push(line)
    n += line.length
  }
  return parts.join('')
}

const CHARS = Number(process.argv[2] ?? 26000)
const ONLY = process.argv[3] ?? ''
const RUN = Date.now() & 0xffff // 换个种子，每次实测的内容也不同
const MODEL = 'glm-5.3'
// o 臂 = OpenAI coding 端点（折扣对拍只用 o1）；a 臂 = Anthropic 端点形状（历史
// 五臂实验遗留，保留兼容）。o 臂关思考 + max_tokens=16：输出成本压到可忽略，
// 扣费几乎全由输入构成，刻度归一才干净。
const ARMS = [
  { name: 'o1', seed: 0x11 + RUN },
  { name: 'o2', seed: 0x22 + RUN },
  { name: 'o3', seed: 0x33 + RUN },
  { name: 'a1', seed: 0x44 + RUN },
  { name: 'a2', seed: 0x55 + RUN },
].filter(arm => arm.name.startsWith('o'))

for (const arm of ARMS) {
  if (ONLY && arm.name !== ONLY) continue
  const content = makeContent(arm.seed, CHARS)
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content }],
    max_tokens: 16,
    thinking: { type: 'disabled' },
    stream: false,
  }
  const file = join(OUT, `${arm.name}.json`)
  writeFileSync(file, JSON.stringify(body))
  console.log(`${arm.name}.json  内容字符=${content.length}  文件字节=${Buffer.byteLength(JSON.stringify(body))}`)
}
console.log(`已写入 ${OUT}${ONLY ? `（仅 ${ONLY}）` : ''}（每臂 ${CHARS} 字符）`)
