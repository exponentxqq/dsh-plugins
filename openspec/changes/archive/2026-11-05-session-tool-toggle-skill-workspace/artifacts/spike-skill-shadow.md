# Spike：每 agent 技能遮蔽（code-design G1）取证记录

- 变更：`session-tool-toggle-skill-workspace`
- 任务：`tasks.md` 1.1（关键 spike，串行前置）
- 判定口径：`code-design.md` G1 的 5 条断言 + 1 条额外观察（不计入 5 条通过数）
- 触达面：**无源码改动**；仓库内只新增本文件。临时脚本、fixture、隔离 `DSH_HOME`、实验插件全部落 `/tmp/session-tool-toggle-spike/`（执行期证据纪律：`git status` 不出现证据文件）
- 运行时间：2026-11-04 22:03（Asia/Shanghai）
- dsh：`0.2.1-rc.5`（`/usr/local/lib/node_modules/@deepseek-ai/dsh`）
- 结论：5 条断言全绿，进入 G2 的前置条件成立

---

## 0. 隔离实例与实验装配

### 0.1 隔离实例

| 项 | 值 |
|---|---|
| `DSH_HOME` | `/tmp/session-tool-toggle-spike/dsh-home` |
| profile | `headless`（由随包模板在首次启动时生成，随后加 patch） |
| 端口 | headless 表层**不监听端口**（`dsh-headless/README.zh.md` 明确「进程不打开任何端口」）；另用同一隔离树启动 web 表层验证独立端口，见 §7 |
| 宿主实例 | PID 1 `node /usr/local/bin/dsh web --no-open`（端口 3080）全程未被触碰 |

### 0.2 fixture skill（3 个，`customSkillDirs` 指向该目录）

```text
/tmp/session-tool-toggle-spike/skills/
├── fixture-alpha/SKILL.md   # frontmatter name/description + 正文 SPIKE-BODY-7f3a-alpha
├── fixture-beta/SKILL.md    # 正文 SPIKE-BODY-7f3a-beta
└── fixture-gamma/SKILL.md   # 正文 SPIKE-BODY-7f3a-gamma
```

`fixture-alpha/SKILL.md` 正文（frontmatter 之后、`content` 字段的比对基准：52 个字符 / 78 UTF-8 字节）：

```markdown
# Fixture Alpha

SPIKE-BODY-7f3a-alpha
第二行正文用于逐字节比对。
```

### 0.3 隔离 profile 的 patch（`dsh-home/profiles/headless/cordis.patch.yml`）

```yaml
- id: skill-filesystem
  config:
    includeDefaultRoots: false          # 不扫项目/用户/agents 根，只扫 fixture
    watch: false
    customSkillDirs:
      - /tmp/session-tool-toggle-spike/skills
- id: agent-default-model
  config:
    provider: spike                     # 进程内 mock adapter，见 §0.4
    model: mock-1
- insert:
    - id: spike-skill-shadow
      name: dsh-spike-skill-shadow      # link:/tmp/session-tool-toggle-spike/plugin
```

### 0.4 最小实验插件（`/tmp/session-tool-toggle-spike/plugin/index.js`，不安装目标插件）

该插件只模拟目标机制，不含任何生产实现：

1. 注册进程内 mock LLM adapter（provider `spike`），使 headless 一步会话不需要真实凭据；
2. 监听 `agent/created`（serial 事件，`agents.create` 会 await 它），对 headless runner 创建的主 agent 执行：
   `agent.ctx.inject(['skills'], (scope) => { disposeStub = scope.skills.register({ ...realSkill, invocation: { modelInvocable: false, userInvocable: true } }) })`
   —— 与设计中的 `mountSkills` 同一条路径：注册落在 agent 子 fiber 的 scope 层，并随该 fiber 回收；
3. 在同一个隔离进程里再创建两个真实 agent/session：
   - `session-spike-neighbor`：邻会话，遮挡期间驱动一轮；
   - `session-spike-incomplete`：在其 agent 作用域注册 `list() -> { candidates: [], complete: false }` 的 provider，观察「目录不更新」；
4. 在 `agent/turn-stopping`（serial，轮次关闭前 await）撤掉 stub，并驱动主会话第二轮验证恢复。

### 0.5 运行命令

```bash
cd /tmp/session-tool-toggle-spike
DSH_HOME=$PWD/dsh-home dsh --profile headless --json '/fixture-alpha'
```

观察输出（`evidence/headless-main.jsonl`，退出码 0；两条 `turn_end` 均为 `completed`）：

