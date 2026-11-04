#!/usr/bin/env bash
# 折扣对拍（1.5x 验证）——A/B 交错双对 + 平台期轮询 + 空转本底窗。
#
# 判据原理：官方「ZCode 1.5 倍用量」= 同量调用按 0.67 系数折算计量。两臂同用
# 一张 PAT、各发一份互异全新体（规避前缀缓存假阳性），唯一变量 = 是否带插件线
# 签名头组；比值 A/B（签名/无签名刻度）落 0.50–0.75（0.67 邻域）=> 折扣通道生效。
# 比值判定天然免疫绝对刻度漂移（时段计量系数、tokenizer 压缩率变化等）。
#
# 方法论（每个设计都对应一类历史踩坑，详见 docs/discount-verify.md）：
#   - 平台期轮询：连读 3 次一致才算落定（聚合延迟 1–2 分钟，Δ>=5 早断会截在读数
#     半途）；   - 空转本底窗：150s 无探针窗口测漂移，非零说明有外部消费混入；
#   - 交错双对 A B A B：sporadic 背景突发均摊两臂，比值稳；
#   - 双池互证：u3Δ 应逐窗等于 u6Δ，不等即窗口被污染，判读作废；
#   - 输出压零：max_tokens=16 + thinking disabled，扣费几乎全由输入构成。
#
# 成本与时长：4 个探针 × 52000 字符（理论积分 ~8.4/发），2026-11-04 峰时实测
# ~84 分（两池同扣）；全程约 16 分钟。
# 纪律：运行期间主会话零并发推理（dsh 主会话与实验共享 quota 池）；
#       5h 窗口尾部余量不足时读数不可信（重置后再跑）。
#
# 用法：node scripts/refresh-snap.mjs && bash scripts/verify-discount.sh
#   WORK_DIR  快照/请求体目录（与 refresh-snap.mjs 一致），默认 ${XDG_CACHE_HOME:-~/.cache}/zcode-rate-test
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WORK_DIR=${WORK_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/zcode-rate-test}
mkdir -p "$WORK_DIR"; cd "$WORK_DIR"
for f in .jwt .org .proj .pat; do
  [ -s "$f" ] || { echo "缺快照 $WORK_DIR/$f——先运行 node $SCRIPT_DIR/refresh-snap.mjs"; exit 1; }
done
JWT=$(cat .jwt); ORG=$(cat .org); PROJ=$(cat .proj); PAT=$(cat .pat)

qs(){ curl -sS -m 20 'https://www.bigmodel.cn/api/monitor/usage/quota/limit' \
  -H "authorization: $JWT" -H "bigmodel-organization: $ORG" -H "bigmodel-project: $PROJ" \
  | node "$SCRIPT_DIR/read-pools.mjs"; }

# 平台期：连续 3 次读数一致才算落定（15s 间隔，最多 24 轮 ≈ 6 分钟）
plateau(){ local a b eq=0 i; a=$(qs); echo "    读 $a" >&2
  for i in $(seq 1 24); do sleep 15; b=$(qs); echo "    读 $b" >&2
    if [ "$b" = "$a" ]; then eq=$((eq+1)); [ $eq -ge 2 ] && { echo "$b"; return 0; }
    else eq=0; fi; a="$b"; done; echo "$b"; }

