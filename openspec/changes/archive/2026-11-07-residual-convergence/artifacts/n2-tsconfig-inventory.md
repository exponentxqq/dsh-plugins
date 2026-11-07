# N2 tsconfig include 盘点工件：三包 `test/` 覆盖矩阵

> 执行期工件（2026-11-07 16:30 CST，任务 **9.3**，组 9 执行子代理）。
> 变更 `residual-convergence`；盘点对象 = 当前工作树（HEAD `58c62d5` + 组 1–5 的未提交改动）。
> **边界**：只盘点、不改形态（D15）。本任务不跑门禁、不读门禁日志、不改任何源文件 / tsconfig、不勾 `tasks.md`。
> 真源：`code-design.md` ⑤组 6 第 4 条（`:685-689`）、D15（`:436`）、F3 现状表（`:13`）、`tasks.md:65`。

## 0. 结论先行

- **固定结论（逐字照录）**：stt **23** / web-ux **19** / wsc **7**（含 stub）全部覆盖、**未覆盖 0**；形态保持枚举（D15）；异常时升格为待决。
- **独立复算复核**：三包 `test/` 全文件 **24 / 20 / 7**（合计 51 = 48 个 `*.test` 套件 + 3 个 `test/stubs/ui-primitives.tsx`）；两段 tsconfig 的 include 并集分别覆盖 **24 / 20 / 7**，**未覆盖列表为空**。
- **第二源交叉核验**：TypeScript 自身的 include 展开（`tsc -p <cfg> --showConfig` 的 `files`）与自持 glob 判定，在 **6 组集合（3 包 × host/client）上逐文件完全一致，0 差异**。
- **异常升格：否**——不存在未被任何工程 include 覆盖的文件。

## 1. 盘点方法（独立复算声明）

### 1.1 盘点宇宙

| 项 | 取值 |
|---|---|
| 包 | stt = `plugins/session-tool-toggle`；web-ux = `plugins/web-ux`；wsc = `plugins/workspace-config` |
| 文件宇宙 | 各包 `test/` 目录**递归全部文件**（含 `stubs/` 下的非测试文件、含隐藏文件）；不限于 `*.test.ts(x)` |
| 覆盖来源 | 该包 `tsconfig.host.json` 与 `tsconfig.client.json` 的 `include` 条目（两段工程都算） |
| 不在宇宙内 | `src/` 同目录测试（实测三包 `test/` 之外无 `*.test.ts(x)`）、`lib/` 产物、`node_modules/` |
| 不计语义 | `extends` 链上的 include（根基准 `tsconfig.plugin.base.json` 只有 `compilerOptions`、无 `include`，故包级 include 即完整集合） |

### 1.2 覆盖判据（与 AR8-3 同法）

单条 include 条目命中文件路径即算覆盖，规则与 `scripts/check-architecture.mjs` 的 AR8-3（`:958-999`）语义相同：

| 条目形态 | 语义 |
|---|---|
| 无通配（如 `test/panel-client.test.ts`） | 命中该文件本身；若为目录（如 `src/host`）则命中其下全部文件（TypeScript 语义） |
| `**` | 跨目录；`**` + `/` 允许零层（`test/**/*.test.tsx` 也匹配 `test/a.test.tsx`） |
| `*` | 单段内任意字符，不跨 `/` |
| `?` | 单字符，不跨 `/` |
| `./` 前缀 / 尾部 `/` | 规范化后忽略 |

判定单位是**文件**：一个 test/ 文件只要被 host 或 client 任一段 include 命中，即「已覆盖」。

### 1.3 独立性声明（不是读门禁日志）

- 本盘点是**自持实现的独立复算**：§1.4 脚本自带 glob→正则与「无通配条目按目录展开」两段逻辑，不 `import`、不 `spawn`、不调用 `scripts/check-architecture.mjs`，也不读取任何门禁输出 / 日志 / 缓存。
- 与 AR8-3 只共享**判定语义**（同法），不共享代码与结果；因此本工件的数字同时构成对 AR8-3 判定的一次外部核对。
- 第二源 `tsc --showConfig` 用 TypeScript 编译器自己的 include 展开做交叉核验（§1.4 第二条命令）——这是编译器事实，不是门禁。

### 1.4 复跑命令

**（a）自持枚举（在仓库根执行，退出 0）**