```json
{"type":"session","sessionId":"session-d8945c9b-3f81-48d0-bac2-9552210d02fd","cwd":"/tmp/session-tool-toggle-spike"}
{"type":"status","phase":"turn_start","turn":1}
{"type":"status","phase":"step_end","turn":1,"step":1,"usage":{"inputTokens":1,"outputTokens":1,"totalTokens":2}}
{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}
{"type":"status","phase":"turn_start","turn":2}
{"type":"status","phase":"turn_end","turn":2,"reason":{"kind":"completed"}}
{"type":"final","text":"SPIKE-MOCK-REPLY"}
```

- 主会话：`session-d8945c9b-3f81-48d0-bac2-9552210d02fd`（首条用户消息 `/fixture-alpha`）
- 邻会话：`session-spike-neighbor`（首条用户消息 `neighbor-ping`）
- incomplete 会话：`session-spike-incomplete`（首条用户消息 `incomplete-ping`）
- 会话日志：`dsh-home/sessions/--tmp-session-tool-toggle-spike--/<sessionId>/session.v4.jsonl.zstd`（多帧 zstd；校验脚本逐帧解压）

---

## 1. 断言 1：stub 落 agent 层并胜出

**断言**：agent 子 fiber 的 `scope.skills.register(stub)` 落 agent 层且胜出；`snapshot({scope: agent})` 里该 name 的 `provider` == 注册时的 `provider`。

### 命令

```bash
grep '"event":"stub-registered-in-agent-fiber"' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
grep '"event":"assertion-1-agent-layer-wins"' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
```

### 观察输出

```json
{"at":"2026-11-04T14:03:32.768Z","event":"stub-registered-in-agent-fiber","name":"fixture-alpha","provider":"filesystem","invocation":{"modelInvocable":false,"userInvocable":true},"disposerType":"function"}
{"at":"2026-11-04T14:03:32.772Z","event":"assertion-1-agent-layer-wins","complete":true,"names":["fixture-alpha","fixture-beta","fixture-gamma"],"entry":{"provider":"filesystem","modelInvocable":false,"userInvocable":true},"registeredProvider":"filesystem","globalView":{"provider":"filesystem","modelInvocable":true,"userInvocable":true}}
```

逐点核对：

- `entry.provider === registeredProvider === "filesystem"`：注册时克隆了真实定义的 `provider`，回读一致；
- `entry.invocation.modelInvocable === false`：agent 视图的胜出条目就是 stub（真实定义本为 `true`）；
- `globalView.modelInvocable === true`：同一 name 在全局视图仍是 filesystem 的真实条目 —— 证明 stub 只落在 agent 层、没有污染全局层；
- `snapshot.complete === true`：目录观测完整。

结果：通过

---

## 2. 断言 2：下一 `agent/pre-step` 的目录消息不含该名

**断言**：stub 注册后的下一步 `agent/pre-step` 追加的目录消息（`source.kind === 'skill-catalog'` 的 user 消息）不含 `fixture-alpha`。

### 命令

```bash
node /tmp/session-tool-toggle-spike/verify.mjs
```

（`verify.mjs` 逐帧解压会话日志，读取 `user/message` 事件的 `source.kind` / `source.entries`。）

### 观察输出

```json
"mainCatalogMessages": [
  {
    "seq": 10,
    "update": false,
    "names": [
      "fixture-beta",
      "fixture-gamma"
    ]
  },
  {
    "seq": 25,
    "update": true,
    "names": [
      "fixture-alpha",
      "fixture-beta",
      "fixture-gamma"
    ]
  }
]
```

主会话 `seq=10` 的原始消息片段（`source.kind = "skill-catalog"`、`form = "catalog"`、`entries` 只有 beta/gamma）：

```text
<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `fixture-beta`: Spike fixture skill beta, a neighbor that must stay visible.
- `fixture-gamma`: Spike fixture skill gamma, a third catalog member.
</available_skills>
...
</system-reminder>
```

`fixture-alpha` 不在首份目录中；`seq=25` 是撤掉 stub 后第二轮追加的替换目录（见断言 5），此时才重新出现。

结果：通过

---

## 3. 断言 3：`skill` 工具直接调用返回 not available for model invocation

**断言**：`skill` 工具直接调用返回 `skill "x" is not available for model invocation`。

### 命令

```bash
grep '"event":"assertion-3-tool-execute"' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
```

插件内的调用方式是直接执行注册表中的工具定义（不经过模型）：

