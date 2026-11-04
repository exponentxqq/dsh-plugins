/**
 * spike 1.1 探针插件：观察（并可选择改写）`system-prompt/assemble` 瀑布。
 *
 * 设计：
 * - 未打标签的 `ctx.on('system-prompt/assemble', …)`：验证每个 agent scope 的装配都会投递到它；
 * - 先用 `next()` 取得下游装配，再按当前模式（观察 / 改写）返回；
 * - 改写开关是标记文件 `/tmp/spike-name/rewrite.on` 的存在性，避免为「第二轮」
 *   重启实例：同一实例内建会话、改标记、再发一轮即可证明「下一步生效」；
 * - 每条装配输出一行 `SPIKE-ASSEMBLE {json}` 到 stdout（dsh 日志可 grep）；
 * - 绝不抛错：出错时原样返回 `next()` 的结果，避免干扰被测装配。
 *
 * 改写内容（仅标记文件存在时）：
 * 1) 删除名为 `mcp:probe-b` 的整段；
 * 2) 把 `mcp-resource-servers` 段句末名字数组中的 `"probe-b"` 去掉；
 * 3) 追加一段哨兵 `spike:sentinel`（用于 complete 段丢弃 mutations 的实测对照）。
 */
import { existsSync } from 'node:fs'

export const name = 'spike-name-probe'

const REWRITE_FLAG = '/tmp/spike-name/rewrite.on'
const SENTINEL_NAME = 'spike:sentinel'
const SENTINEL_TEXT = 'SPIKE-SENTINEL-5-REWRITE-EFFECTIVE'

/** 从 `agent` 上尽量稳定地取会话身份与 cwd（只用于证据，不参与行为）。 */
function agentInfo(context) {
  const agent = context?.agent
  let cwd
  try {
    cwd = agent?.session?.header?.cwd ?? agent?.session?.meta?.cwd ?? agent?.ctx?.cwd
  } catch {
    cwd = undefined
  }
  return {
    agentPresent: agent !== undefined && agent !== null,
    agentId: typeof agent?.id === 'string' ? agent.id : null,
    cwd: typeof cwd === 'string' ? cwd : null,
    scopePresent: context?.scope !== undefined && context?.scope !== null,
    scopeIsAgent: context?.scope === agent,
    contextKeys: context === undefined || context === null ? [] : Object.keys(context),
  }
}

/** 段证据：名字、interpolate 形态、文本长度与头部；名字段/指令段保留全文。 */
function summarizeSections(sections) {
  return sections.map((section) => {
    const text = String(section.text ?? '')
    const interesting =
      section.name === 'mcp-resource-servers' || String(section.name).startsWith('mcp:')
    return {
      name: section.name,
      // 关键观测③：段对象是否带 interpolate 字段、值是否为 false
      hasInterpolateKey: Object.prototype.hasOwnProperty.call(section, 'interpolate'),
      interpolate: section.interpolate,
      textLength: text.length,
      textHead: text.slice(0, 160),
      ...(interesting ? { text } : {}),
    }
  })
}

/**
 * 改写资源名字段文本：仅识别 `… server argument: ["a","b"].` 这一契约形态。
 * @returns {{ text: string, outcome: string, kept?: string[], removed?: string[] }}
 */
function rewriteResourceNames(text) {
  const marker = 'server argument: '
  const at = text.indexOf(marker)
  if (at < 0) return { text, outcome: 'no-marker' }
  const prefix = text.slice(0, at + marker.length)
  const tail = text.slice(at + marker.length)
  if (!tail.startsWith('[') || !tail.endsWith('.')) return { text, outcome: 'unparsable' }
  let names
  try {
    names = JSON.parse(tail.slice(0, -1))
  } catch {
    return { text, outcome: 'unparsable' }
  }
  if (!Array.isArray(names)) return { text, outcome: 'unparsable' }
  const kept = names.filter((entry) => entry !== 'probe-b')
  if (kept.length === names.length) return { text, outcome: 'unchanged', kept, removed: [] }
  return {
    text: prefix + JSON.stringify(kept) + '.',
    outcome: 'rewritten',
    kept,
    removed: names.filter((entry) => entry === 'probe-b'),
  }
}

/** 按标记文件决定是否改写；返回新的装配对象与本次改写的读数。 */
function rewriteAssembly(assembly) {
  const before = assembly.sections
  const removedSections = []
  const keptSections = []
  let nameRewrite
  for (const section of before) {
    if (section.name === 'mcp:probe-b') {
      removedSections.push(section.name)
      continue
    }
    if (section.name === 'mcp-resource-servers') {
      nameRewrite = rewriteResourceNames(String(section.text ?? ''))
      keptSections.push({ ...section, text: nameRewrite.text })
      continue
    }
    keptSections.push(section)
  }
  keptSections.push({
    name: SENTINEL_NAME,
    text: SENTINEL_TEXT,
    interpolate: false,
  })
  return {
    assembly: { ...assembly, sections: keptSections },
    removedSections,
    nameRewrite,
    sentinelAdded: true,
  }
}

export function apply(ctx) {
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const info = agentInfo(context)
    const before = summarizeSections(assembly.sections)
    // 必须先 next()：本 spike 要证明「下游完成后再改写，下一步仍生效」
    const result = await next()
    const mode = existsSync(REWRITE_FLAG) ? 'rewrite' : 'observe'
    try {
      if (mode === 'observe') {
        console.log(
          'SPIKE-ASSEMBLE ' +
            JSON.stringify({
              mode,
              ...info,
              before,
              after: summarizeSections(result.sections),
              resultChanged: result !== assembly,
              rewrote: false,
            }),
        )
        return result
      }
      const rewritten = rewriteAssembly(result)
      console.log(
        'SPIKE-ASSEMBLE ' +
          JSON.stringify({
            mode,
            ...info,
            before,
            after: summarizeSections(rewritten.assembly.sections),
            removedSections: rewritten.removedSections,
            nameRewrite: rewritten.nameRewrite ?? null,
            sentinelAdded: rewritten.sentinelAdded,
            rewrote: true,
          }),
      )
      return rewritten.assembly
    } catch (error) {
      console.log(
        'SPIKE-ASSEMBLE ' +
          JSON.stringify({
            mode,
            ...info,
            before,
            error: String(error),
            rewrote: false,
          }),
      )
      return result
    }
  })
}
