# 从 zai-coding-zcode 迁移到 zcode-plan 路由

> 适用 DSH 基线 `0.2.1-rc.2`。本文是**用户迁移指南**：把 profile 里既有的
> `llm-pi-ai.providers['zai-coding-zcode']` 路由块换成本插件的 `zcode-plan`
> 路由（PAT 凭证）。所有 `<尖括号>` 均为占位符，替换成你自己的值；本文不含任何真实凭据。

## 防误读

**`openspec/changes/zcode-plan-bridge/diff-matrix.md` 是阶段 1.5 的冻结留痕**，其中 §八（结论）里「bundle patch 注册 zcode-plan 路由」的构想已被设计线双实验实测推翻（DSH 的 patch 对同 id 条目的 config 是**整份替换**、非深合并，bundle 层改动会被 profile 层静默吃掉）；**路由注册以 `design.md` D-1（profile 层 `/zcode-plan route install` 写 `llm-pi-ai.providers['zcode-plan']`）为准**。阅读该留痕文档时，凡与本文或 `design.md` 冲突之处一律以 `design.md` 为准。

## 背景：为什么迁移

- 旧 `zai-coding-zcode` 路由块靠指纹/UA/端点特征试图命中折扣，但**实测证明折扣绑定在凭证属性上**（前序 42k 请求对照实测：同特征不同凭证，扣费差异依旧）。该块拿不到折扣。
- 新方案 = 本插件的 `zcode-plan` 路由：登录宿主 zcode 凭证后由插件换发并续期 PAT（注入 `ZCODE_PLAN_PAT`），扣费走 PAT 侧折扣（同批实测：PAT 请求扣费 3–6，基线 14–15）。
- 路由由 `/zcode-plan route install` 写入 **profile 层**（`design.md` D-1），插件不改 `agent-default-model`（`design.md` D-14）——切默认路由永远是用户自己的决策。

## 适用对象与前提

- profile 的 `llm-pi-ai.providers` 下已有 `zai-coding-zcode` 路由块（手工或旧方式留下的），想改用 zcode-plan（PAT 折扣）的用户。
- 本插件是 **host-only**，任意 profile 可用；但 **headless profile 不适用**（宿主禁用凭据存储，登录凭证无处落盘）。
- **容器部署**：授权回调地址对容器不可达，完成浏览器授权后需把地址栏整条 URL 粘贴回来（见「login：登录并持有 PAT」节）。
- 插件行 config 必填 `organization` / `project`（bigmodel 侧的用量查询维度，缺失即配置校验失败）。

## 迁移前核对：先核对 agent-default-model 指向再决定

**首步必须先核对当前 `agent-default-model` 指向，再决定要不要切**——本机实测已指向 `zai-coding-cn`，盲切可能覆盖你已改过的配置（Q6 决策：先核对再决定，不盲目切换）。

```bash
# 查看合成后配置里的 agent-default-model 段（示例命令，按需执行）
docker exec dsh dsh --profile web --dump-config | sed -n '/agent-default-model/,+6p'
```

也可以直接看 profile patch 文件 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里的 `agent-default-model` 段。确认当前指向后先做决定：

- 当前指向 `zai-coding-cn`（回退路由）：可以保持不动——`zcode-plan` 路由注册后按需切换（见「切换验证」节），迁移全程不影响现有默认路由。
- 当前已指向 `zcode-plan` 或其它值：记录下来，作为回退时的还原目标。
- **不核对就切换**是最常见的误操作来源：插件永远不会替你改这一项。

## 备份

profile patch 是仓外配置，改坏没有版本管理兜底。先把两份文件复制到安全位置：

```bash
cp ~/.dsh/profiles/<profile>/cordis.patch.yml ~/backup/cordis.patch.yml.bak-<日期>
cp ~/.dsh/profiles/<profile>/package.json   ~/backup/package.json.bak-<日期>   # 如存在
```

同时记下旧 `zai-coding-zcode` 块的完整原文（删除前要用它核对，回退时靠这份备份重建）。

## 安装插件

```bash
TAG=$(git describe --tags --abbrev=0)
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/zcode-plan"
```

校验配置可加载、查看合成后的配置树：

```bash
docker exec dsh dsh --profile web --dump-config          # 装载冒烟探针（exit 0 即可加载）
docker exec dsh dsh --profile web --dump-config-schema   # 查看 schema（0.2.2-rc.1 全局 exit 1 为既有 preset 豁免，按条目核对）
```

在 profile patch 的插件行上补必填 config（占位符替换成你自己的值，**不要抄别人的组织/项目**）：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml 里本插件的注册行
- id: dsh-plugin-zcode-plan
  config:
    organization: <你的组织>
    project: <你的项目>