```js
const tool = ctx.tools.get('skill', agent)
await tool.execute(
  { name: 'fixture-alpha' },
  { callId: 'call-spike-main', name: 'skill', arguments: { name: 'fixture-alpha' }, agent, signal },
)
```

### 观察输出

```json
{"at":"2026-11-04T14:03:32.774Z","event":"assertion-3-tool-execute","toolFound":true,"errorMessage":"skill \"fixture-alpha\" is not available for model invocation"}
```

与 `@deepseek-ai/dsh-tool-skill/lib/index.js:875/878` 的 `throw new Error(\`skill "${args.name}" is not available for model invocation\`)` 文案逐字一致。

结果：通过

---

## 4. 断言 4：`/name` 手动调用仍注入完整正文

**断言**：`/fixture-alpha` 手动调用仍注入完整正文；`<skill_content>` 内的 `content` 与磁盘 `SKILL.md` 一致，`provider` 等于真实 provider。

### 命令

```bash
grep '"event":"assertion-4-shadowed-definition"' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
node /tmp/session-tool-toggle-spike/verify.mjs
```

（`/name` 监听器与工具走同一条 `ctx.skills.get(name, { scope: agent })`；插件在 stub 注册后回读该定义，作为注入内容的来源证据。）

### 观察输出

```json
{"at":"2026-11-04T14:03:32.772Z","event":"assertion-4-shadowed-definition","provider":"filesystem","userInvocable":true,"modelInvocable":false,"contentLength":52,"contentSha256":"34dd56be2933fc71a6ec9bfbc229040994b679baa280dae37e437dca2ae052e5","sameContentAsDiskCaptured":true}
```

```json
"invocation": {
  "seq": 11,
  "name": "fixture-alpha",
  "form": "instructions",
  "startsWith": "<skill_content name=\"fixture-alpha\">\n<skill_resources>\nBase directory for this s",
  "bodyEqualsDisk": true,
  "bodySha256": "34dd56be2933fc71a6ec9bfbc229040994b679baa280dae37e437dca2ae052e5",
  "diskSha256": "34dd56be2933fc71a6ec9bfbc229040994b679baa280dae37e437dca2ae052e5"
}
```

主会话 `seq=11` 的注入消息原文（`source.kind = "skill-invocation"`、`source.name = "fixture-alpha"`、`source.form = "instructions"`）：

```text
<skill_content name="fixture-alpha">
<skill_resources>
Base directory for this skill: /tmp/session-tool-toggle-spike/skills/fixture-alpha
Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.
</skill_resources>

<skill_instructions>
# Fixture Alpha

SPIKE-BODY-7f3a-alpha
第二行正文用于逐字节比对。
</skill_instructions>
</skill_content>
```

对照磁盘：

```bash
node -e "const fs=require('node:fs'),c=require('node:crypto');const raw=fs.readFileSync('/tmp/session-tool-toggle-spike/skills/fixture-alpha/SKILL.md','utf8');const body=/^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(raw)[1].trim();console.log(body.length,c.createHash('sha256').update(body,'utf8').digest('hex'))"
# 输出：52 34dd56be2933fc71a6ec9bfbc229040994b679baa280dae37e437dca2ae052e5
```

`<skill_instructions>` 与磁盘 `SKILL.md` 去掉 frontmatter 后的 `content` 逐字节相同（均为 52 个字符 / 78 UTF-8 字节、sha256 `34dd56be…a052e5`）。

说明（版本事实，非降级）：rc.5 的 `renderSkillContent()` 只渲染 `name` 属性与 `<skill_resources>` 提示，**不渲染** `provider` 属性；「provider 等于真实 provider」由定义层取证：`assertion-4-shadowed-definition.provider === "filesystem"`，与真实 filesystem provider 一致（stub 是真实定义的克隆，未改成 `runtime`）。

结果：通过

---

## 5. 断言 5：dispose 后恢复，邻会话全程不受影响

**断言**：撤掉 stub（dispose）后全部恢复；邻会话全程不受影响。

### 命令

```bash
grep '"event":"assertion-5' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
node /tmp/session-tool-toggle-spike/verify.mjs
```

### 观察输出