```js
// 用法：把本块保存为 /tmp/n2-inventory.mjs，在仓库根执行 `node /tmp/n2-inventory.mjs`（只读，退出 0）
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const PKGS = [['stt', 'session-tool-toggle'], ['web-ux', 'web-ux'], ['wsc', 'workspace-config']]
const CFGS = ['tsconfig.host.json', 'tsconfig.client.json']

// include 条目 -> 正则：`**` + `/` 允许零层，`*` 不跨 `/`，`?` 单字符，其余字面转义
const toRe = (entry) => {
  const p = entry.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '')
  let out = ''
  for (let i = 0; i < p.length; i += 1) {
    const c = p[i]
    if (c === '*') {
      if (p[i + 1] !== '*') { out += '[^/]*'; continue }
      if (p[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2 } else { out += '.*'; i += 1 }
    } else if (c === '?') out += '[^/]'
    else out += /[.*+?^${}()|[\]\\]/u.test(c) ? `\\${c}` : c
  }
  return new RegExp(`^${out}$`, 'u')
}

// 无通配条目按 TypeScript 语义 = 该文件本身，或该目录下的全部文件
const covers = (entry, file) => {
  const e = entry.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '')
  if (e === '') return false
  return toRe(e).test(file) || (!e.includes('*') && file.startsWith(`${e}/`))
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)])

for (const [short, dirName] of PKGS) {
  const pkg = join(process.cwd(), 'plugins', dirName)
  const files = walk(join(pkg, 'test')).map((f) => relative(pkg, f).replaceAll('\\', '/')).sort()
  const inc = Object.fromEntries(CFGS.map((c) => {
    const f = join(pkg, c)
    return [c, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).include : []]
  }))
  const rows = files.map((file) => ({
    file,
    host: inc[CFGS[0]].filter((e) => covers(e, file)),
    client: inc[CFGS[1]].filter((e) => covers(e, file)),
  }))
  const suites = files.filter((f) => /\.test\.(?:ts|tsx)$/u.test(f))
  const uncovered = rows.filter((r) => r.host.length + r.client.length === 0)
  console.log(`\n## ${short} (${dirName})  test/ 全文件 ${files.length} | *.test ${suites.length} | host ${rows.filter((r) => r.host.length).length} | client ${rows.filter((r) => r.client.length).length} | 未覆盖 ${uncovered.length}`)
  for (const r of rows) console.log(`${r.file}\t${r.host.join(',') || '-'}\t${r.client.join(',') || '-'}`)
  if (uncovered.length) console.log('UNCOVERED: ' + uncovered.map((r) => r.file).join(', '))
}
```

**（b）第二源交叉核验（在仓库根执行；六段工程逐一对齐）**

```bash
for p in session-tool-toggle web-ux workspace-config; do
  for c in host client; do
    (cd plugins/$p && ./node_modules/.bin/tsc -p tsconfig.$c.json --showConfig) \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=JSON.parse(s).files.map(x=>x.replace(/^\.\//,""));console.log(process.argv[1], f.filter(x=>x.startsWith("test/")).length)})' "$p/$c"
  done
done
# 期望（2026-11-07 实测）：stt/host 15、stt/client 9；web-ux/host 7、web-ux/client 13；wsc/host 7、wsc/client 0 —— 与 (a) 逐文件一致
```

**（c）原始磁盘计数（无判据，只数文件）**

```bash
for p in session-tool-toggle web-ux workspace-config; do
  printf '%-20s test全文件=%s *.test.ts=%s *.test.tsx=%s stubs=%s\n' "$p" \
    "$(find plugins/$p/test -type f | wc -l)" \
    "$(find plugins/$p/test -name '*.test.ts' | wc -l)" \
    "$(find plugins/$p/test -name '*.test.tsx' | wc -l)" \
    "$(find plugins/$p/test/stubs -type f 2>/dev/null | wc -l)"
done
# 实测：session-tool-toggle 24 / 20 / 3 / 1；web-ux 20 / 14 / 5 / 1；workspace-config 7 / 3 / 3 / 1
```

## 2. 三包逐包覆盖矩阵

### 2.0 汇总

| 包 | `test/` 全文件 | `*.test.ts` | `*.test.tsx` | 非测试（stub） | host include 覆盖 | client include 覆盖 | 双覆盖 | **未覆盖** |
|---|---|---|---|---|---|---|---|---|
| stt（`dsh-plugin-session-tool-toggle`） | 24 | 20 | 3 | 1 | **15** | **9** | 0 | **0** |
| web-ux（`dsh-plugin-web-ux`） | 20 | 14 | 5 | 1 | **7** | **13** | 0 | **0** |
| wsc（`dsh-plugin-workspace-config`） | 7 | 3 | 3 | 1 | **7** | **0** | 0 | **0** |
| 合计 | **51** | 37 | 11 | 3 | 29 | 22 | 0 | **0** |

> stt / web-ux 的 host 与 client 是**互斥分区**（无一份文件被两段同时检查，双覆盖 0）；wsc 的测试全部由 host 程序检查，client 工程只承载 `src/client`（不承载测试）。

### 2.1 stt — `plugins/session-tool-toggle/test/`（24 文件）

`tsconfig.host.json`：18 条 include（3 条 src + **15 条测试文件逐条枚举**）；`tsconfig.client.json`：10 条 include（3 条 src + 2 条 test glob + **5 条测试文件逐条枚举**）。
**host 覆盖 15 / client 覆盖 9 / 双覆盖 0 / 未覆盖 0；未覆盖列表为空。**

| test/ 文件 | host include 命中条目 | client include 命中条目 |
|---|---|---|
| `test/address.test.ts` | `test/address.test.ts` | — |
| `test/bundle.test.ts` | `test/bundle.test.ts` | — |
| `test/client-index.test.ts` | — | `test/client-index.test.ts` |
| `test/commands.test.ts` | `test/commands.test.ts` | — |
| `test/control.test.ts` | `test/control.test.ts` | — |
| `test/defaults-view.test.ts` | — | `test/defaults-view.test.ts` |
| `test/defaults.test.ts` | `test/defaults.test.ts` | — |
| `test/locale-parity.test.ts` | — | `test/locale-parity.test.ts` |
| `test/mask.test.ts` | `test/mask.test.ts` | — |
| `test/panel-client.test.ts` | — | `test/panel-client.test.ts` |
| `test/panel-controller.test.ts` | — | `test/panel-controller.test.ts` |
| `test/panel.test.ts` | `test/panel.test.ts` | — |
| `test/record-store.test.ts` | `test/record-store.test.ts` | — |
| `test/rpc.test.ts` | `test/rpc.test.ts` | — |
| `test/session-layer.test.ts` | `test/session-layer.test.ts` | — |
| `test/skill-panel.test.tsx` | — | `test/**/*.test.tsx` |
| `test/skills-plan.test.ts` | `test/skills-plan.test.ts` | — |
| `test/state.test.ts` | `test/state.test.ts` | — |
| `test/stubs/ui-primitives.tsx`（stub） | — | `test/stubs/**/*.tsx` |
| `test/tool-panel.test.tsx` | — | `test/**/*.test.tsx` |
| `test/wire-contract.test.ts` | `test/wire-contract.test.ts` | — |
| `test/workspace-attribution.test.ts` | `test/workspace-attribution.test.ts` | — |
| `test/workspace-editor.test.tsx` | — | `test/**/*.test.tsx` |
| `test/workspaces.test.ts` | `test/workspaces.test.ts` | — |

### 2.2 web-ux — `plugins/web-ux/test/`（20 文件）

`tsconfig.host.json`：13 条 include（6 条 src + **7 条测试文件逐条枚举**）；`tsconfig.client.json`：13 条 include（4 条 src + 1 条 test glob + **8 条测试/替身文件逐条枚举**）。
**host 覆盖 7 / client 覆盖 13 / 双覆盖 0 / 未覆盖 0；未覆盖列表为空。**

| test/ 文件 | host include 命中条目 | client include 命中条目 |
|---|---|---|
| `test/badge.test.tsx` | — | `test/**/*.test.tsx` |
| `test/bundle.test.ts` | `test/bundle.test.ts` | — |
| `test/client-apply.test.ts` | — | `test/client-apply.test.ts` |
| `test/config.test.ts` | `test/config.test.ts` | — |
| `test/contract.test.ts` | `test/contract.test.ts` | — |
| `test/delete-client.test.ts` | — | `test/delete-client.test.ts` |
| `test/delete-dialog.test.tsx` | — | `test/**/*.test.tsx` |
| `test/delete-menu-item.test.tsx` | — | `test/**/*.test.tsx` |
| `test/delete-session.test.ts` | `test/delete-session.test.ts` | — |
| `test/delete-store.test.ts` | — | `test/delete-store.test.ts` |
| `test/index.test.ts` | `test/index.test.ts` | — |
| `test/locale-parity.test.ts` | — | `test/locale-parity.test.ts` |
| `test/migrated.test.ts` | `test/migrated.test.ts` | — |
| `test/notice-card.test.tsx` | — | `test/**/*.test.tsx` |
| `test/notice-store.test.ts` | — | `test/notice-store.test.ts` |
| `test/notice-visibility.test.ts` | — | `test/notice-visibility.test.ts` |
| `test/project-key.test.ts` | `test/project-key.test.ts` | — |
| `test/session-manager-dialog.test.tsx` | — | `test/**/*.test.tsx` |
| `test/session-manager-model.test.ts` | — | `test/session-manager-model.test.ts` |
| `test/stubs/ui-primitives.tsx`（stub） | — | `test/stubs/ui-primitives.tsx` |

### 2.3 wsc — `plugins/workspace-config/test/`（7 文件）

`tsconfig.host.json`：5 条 include（2 条 src + **3 条 test glob**：`.test.ts` / `.test.tsx` / `stubs/**/*.tsx`）；`tsconfig.client.json`：2 条 include（仅 `src/client` 与 `src/css-modules.d.ts`，**不承载测试**）。
**host 覆盖 7 / client 覆盖 0 / 双覆盖 0 / 未覆盖 0；未覆盖列表为空。**

| test/ 文件 | host include 命中条目 | client include 命中条目 |
|---|---|---|
| `test/apply.test.ts` | `test/**/*.test.ts` | — |
| `test/bundle.test.ts` | `test/**/*.test.ts` | — |
| `test/dialog.test.tsx` | `test/**/*.test.tsx` | — |
| `test/section-seat.poc.test.tsx` | `test/**/*.test.tsx` | — |
| `test/sections.test.ts` | `test/**/*.test.ts` | — |
| `test/stubs/ui-primitives.tsx`（stub） | `test/stubs/**/*.tsx` | — |
| `test/trigger.test.tsx` | `test/**/*.test.tsx` | — |

## 3. 固定结论与计数口径

### 3.1 固定结论（照录）

> stt **23** / web-ux **19** / wsc **7**（含 stub）**全部覆盖、未覆盖 0**；形态保持枚举（D15）；异常时升格为待决。

### 3.2 两种计数口径（不可混读）

固定结论的三个数字来自**两种口径**，任务原文已要求「写清两种口径避免歧义」，故在此双记账：

| 口径 | stt | web-ux | wsc | 对齐对象 |
|---|---|---|---|---|
| **A：`*.test.ts(x)` 套件文件** | **23**（20 `.ts` + 3 `.tsx`） | **19**（14 + 5） | 6（3 + 3） | AR8 常驻日志的计数（`testFiles.length`，`:998`，wsc 显示 **6**）；`code-design.md:13` F3 表（stt 23 = 20+3 / web-ux 19 = 14+5 / wsc 6 = 3+3）；`tasks.md:42` 组 3 收口句（wsc 6） |
| **B：`test/` 全文件 = A + `test/stubs/ui-primitives.tsx`** | 24 | 20 | **7**（6 + 1 stub） | 本工件固定结论里的 wsc **7**；AR8-3 的**覆盖判定宇宙**（`check-architecture.mjs:958-999` 对 `files` 全量做覆盖，日志只数 `testFiles`） |
| **固定结论取用** | 23（A） | 19（A） | 7（B，原文已注「含 stub」） | `code-design.md:685-689` ⑤组 6 第 4 条 |

> **读法**：AR8 日志的「wsc 6」不是漏覆盖——它是口径 A；wsc 的 stub 确实被 `test/stubs/**/*.tsx` 覆盖，只是不进 `*.test` 计数。同理 stt / web-ux 的口径 B 分别是 24 / 20，两个口径下**未覆盖都是 0**，所以「全部覆盖、未覆盖 0」的结论不受口径选择影响。
> **引用建议**：写数字时带口径标签（如「wsc 7（含 stub）/ 6（仅套件）」），避免下一轮把 6 与 7 当成覆盖差异。

### 3.3 逐项核对（独立复算值 × 固定结论）

| 固定结论项 | 独立复算值 | 口径 | 判定 |
|---|---|---|---|
| stt 23 | 23（`*.test`：20 `.ts` + 3 `.tsx`） | A | **一致** |
| web-ux 19 | 19（`*.test`：14 + 5） | A | **一致** |
| wsc 7（含 stub） | 7（`*.test` 6 = 3 + 3，加 `test/stubs/ui-primitives.tsx`） | B | **一致** |
| 全部覆盖 | 24 / 20 / 7 全文件均被至少一段工程 include 命中 | A + B | **一致** |
| 未覆盖 0 | 0（三包；口径 A、B 同为 0） | A + B | **一致** |
| 未覆盖列表 | 空 | A + B | **一致** |

**异常升格判定：否**（不存在未覆盖文件，无需按 tasks.md 9.3 的异常分支上报待决）。

## 4. 形态保持枚举（D15：只盘点，不 glob 化）

| 包 | 工程 | include 条目数 | 测试相关条目形态 | 本轮是否改动 |
|---|---|---|---|---|
| stt | `tsconfig.host.json` | 18 | **15 条测试文件逐条枚举**（+ `src/host` 目录条目） | 否 |
| stt | `tsconfig.client.json` | 10 | 2 条 glob（`test/**/*.test.tsx`、`test/stubs/**/*.tsx`）+ **5 条逐条枚举** | 否 |
| web-ux | `tsconfig.host.json` | 13 | **7 条逐条枚举** | 否 |
| web-ux | `tsconfig.client.json` | 13 | 1 条 glob（`test/**/*.test.tsx`）+ **8 条逐条枚举（含 stub）** | 否 |
| wsc | `tsconfig.host.json` | 5 | **3 条 glob**（`test/**/*.test.ts`、`test/**/*.test.tsx`、`test/stubs/**/*.tsx`） | 否 |
| wsc | `tsconfig.client.json` | 2 | 无测试条目（只 include `src/`） | 否 |

- **形态未变**：本任务为纯盘点，未修改任何一条 include、未新增 / 删除文件；上表即盘点时点的形态快照。
- **不 glob 化的理由（D15）**：stt / web-ux 的 host 与 client 是**两个独立编译程序**，测试文件按归属逐条登记就是分区语义本身；glob 化会把 client 的 `.ts` 测试塞进 host 程序（重复检查），或反向丢失检查——出错时表现为「两个程序类型检查结果不一致」，而不是当场报错。当前 15 / 7 条逐条登记是**维持分区**的形态，不动。
- wsc 的 host 用 3 条 glob 承载全部测试，是因为它只有一个测试程序面；这不是要推广的模板，而是本包既有形态，本任务同样不改。

## 5. 与 AR8 的关系

| 面 | 本工件（9.3） | AR8-3 常驻门禁 |
|---|---|---|
| 性质 | 一次性**盘点快照**（存档，回答「此刻有没有漏登记」） | **常驻机器事实**（每次 `dsh:check` 重新判定） |
| 位置 | `openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md` | `scripts/check-architecture.mjs:794`（两段 tsconfig 名）、`:958-999`（命名 + 覆盖判定）、`:998`（逐包日志） |
| 覆盖宇宙 | test/ 全文件（与 AR8-3 一致） | test/ 全文件 |
| 计数日志 | 口径 A 与 B 都记（§3.2） | 只打印口径 A：`AR8: <包名> <*.test 数> 个测试文件全部覆盖` |
| 失败行为 | 盘点发现未覆盖 → 任务不勾选、升格待决 | 发现未覆盖 / 命名不合规 → 门禁红、`dsh:check` 失败 |
| 关系 | **D15 的「盘点」存档快照**；不替代门禁 | 机器事实的**唯一常驻把守**，本工件定期可弃 |

- 本工件**不是**新的门禁，也**不应**成为每次改动的必跑项：测试文件增删后，AR8-3 的覆盖判定会在 `pnpm dsh:check` 里自动给出红 / 绿；本工件只在 N2 结论变化或怀疑漏登时回看。
- 三包计数与 AR8 日志一致（口径 A：23 / 19 / 6），与 `code-design.md:578` 的 AR8 交付记录、`code-design.md:592` 的逐包计数命令期望一致。
- D15 明确 AR8 **不**把「tsconfig include 覆盖」升格为常驻断言之外的形态约束（待决 Q2 的成本与范围见 `code-design.md:735` 附近）；本工件因此只记录形态枚举，不提议改法。

## 6. 验证记录（对应 `tasks.md:65` 验证句）

| # | 验证命令 | 期望 | 实测 |
|---|---|---|---|
| 1 | `test -f openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md` | exit 0 | 见 §6.1 |
| 2 | `grep -c "23\|19\|7" openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md` | ≥ 3 | 见 §6.1 |
| 3 | `grep -n "未覆盖 0\|未覆盖：0\|未覆盖列表为空" …` | 非空 | 见 §6.1 |
| 4 | 独立枚举三包矩阵与固定结论逐项核对 | 全项一致 | §3.3（6 项逐项一致） |

### 6.1 实测输出（2026-11-07 16:32 CST 起，仓库根；下列为终态复跑）

```text
$ test -f openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md; echo $?
0

$ grep -c "23\|19\|7" openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md
36

$ grep -n "未覆盖 0\|未覆盖：0\|未覆盖列表为空" openspec/changes/residual-convergence/artifacts/n2-tsconfig-inventory.md | wc -l
16

# 代表性命中（证明第 3 条「非空」不是空转；行号取补录本节前的终态位置，正文段位置不变）：
10:- **固定结论（逐字照录）**：stt **23** / web-ux **19** / wsc **7**（含 stub）全部覆盖、**未覆盖 0**；…
11:- **独立复算复核**：… 两段 tsconfig 的 include 并集分别覆盖 **24 / 20 / 7**，**未覆盖列表为空**。
145:**host 覆盖 15 / client 覆盖 9 / 双覆盖 0 / 未覆盖 0；未覆盖列表为空。**

# 计数口径：grep 的模式串本身也写在本文件内（命令与引用行），故补录本节后计数高于补录前；
# 判定阈值（第 2 条 ≥ 3、第 3 条非空）在两个时点都成立。
```

**独立枚举（§1.4-a，把本工件内嵌脚本原样抽出执行，退出 0）**

```text
## stt (session-tool-toggle)  test/ 全文件 24 | *.test 23 | host 15 | client 9 | 未覆盖 0
## web-ux (web-ux)  test/ 全文件 20 | *.test 19 | host 7 | client 13 | 未覆盖 0
## wsc (workspace-config)  test/ 全文件 7 | *.test 6 | host 7 | client 0 | 未覆盖 0
```

**第二源交叉核验（§1.4-b）**

```text
session-tool-toggle/host 15
session-tool-toggle/client 9
web-ux/host 7
web-ux/client 13
workspace-config/host 7
workspace-config/client 0
# 与自持枚举逐文件集合比对：DISCREPANCIES 0（六组全部 same=true）
```

## 附录 A：六段 tsconfig 的 include 原文（盘点时点）

```jsonc
// plugins/session-tool-toggle/tsconfig.host.json（18 条）
["src/index.ts", "src/host", "src/contract.ts",
 "test/address.test.ts", "test/bundle.test.ts", "test/commands.test.ts", "test/control.test.ts",
 "test/defaults.test.ts", "test/mask.test.ts", "test/panel.test.ts", "test/record-store.test.ts",
 "test/rpc.test.ts", "test/session-layer.test.ts", "test/skills-plan.test.ts", "test/state.test.ts",
 "test/wire-contract.test.ts", "test/workspace-attribution.test.ts", "test/workspaces.test.ts"]

// plugins/session-tool-toggle/tsconfig.client.json（10 条）
["src/client", "src/contract.ts", "src/css-modules.d.ts",
 "test/**/*.test.tsx", "test/stubs/**/*.tsx",
 "test/client-index.test.ts", "test/defaults-view.test.ts", "test/locale-parity.test.ts",
 "test/panel-client.test.ts", "test/panel-controller.test.ts"]

// plugins/web-ux/tsconfig.host.json（13 条）
["src/config.ts", "src/contract.ts", "src/delete-session.ts", "src/index.ts",
 "src/migrated.ts", "src/project-key.ts",
 "test/bundle.test.ts", "test/config.test.ts", "test/contract.test.ts",
 "test/delete-session.test.ts", "test/index.test.ts", "test/migrated.test.ts", "test/project-key.test.ts"]

// plugins/web-ux/tsconfig.client.json（13 条）
["src/client", "src/contract.ts", "src/css-modules.d.ts", "src/project-key.ts",
 "test/**/*.test.tsx",
 "test/client-apply.test.ts", "test/delete-client.test.ts", "test/delete-store.test.ts",
 "test/locale-parity.test.ts", "test/notice-store.test.ts", "test/notice-visibility.test.ts",
 "test/session-manager-model.test.ts", "test/stubs/ui-primitives.tsx"]

// plugins/workspace-config/tsconfig.host.json（5 条）
["src/index.ts", "src/css-modules.d.ts",
 "test/**/*.test.ts", "test/**/*.test.tsx", "test/stubs/**/*.tsx"]

// plugins/workspace-config/tsconfig.client.json（2 条；只服务 types 产出，不承载测试）
["src/client", "src/css-modules.d.ts"]
```
