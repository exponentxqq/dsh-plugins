// quota/limit 双池读数归一器：stdin 传入 GET /api/monitor/usage/quota/limit 的
// JSON 响应，stdout 打印 `u3=<5h窗口已用> u6=<周额度已用>`。
// unit===3 = 5 小时滚动窗口积分池；unit===6 = 周额度池（GLM Coding Plan 硬约束，
// 两池同扣互证——读数应始终 u3Δ == u6Δ，不等即窗口混入外部消费，判读作废）。
// 来源：/home/docker/.cache/zcode-rate-test/read-pools.mjs（2026-11 折扣定位实验原始现场）。
let s = ''
process.stdin.on('data', (d) => { s += d })
process.stdin.on('end', () => {
  const r = JSON.parse(s)
  const L = r.data?.limits ?? []
  const f = (u) => {
    const l = L.find((x) => x.unit === u)
    return l ? (l.currentValue ?? l.usage) : '?'
  }
  console.log(`u3=${f(3)} u6=${f(6)}`)
})