```json
{"event":"assertion-5-neighbor-before-shadow","neighborId":"session-spike-neighbor","complete":true,"names":["fixture-alpha","fixture-beta","fixture-gamma"],"entry":{"provider":"filesystem","modelInvocable":true,"userInvocable":true},"toolResult":{"ok":true,"provider":"filesystem","contentLength":52,"marker":true}}
{"event":"assertion-5-neighbor-during-shadow","neighborId":"session-spike-neighbor","complete":true,"names":["fixture-alpha","fixture-beta","fixture-gamma"],"entry":{"provider":"filesystem","modelInvocable":true,"userInvocable":true},"toolResult":{"ok":true,"provider":"filesystem","contentLength":52,"marker":true}}
{"event":"assertion-5-after-dispose-restored","complete":true,"names":["fixture-alpha","fixture-beta","fixture-gamma"],"entry":{"provider":"filesystem","modelInvocable":true,"userInvocable":true},"toolResult":{"ok":true,"provider":"filesystem","contentLength":52,"marker":true}}
{"event":"assertion-5-neighbor-after-dispose","neighborId":"session-spike-neighbor","complete":true,"names":["fixture-alpha","fixture-beta","fixture-gamma"],"entry":{"provider":"filesystem","modelInvocable":true,"userInvocable":true},"toolResult":{"ok":true,"provider":"filesystem","contentLength":52,"marker":true}}
```

（四条事件的 `at` 字段略；`evidence/plugin-events.jsonl` 中有完整时间戳。）

关键点：

- **主会话恢复**：`disposeStub()` 之后 `snapshot({ scope: agent })` 中 `fixture-alpha` 回到 `modelInvocable: true`；`skill` 工具直接调用重新返回完整正文（`ok: true`，`marker: true`）；
- **主会话下一份目录重新含该名**：`verify.mjs` 读到 `mainCatalogMessages[1]`（`seq=25`、`update=true`）names 为 `["fixture-alpha","fixture-beta","fixture-gamma"]`，原文开头即「The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session」；
- **邻会话**：`session-spike-neighbor` 在遮挡前、遮挡期间（它自己驱动了一轮）、dispose 后三次读数均为 `provider: filesystem`、`modelInvocable: true`、工具可加载完整正文；其 `seq=10` 的 `skill-catalog` 消息（`verify.mjs` 中 `neighborCatalogNames`）包含 `fixture-alpha`；
- 邻会话与主会话同进程、同一 skill 注册表，仅 scope 不同 —— 满足「邻会话全程不受影响」。

`verify.mjs` 汇总：

```json
"A5 dispose 后恢复（下一份目录重新含该名）且邻会话全程不受影响": true
```

结果：通过

---

## 6. 额外观察（不计入 5 条通过数）：`snapshot.complete === false` 时目录不更新

**上游代码事实**（`@deepseek-ai/dsh-tool-skill/lib/index.js:944`）：

```js
signal.throwIfAborted();
if (!snapshot.complete) return decision;
```

**实验**：在 `session-spike-incomplete` 的 agent 作用域注册 provider `spike-incomplete`，其 `list()` 返回 `{ candidates: [], complete: false }`；随后驱动一轮。

### 命令

```bash
grep '"event":"extra-incomplete-snapshot"' \
  /tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl
node /tmp/session-tool-toggle-spike/verify.mjs
```

### 观察输出

```json
{"at":"2026-11-04T14:03:32.809Z","event":"extra-incomplete-snapshot","complete":false,"count":3,"names":["fixture-alpha","fixture-beta","fixture-gamma"]}
```

```json
"额外观察：snapshot.complete=false 时该步不追加目录消息（incomplete 会话 0 条 skill-catalog）": true
```

`session-spike-incomplete` 的会话日志中 `user/message` 只有 `source.kind = "user"` 与 `"runtime-context"` 两类，**没有** `skill-catalog` 消息 —— 与 944 行的早退一致（保留上一份可用目录、不把不完整观测当成删除）。

**回执文案**：本 spike 不实现目标插件的 toggle 回执（无源码改动），因此「下一步收敛」提示无法在 spike 阶段断言；该文案属于 G3/G6 的实现期断言（`skillsSettled` + 回执），此处只记录上游「不更新」行为。结论：符合预期（观察项，不计入 5 条通过数）。

---

## 7. 隔离性与安全边界