```

## route install：注册 zcode-plan 路由

在 dsh 会话里执行：

```text
/zcode-plan route install
```

成功回执应为「已写入 llm-pi-ai.providers.zcode-plan（profile 层）…」。核对两点：

```bash
docker exec dsh dsh --profile web --dump-config | sed -n '/providers:/,+40p'
```

- `providers['zcode-plan']` 已存在（含 `glm-5.3` 与 `glm-5.3-flash` 两条 models、`apiKeyEnv: ZCODE_PLAN_PAT`）；
- `providers['zai-coding-cn']` 等你既有的其它键**原样还在**——install 幂等且只覆盖本键，不碰他人路由。

会话内 `/zcode-plan route status` 显示「路由：已注册（glm-5.3, glm-5.3-flash）」即注册完成；若显示「已声明未注册」，等宿主重载配置后再查。

## login：登录并持有 PAT

```text
/zcode-plan login
```

命令回执给出 BigModel 授权链接；在浏览器完成授权后：

- **宿主机可直达回调**：流程自动完成，无需手工动作。
- **容器部署（回调不可达）**：把浏览器地址栏的**整条回调 URL** 粘贴回来：

  ```text
  /zcode-plan login <浏览器地址栏里的整条回调URL>
  ```

登录成功后插件自动换发并后台续期 PAT（注入 `ZCODE_PLAN_PAT`）。核对整体状态：

```text
/zcode-plan status
```

应看到：已登录、PAT 有效、路由已注册（glm-5.3, glm-5.3-flash）。PAT 到期前插件会自动续期；也可随时 `/zcode-plan refresh` 手动换发（回执只报「与上一张不同」与到期时刻，不回显值）。

## 切换验证（由你决定是否执行）

插件不改 `agent-default-model`（`design.md` D-14）。若「迁移前核对」后**决定切**默认模型：

1. 手工把 profile patch（或你的默认模型配置处）的 `agent-default-model` 指向 `zcode-plan`；
2. 发一次小请求验证连通与响应正常；
3. 用前序 42k 实测的核对方法确认扣费走 PAT 折扣（单请求扣费应在 3–6 区间，而非基线 14–15）。

若决定暂不切换，迁移到此即已完成：路由已注册、登录已生效，默认路由保持 `zai-coding-cn` 不变，需要时再切。

## 删除旧 zai-coding-zcode 块（用户手工）

旧块的删除是**用户手工动作**（它在仓外 profile 配置里，插件不会替你删）。删除前**先备份 profile patch**（见「备份」节，删前再确认一次），然后手工移除 `~/.dsh/profiles/<profile>/cordis.patch.yml` 中 `llm-pi-ai` 条目 `providers` 下的整个 `zai-coding-zcode` 块（含 `headers` 等子段），保存后让宿主重载配置，`--dump-config` 确认该键已消失。

> 重建样例（仅当日后确需回退时使用；具体字段以你备份的原文为准，本文不含真实值）：
>
> ```yaml
> # ~/.dsh/profiles/<profile>/cordis.patch.yml
> - id: llm-pi-ai
>   config:
>     providers:
>       zai-coding-zcode:
>         apiKeyEnv: <你的环境变量名>
>         api: openai-completions
>         baseURL: https://open.bigmodel.cn/api/coding/paas/v4
>         # models 段请从「备份」节的备份 / git 历史恢复，此处省略
> ```

## 回退

整条链路可逆，按序执行：

1. **切回默认模型**（若切换过）：把 `agent-default-model` 手工改回「迁移前核对」时记录的原指向（本机为 `zai-coding-cn`）；
2. **摘除路由**：会话内 `/zcode-plan route remove`——只删 `providers['zcode-plan']` 本键，回执会明示「回退路由 zai-coding-cn 不受影响」；
3. **退出登录**：`/zcode-plan logout`——清除本机 `ZCODE_PLAN_PAT` 引用；服务端 Key 保留（回执会说明），不影响日后重新 login；
4. **恢复旧块**（如有需要）：按「备份」节的备份把 `zai-coding-zcode` 块抄回 profile patch 的 `providers` 下。

回退后 `--dump-config` 核对：`providers` 里 `zcode-plan` 键消失、其余键（含 `zai-coding-cn`）完好。

## 已知坑

| 现象 | 原因与处理 |
| --- | --- |
| `agent-default-model` 指向被意外改写 | 插件不会写这项（`design.md` D-14）；若发现变化，是手工编辑所致，按「迁移前核对」的记录还原 |
| bundle 层改 `llm-pi-ai` 配置被「静默吃掉」 | DSH patch 对同 id 条目的 config 是**整份替换**、非深合并——所以路由注册必须在 profile 层做（`design.md` D-1），见文首防误读注记 |
| `/zcode-plan status` 备注出现 `REF_CONFLICT` | `ZCODE_PLAN_PAT` 正被外部来源（如 shell 环境变量）供值，与插件引用冲突；去掉外部供值源后重试 |
| 登录后回调无响应（容器部署） | 回调地址容器不可达属预期，改走粘贴：浏览器整条 URL → `/zcode-plan login <url>` |
| `route install` 报「当前 profile 没有 llm-pi-ai 行」 | 该 profile 没有加载 `llm-pi-ai`（providers 段没有宿主条目），先确认 profile 的 pi-ai 配置存在再装 |
| PAT 换发失败 / 401 重试 | 看 `/zcode-plan status` 备注段的码；登录态过期时重新 `/zcode-plan login` 即可 |
| headless profile 无法登录 | 该 profile 禁用凭据存储，登录凭证无处落盘，本插件不适用；换非 headless profile |

## 命令速查

```text
/zcode-plan login [回调URL]   发起 BigModel 授权；带参 = 提交粘贴的回调 URL
/zcode-plan logout            退出登录并清除 ZCODE_PLAN_PAT（服务端 Key 保留）
/zcode-plan status            登录 / Key / PAT / 路由 / 用量状态（缺省子命令）
/zcode-plan route [install|remove|status]   注册 / 摘除 / 查看路由（缺参 = status）
/zcode-plan refresh           立即换发一张 PAT
```