g3(){ local s=${1##*u3=}; printf '%s' "${s%% *}"; }
g6(){ printf '%s' "${1##*u6=}"; }

probeA(){ node "$SCRIPT_DIR/gen.mjs" 52000 o1 >/dev/null
  PAT="$PAT" BODY_FILE="$WORK_DIR/bodies/o1.json" node "$SCRIPT_DIR/replicate-sign-pat.mjs" 2>/dev/null; }
probeB(){ node "$SCRIPT_DIR/gen.mjs" 52000 o1 >/dev/null
  curl -sS -m 180 -o "$WORK_DIR/rc-b.json" -X POST 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions' \
    -H "Authorization: Bearer $PAT" -H 'content-type: application/json' -d @"$WORK_DIR/bodies/o1.json"
  node -e 'const j=require(process.argv[1]);const u=j.usage;if(!u){console.error("无usage");process.exit(1)}
    const ct=u.prompt_tokens_details?.cached_tokens??0
    console.log("http=200 prompt="+u.prompt_tokens+" cached="+ct+" out="+u.completion_tokens+
      " theory="+(((u.prompt_tokens-ct)*2.3+ct*1.7+u.completion_tokens*24)/10000).toFixed(2))' "$WORK_DIR/rc-b.json"; }

sleep 90   # 沉降：脚本启动前主会话末 turn 的记账落定（聚合延迟 1–2 分钟）
echo "== P0 基线平台 ==" >&2
P0=$(plateau) || exit 1; echo "P0: $P0" >&2
p0_3=$(g3 "$P0"); p0_6=$(g6 "$P0")

echo "== 空转本底窗（150s，无任何探针）==" >&2
sleep 150
P1=$(plateau) || exit 1; echo "P1: $P1" >&2
p1_3=$(g3 "$P1"); p1_6=$(g6 "$P1")
D0_3=$((p1_3-p0_3)); D0_6=$((p1_6-p0_6))
echo "本底漂移: u3Δ=$D0_3 u6Δ=$D0_6" >&2
[ "$D0_3" -eq 0 ] || echo "⚠ 本底漂移非零：有外部消费源在池上，读数将扣本底，比值仍可信但建议复核环境" >&2

declare -a RAWS_A RAWS_B
prev3=$p1_3; prev6=$p1_6; pair=0
for arm in A B A B; do
  pair=$((pair+1))
  echo "== 探针 $pair（臂 $arm）==" >&2
  if [ "$arm" = A ]; then OUT=$(probeA) || { echo "臂 A 失败"; exit 1; }
  else OUT=$(probeB) || { echo "臂 B 失败"; echo "$OUT"; exit 1; }; fi
  echo "$OUT" >&2
  echo "$OUT" | grep -q 'http=200' || { echo "臂 $arm http!=200"; exit 1; }
  P=$(plateau) || exit 1; echo "P$pair: $P" >&2
  c3=$(g3 "$P"); c6=$(g6 "$P")
  if [ "$arm" = A ]; then RAWS_A+=("$((c3-prev3))/$((c6-prev6))"); THS_A=$(echo "$OUT" | sed -E 's/.*theory=([0-9.]+).*/\1/')
  else RAWS_B+=("$((c3-prev3))/$((c6-prev6))"); THS_B=$(echo "$OUT" | sed -E 's/.*theory=([0-9.]+).*/\1/'); fi
  prev3=$c3; prev6=$c6
done

node -e '
const A = process.argv[1].split(",").map(s=>s.split("/").map(Number));
const B = process.argv[2].split(",").map(s=>s.split("/").map(Number));
const [tA,tB,d3,d6] = process.argv.slice(3).map(Number);
const sum = xs => xs.reduce((a,b)=>a+b,0);
const n = A.length;
const a3 = sum(A.map(x=>x[0])), a6 = sum(A.map(x=>x[1]));
const b3 = sum(B.map(x=>x[0])), b6 = sum(B.map(x=>x[1]));
const sA3=(a3-n*d3)/(n*tA), sB3=(b3-n*d3)/(n*tB), sA6=(a6-n*d6)/(n*tA), sB6=(b6-n*d6)/(n*tB);
console.log("臂A(签名)  各窗原始: " + A.map(x=>"u3+"+x[0]+"/u6+"+x[1]).join("  "));
console.log("臂B(无签名) 各窗原始: " + B.map(x=>"u3+"+x[0]+"/u6+"+x[1]).join("  "));
console.log("双池互证: " + (JSON.stringify(A.map(x=>x[0]))===JSON.stringify(A.map(x=>x[1])) && JSON.stringify(B.map(x=>x[0]))===JSON.stringify(B.map(x=>x[1])) ? "逐窗 u3Δ==u6Δ ✓" : "⚠ 有窗口 u3Δ!=u6Δ，读数被污染，判读作废"));
console.log("扣本底后合计: A 实扣u3="+(a3-n*d3)+" u6="+(a6-n*d6)+"（理论×"+n+"="+ (n*tA).toFixed(2) + "）  B 实扣u3="+(b3-n*d3)+" u6="+(b6-n*d6)+"（理论×"+n+"="+(n*tB).toFixed(2)+"）");
console.log("单发刻度(实扣÷理论): A=" + sA3.toFixed(3) + "/" + sA6.toFixed(3) + "  B=" + sB3.toFixed(3) + "/" + sB6.toFixed(3));
const r3=sA3/sB3, r6=sA6/sB6;
console.log("比值 A/B: u3=" + r3.toFixed(3) + "  u6=" + r6.toFixed(3) + "  等效额度=" + (1/r3).toFixed(2) + "x（官方系数 0.67 => 1.49x）");
console.log((r3>=0.50 && r3<=0.75) ? "判定: 折扣通道生效（比值落 0.50–0.75，0.67 邻域）" : "判定: 比值出带——先查 /zcode-plan status 签名行是否止损/冷却，再核对官方协议常量是否升级（signing.ts）");
' "$(IFS=,; echo "${RAWS_A[*]}")" "$(IFS=,; echo "${RAWS_B[*]}")" "$THS_A" "$THS_B" "$D0_3" "$D0_6"
