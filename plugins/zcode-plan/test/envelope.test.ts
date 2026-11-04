import { describe, expect, it } from 'vitest'
import { readEnvelopeDiagnostics, successCode, unwrap } from '../src/host/bigmodel/envelope.ts'

/**
 * 敏感夹具（X1-4 红线）：模拟「值出现在响应体里」的场景，断言诊断路径绝不外泄。
 * 长度刻意 ≥ 8（与 errors.ts 的机密判定阈值一致），避免误报歧义。
 */
const jwtFixture = 'jwt-fixture-abcd1234EFgh5678'
const patFixture = 'pat-fixture-9999xyZk0099LLmq'

/** 委托解析恒成功的桩 parse（聚焦壳行为；「parse 抛错归因 shape」的分支单独构造）。 */
function parseRaw(data: unknown): unknown {
  return data
}

describe('successCode 成功判定（X1-1）', () => {
  it('成功码四形 0 / 200 / \'0\' / \'200\' 均判成功', () => {
    expect(successCode(0)).toBe(true)
    expect(successCode(200)).toBe(true)
    expect(successCode('0')).toBe(true)
    expect(successCode('200')).toBe(true)
  })

  it('success === true 一例：code 非成功值时 success 兜底判成功', () => {
    expect(successCode(1, true)).toBe(true)
  })

  it('非成功码 1 / \'1\' / null 均判失败', () => {
    expect(successCode(1)).toBe(false)
    expect(successCode('1')).toBe(false)
    expect(successCode(null)).toBe(false)
    expect(successCode(null, false)).toBe(false)
  })
})

describe('unwrap：HTTP 200 + 业务失败（X1-2）', () => {
  it('code:1500 归因 business，诊断带 code 的字符串形态与 msg', () => {
    const result = unwrap({ code: 1500, msg: '应用密钥不能为空', data: { fine: true } }, parseRaw)
    expect(result).toEqual({ ok: false, reason: 'business', code: '1500', msg: '应用密钥不能为空' })
  })
})

describe('unwrap：非 JSON / 结构不符（X1-3）', () => {
  it('null、字符串体、成功码但缺 data 均归因 shape', () => {
    // 壳本身不是对象 → 诊断为空，结果恰为两键。
    expect(unwrap(null, parseRaw)).toEqual({ ok: false, reason: 'shape' })
    expect(unwrap('<html>502 Bad Gateway</html>', parseRaw)).toEqual({ ok: false, reason: 'shape' })
    // 成功码但 data 不在（实测 404 即 data: null）→ shape，诊断仍带 code 字符串形态。
    expect(unwrap({ code: 0 }, parseRaw)).toEqual({ ok: false, reason: 'shape', code: '0' })
    expect(unwrap({ code: 200, data: null }, parseRaw)).toEqual({ ok: false, reason: 'shape', code: '200' })
  })

  it('data 形状收紧抛错 → 归因 shape，且异常对象不透传（防值泄漏）', () => {
    const parse = (): unknown => {
      throw new Error('boom：不该透传')
    }
    const result = unwrap({ code: 0, data: { token: jwtFixture } }, parse)
    expect(result).toEqual({ ok: false, reason: 'shape', code: '0' })
    expect(JSON.stringify(result)).not.toContain(jwtFixture)
  })
})

describe('诊断不含值（X1-4）', () => {
  it('unwrap 失败结果只含码与 msg 诊断，data 里的敏感值不外泄', () => {
    const result = unwrap(
      { code: '1500', msg: '应用密钥不能为空', data: { token: jwtFixture, pat: patFixture } },
      parseRaw,
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('预期解壳失败')
    // msg 只来自 envelope 的 msg 字段（诊断路径）：键集恰为四键，无 data 及其内部值。
    expect(Object.keys(result)).toEqual(['ok', 'reason', 'code', 'msg'])
    expect(JSON.stringify(result)).not.toContain(jwtFixture)
    expect(JSON.stringify(result)).not.toContain(patFixture)
  })

  it('readEnvelopeDiagnostics 只返回 code / msg 两个键（数字码归一字符串，非对象输入得空诊断）', () => {
    const diagnostics = readEnvelopeDiagnostics({ code: 200, msg: 'fine', data: { token: patFixture } })
    expect(diagnostics).toEqual({ code: '200', msg: 'fine' })
    expect(Object.keys(diagnostics)).toEqual(['code', 'msg'])
    expect(JSON.stringify(diagnostics)).not.toContain(patFixture)
    expect(readEnvelopeDiagnostics(null)).toEqual({})
    expect(readEnvelopeDiagnostics('oops')).toEqual({})
  })
})