- **DSH_HOME**：`/tmp/session-tool-toggle-spike/dsh-home`，会话、storages、profile 全在该目录内；未读写宿主 `~/.dsh`（宿主 profile 未改动）。
- **宿主实例**：PID 1 `node /usr/local/bin/dsh web --no-open` 全程存活（`ps -o pid,etime,cmd -p 1` 前后一致）；未 kill / 未重启任何现有进程；端口 3080 未被触碰。
- **独立端口**：headless 表层按设计不监听端口；另用同一隔离 `DSH_HOME` 的 `spike-web` profile 启动 web 表层验证独立端口：

  ```bash
  DSH_HOME=/tmp/session-tool-toggle-spike/dsh-home \
    dsh --profile spike-web --no-open --host 127.0.0.1 --port 3987
  ```

  观察输出（`evidence/web-3987.log`，token 已掩码）：

  ```text
  dsh web: http://127.0.0.1:3987/?token=***
  ```

  对打印出的带 token URL 取首页返回 HTTP `303`（未跟随重定向；服务已监听并响应）。验证完按自己记录的 PID `kill` 并 `wait`，确认该 PID 退出、3987 已关闭；未触碰 PID 1。该 web 实例仅用于端口隔离证明，不参与 5 条断言的取证。

- **凭据**：隔离 `DSH_HOME` 内没有真实 provider 凭据；实验使用进程内 mock adapter（provider `spike`），**未**读取/复制/写入任何真实密钥，也未产生真实 LLM token 消耗。
- **仓库**：`git status` 中除本文件（新增）外，仅父代理先前已存在的改动（`.gitignore`、`design.md`、`tasks.md` 等），本 spike 未写任何源码或配置。

---

## 8. 复现清单（临时资产，均在 `/tmp`，不入库）

| 路径 | 作用 |
|---|---|
| `/tmp/session-tool-toggle-spike/skills/` | 3 个 fixture skill（含唯一正文标记） |
| `/tmp/session-tool-toggle-spike/plugin/` | 最小实验插件（mock LLM + agent 子 fiber 注册 stub + 邻会话/incomplete 观察） |
| `/tmp/session-tool-toggle-spike/dsh-home/` | 隔离 `DSH_HOME`（headless + spike-web profile、会话日志） |
| `/tmp/session-tool-toggle-spike/evidence/plugin-events.jsonl` | 插件逐条观察事件 |
| `/tmp/session-tool-toggle-spike/evidence/headless-main.jsonl` | headless `--json` 事件流 |
| `/tmp/session-tool-toggle-spike/verify.mjs` | 多帧 zstd 解压 + 5 断言/额外观察校验（退出码 0） |
| `/tmp/session-tool-toggle-spike/evidence/web-3987.log` | 独立端口 web 启动日志（token 已掩码展示） |

复跑：

```bash
cd /tmp/session-tool-toggle-spike
rm -rf dsh-home/sessions dsh-home/storages
rm -f evidence/plugin-events.jsonl evidence/headless-main.jsonl
DSH_HOME=$PWD/dsh-home dsh --profile headless --json '/fixture-alpha' > evidence/headless-main.jsonl
node verify.mjs   # allPassed: true
```

---

## 9. 与设计文本的偏差（如实记录）

1. **未使用真实 LLM provider**：隔离 `DSH_HOME` 没有凭据，而复制真实密钥到 `/tmp` 被禁止；改用进程内 mock adapter（provider `spike`）。5 条断言都发生在 skill 注册表 / `skill` 工具 / pre-step 目录与 `/name` 注入层，与模型内容无关；mock 只负责让轮次以 `completed` 收尾（并以第二轮验证恢复）。
2. **headless 无端口，独立端口用同树的 `spike-web` 补证**：见 §7；5 条断言本身在 headless 实例上取证。
3. **stub 注册时机**：实验在 `agent/created`（serial，`agents.create` 会 await）里执行 `agent.ctx.inject(['skills'], cb)`；生产设计的 `mountSkills` 在层 attach（`agent/created` 之后、首步之前）注册。两者都是「agent 子 fiber 的 scope 层」，且本实验证明该层在首份目录消息之前已生效。
4. **`provider` 属性**：rc.5 的 `<skill_content>` 不渲染 provider 属性，断言用「加载到的定义 provider == 真实 provider（filesystem）」取证，正文逐字节比对不受影响。
5. **临时脚本位置**：`code-design.md` 原文写「临时脚本放 `artifacts/`（gitignore）」，本任务执行裁定明确改放 `/tmp`（证据文件不入库），已按执行裁定执行；`artifacts/` 内只有本结论文件。
6. **回执「下一步收敛」**：见 §6，spike 阶段无插件回执可断言，留待 G3/G6。

---

## 10. 本文件的验证

```bash
test -s openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md
[ "$(grep -c '^结果：通过' openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md)" -eq 5 ]
```

两条命令退出码均为 0（本文件非空，5 条断言各一行 `结果：通过`）。
