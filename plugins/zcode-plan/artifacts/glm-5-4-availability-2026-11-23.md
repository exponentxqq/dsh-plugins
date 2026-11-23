> 证据类型：模型可用性直连探测｜采集时点：2026-11-23 14:39–14:47（Asia/Shanghai），dsh 容器内 `curl` 直连 coding 端点｜结论：**glm-5.4 可用**（两条凭证通、视觉与 thinking 档位通、max_tokens 上限 131072），**glm-5.3 当前不可用**（三次 `1305 该模型当前访问量过大` + 一次 60s 无响应），**glm-5.3-flash 仍可用**。据此把 `glm-5.4` 加入单一真源 `ZCODE_PLAN_ROUTE.models` 并置首，glm-5.3 / glm-5.3-flash 保留作回退。

# GLM-5.4 上线 Coding Plan 的可用性探测（2026-11-23）

探测方式与折扣复测同源：不经插件、不经 dsh 路由，直接对
`https://open.bigmodel.cn/api/coding/paas/v4` 发请求，把「模型是否在册」「能否出 token」
「视觉/thinking/max_tokens 边界」逐项钉住。凭证按纪律脱敏：`ZCODE_PLAN_PAT`（zcode 桥接
PAT）与 `ZAI_CODING_CN_API_KEY`（GLM Coding Plan Key）均只标注类型，不回显值。

## 一、模型在册（`GET /models`，zcode PAT）

```text
glm-4.5  glm-4.5-air  glm-4.6  glm-4.7  glm-5  glm-5-turbo  glm-5.1  glm-5.2
glm-5.3  glm-5.3-flash  glm-5.3-flashx  glm-5.3-flashx-legal  glm-5.4
```

- `glm-5.4` 首次出现（`created: 1795406400`）；**无 `glm-5.4-flash`**。
- `glm-5.3` / `glm-5.3-flash` 仍在册——5.3 的失败是计量/过载而非下线（见 §二）。

## 二、推理可用性（`POST /chat/completions`，`max_tokens` 小值，prompt「只回复一个字：好」）

| 模型 | zcode PAT | `ZAI_CODING_CN_API_KEY` |
|---|---|---|
| `glm-5.4` | ✅ 正常返回（`finish_reason: stop`，带 reasoning_tokens） | ✅ 正常返回 |
| `glm-5.3` | ❌ 一次 60s 超时无字节；两次 `{"error":{"code":"1305","message":"该模型当前访问量过大，请您稍后再试"}}` | ❌ `1305` |
| `glm-5.3-flash` | ✅ 正常返回 | 未测（按 5.3-flash 仍在册推断同日可用） |

结论：`glm-5.4` 是当前可用的新旗舰；`glm-5.3` 保留条目做回退，恢复后可再用。

## 三、视觉输入（`content` 数组 + 8×8 PNG 的 `data:image/png;base64,...`）

- `glm-5.4`（两条凭证）：**接受**图片内容，`prompt_tokens` 相对纯文本上升，无
  modality 拒绝；回答内容不求精确（8×8 色块本身信息量极低），关键读数是「受理」。
- 对照 `glm-5.3-flash`：同样受理。
- 与官方口径一致（GLM-5.4 新增视觉能力）。故单一真源里 `input: ['text','image']`。

## 四、thinking 档位（`thinking.type=enabled` + `reasoning_effort`）

| `reasoning_effort` | 结果 |
|---|---|
| `minimal` / `low` / `medium` / `high` / `max` / `xhigh` | 均受理，无 400；`high` / `max` 明确产出 `reasoning_content` |

插件侧 `reasoningEfforts` 继续沿用 glm-5.3 的映射（`off:null, low:low, medium:high,
high:high, max:max`）：实际下发的 wire 值只有 `low` / `high` / `max`，三者均已实测受理。

## 五、输出上限（`max_tokens` 边界）

| `max_tokens` | 结果 |
|---|---|
| 64000 / 64001 / 131072 | ✅ 正常返回 |
| 200000 | ❌ `{"error":{"code":"1210","message":"max_tokens参数非法：限制数值范围[1,131072]"}}` |

故单一真源 `maxTokens: 131072`（与 glm-5.3 / glm-5.3-flash 一致）。

## 六、上下文窗口的依据与残余不确定性

API 不暴露 context window；依据为 Coding Plan 模型列表对 `glm-5.4` 标注的「1M」与官方
发布口径，取 `contextWindow: 1_000_000`。**残余风险**：若真实窗口小于 1M，超长请求会由
上游报错；届时把单一真源与 profile patch 两处的 `contextWindow` 下调到实测值即可（两臂
比值/功能判定不受影响）。

## 七、对路由目录的落地

| 模型 | 位置 | `input` | 说明 |
|---|---|---|---|
| `glm-5.4` | `models[0]`（置首） | text + image | Coding Plan 新旗舰，1M / 131072，thinking 四档 |
| `glm-5.3` | `models[1]` | text | 2026-11-23 起 1305，留作回退 |
| `glm-5.3-flash` | `models[2]` | text + image | 套餐内最低成本，视觉备用 |

同时更新 `scripts/gen.mjs` / `scripts/replicate-sign-pat.mjs` 的默认模型为 `glm-5.4`
（原默认 `glm-5.3` 已被 1305 挡死，折扣对拍无法复现旧刻度）。折扣复测的新刻度待下一次
`pnpm discount:verify` 采集；比值判定（签名臂/无签名臂）不受模型换代影响。

## 八、dsh 侧真机 E2E（配置落地后）

profile 侧改完（`zcode-plan` 目录三条、`zai-coding-cn` 目录五条、白名单补 glm-5.4）后，用
任务板各开一个**全新会话**验证路由（新会话才读得到更新后的 `allowedModels`）：

| 卡片路由 | 会话 | 结果 |
|---|---|---|
| `zcode-plan/glm-5.4` | `session-1de3e3d3…` | `result: succeeded`，摘要「好」 |
| `zai-coding-cn/glm-5.4` | `session-da2850c3…` | `result: succeeded`，摘要「好」 |

即：两条路由都能真实推理 `glm-5.4`（`zcode-plan` 侧同时覆盖插件签名通道的请求路径）。
注意 `--dump-config` 与白名单在**新会话**生效；长驻会话的 subagent 选模型快照是会话创建时
取的，旧会话要继续用 glm-5.4 需重启 profile 或新开会话。
