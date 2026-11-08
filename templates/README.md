# `templates/` —— `pnpm gen:plugin` 的模板素材（**不是 pnpm 包**）

本目录是顶层模板素材根：每个子目录一个插件骨架模板，供 `pnpm gen:plugin` 渲染出
`plugins/<name>/`。当前只有一个模板 `default/`（缺省模板），其件套表见
[`templates/default/README.md`](default/README.md)。

```text
templates/
  README.md        # 本文件：多模板通用约定
  default/         # 缺省模板（--template 的缺省取值）
    template.json  # 件套清单（12 条目，顺序即生成顺序）
    README.md      # 本模板的件套表
    ...            # 其余件套素材见该件套表
```

## 目录定位

- `templates/` 是**模板素材目录，不是 workspace 包**：模板里的插件清单素材故意叫
  `package.json.tmpl` 而不是 `package.json`，`pnpm install` / `pnpm -r` 永远不会把它当成包；
  `*.tmpl` 只是素材后缀，不参与本仓的构建、lint 与类型检查。
- `pnpm-workspace.yaml` 的 `packages` 逐条显式列 tooling 五包、不列 `templates`：
  AR7（`scripts/check-architecture.mjs`）禁止 `templates` / `templates/*` 出现在 `packages` 里，
  通配 `tooling/*` 同样被拒——「谁是包」因此可断言，也避免 `pnpm -r` 递归进模板目录。
- 模板素材的唯一消费者是 `scripts/gen-plugin.mjs`；本目录不跑 git / pnpm，生成器只写文件。

## 命名

- **一模板一目录**：目录名即 `--template` 的取值，必须是 kebab-case
  （`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`，小写字母开头，仅字母 / 数字 / 中划线），不得含路径段。
- `templates/<name>/template.json` 的 `name` 字段必须与目录名**逐字相等**；不等即校验失败（exit 1）。
- 现有模板：`default`（缺省，`--template` 不写时即选它）。

## `template.json` schema

位置 `templates/<name>/template.json`，消费者仅 `scripts/gen-plugin.mjs`。顶层三键：

| 键 | 必填 | 含义 |
| --- | --- | --- |
| `name` | 是 | 模板名，必须等于目录名 |
| `description` | 否 | 人读说明（仅文档用，生成器不消费） |
| `files` | 是 | 条目数组，**非空**，顺序即生成顺序 |

`files[]` 条目四键：

| 键 | 必填 | 取值 | 含义 |
| --- | --- | --- | --- |
| `template` | 是 | 相对模板目录的 POSIX 路径 | 素材文件；禁绝对路径、`..` 段与反斜杠，且必须真实存在 |
| `output` | 是 | 相对插件目录的 POSIX 路径 | 生成物路径；同上约束，且清单内不得重复 |
| `format` | 否 | `manifest` \| `solution` | 结构化后处理；缺省 = 占位符渲染后原样写出 |
| `only` | 否 | `host-only` \| `dual` | 只在该 kind 生成；缺省 = 两个 kind 都生成 |

- 顶层键只能是 `{name, description, files}`，条目键只能是 `{template, output, format, only}`：
  出现任何未知键即失败（fail-closed，点名单个未知键）。
- `format` 语义：`manifest` 先渲染再解析——`dual` 形态补 `exports["./client"]` / `dsh.client` /
  `test-kit` devDep 与双 `tsc -p` 的 `typecheck`，最后按 2 空格缩进写回；`solution` 在 `dual`
  形态把 `tsconfig.client.json` 加进 `references`；其余文件按占位符渲染后原样写出。
- `loadTemplate()` fail-closed：未知模板、清单不可解析 / 非对象、键非法、`files` 为空、
  路径非法或重复、素材文件缺失，任一不满足即 exit 1，错误信息含 `templates/<name>/` 与可用模板列表。

## `--template` 契约

```bash
pnpm gen:plugin <name> --kind host-only|dual [--template <name>] [--dry-run]
pnpm gen:plugin --check [--template <name>]
```

- `--template <name>` 与 `--template=<name>` 两种写法等价；缺省 `default`。
- 生成器只读被选中的模板目录、只写 `plugins/<name>/`，不跑 git / pnpm；`--dry-run` 只打印将创建的文件与内容摘要，不写盘。
- 未知模板 → exit 1（错误含可用模板列表）；`--template` 缺值 → exit 2（用法错误）。
- 退出码：`0` 成功；`1` 校验失败（名字非法 / 目录已存在 / 未知 kind / 未知模板 / 模板清单非法 / 素材缺失）；
  `2` 用法错误（缺必需参数、未知 flag、`--template` 缺值、`--check` 与 `--dry-run` 同给）。
- `--check` 是不写盘的只读对账模式（不生成插件），契约见下节。

## manifest 形态对账（`gen-plugin --check`）

生成器除「生成骨架」外还有一个只读模式：不写盘，逐个核对全部**软插件**的
`plugins/<name>/package.json` 与模板渲染出的期望 manifest 形态是否一致。期望值**复用生成路径**
（`buildTokens` → `buildFiles` → `finalizeManifest`）现渲染，不另写一份比对逻辑——模板改了，
对账口径自动跟着改，模板与真实包因此不会双源漂移。它按需运行：不进 `pnpm dsh:check`
（新增包是低频事件，本地门禁不加重，D10）。

```bash
pnpm gen:plugin --check              # 全部一致 → exit 0
pnpm gen:plugin --check --dry-run    # 互斥（都是只读模式）→ exit 2
pnpm gen:plugin --check <name>       # 不接受 <name>（同理不接受 --kind）→ exit 2
```

- **软插件判定与 AR3 同源**：`plugins/*` 下没有精确契约文件 `src/compat/dsh-version.ts` 的包
  （multi-root 是唯一硬插件，不参与对账）。
- **形态由包事实决定**：`dsh.client?.platform === 'web'` ⇒ `dual`，否则 `host-only`；包名去掉
  `dsh-plugin-` 前缀即模板渲染名，不是 `dsh-plugin-<kebab-case>` 形态的直接失败。
- **只比较规范键集合，其余键不比较**：`version` / `description` / `devDependencies` / `scripts` /
  `dsh.client.inject` / 额外 peer 等逐包天然不同的键不参与比较。比较面为 `type`、`main`、
  `license`、`exports["."]`、`exports["./package.json"]`、`exports["./client"]`（dual）、
  `exports["./client"].types`（dtsOwned）、`dsh.bundle.patch`、`dsh.engines.dsh`、
  `dsh.client.platform`（dual）、`peerDependencies["@deepseek-ai/dsh"]`、`files`。
- **期望值全部来自模板渲染产物**（`dsh.engines.dsh` 与 DSH peer 因此仍从
  `scripts/dsh-baseline.mjs` 现取现派生）；`exports` 按子路径**并集**逐条比较（键序无关），
  **多出的子路径同样失败**——这正是已删的 `"./src/*"` 不会被加回来的原因。
- `files` 按**集合**比较（数组字面量集合相等），不断言 glob 命中的实体文件存在。

### 不可推导键与三条 conditional（N11）

模板无法代劳、只能按包事实条件断言的手工项：

| 条件 | 断言 |
| --- | --- |
| `icon` 字段存在 | 它指向的文件在包内真实存在，且 `files` 含 `icon.svg` |
| `dtsOwned`（有 `exports[*].types`，与 build-kit / AR3 同一推导） | `files` 含 `lib/**/*.d.ts`，且 `exports["./client"].types` = `./lib/types/client/index.d.ts`；非 dtsOwned 包不声明该 glob（模板里对它们是无害空集） |
| `dual`（`dsh.client.platform === 'web'`） | `exports["./client"]` 存在；非 dual 却声明 `dsh.client` 同样失败 |

- `icon` 是**条件事实**而不是白名单例外（见 D10 反例）：写成白名单会退化成「某些包允许没有
  icon」，而实际规则是「有 icon 就必须可被 DSH 读到」——DSH 元数据读取要求 manifest 的 `icon`
  指向包内真实文件，缺了会抛错，不只是丢图标。

### 输出与退出码

- **无白名单、fail-closed**：任何差异逐条报到 stderr，格式 `<包名>: <键路径> 期望 X，实际 Y`，
  任一条即 exit 1；全过打印 `[gen-plugin] <N> 个软插件的 manifest 与模板形态一致` 并 exit 0。
- 退出码：`0` 一致；`1` 发现差异（或模板缺 `package.json` 的 manifest 条目、包名无法渲染、
  模板素材缺失）；`2` 用法错误（`--check` 带 `<name>` / `--kind`，或与 `--dry-run` 同给）。

## 新增模板步骤

1. **建目录**：`mkdir templates/<name>`（kebab-case，勿与现有模板重名；`<name>` 即将来的 `--template` 值）。
2. **放件套**：把素材逐个放进去；清单类素材用 `.tmpl` 后缀（如 `package.json.tmpl`），
   模板目录自身的 README 也不复用为插件 README（见末节）。
3. **写清单**：新建 `templates/<name>/template.json`，`name` 填目录名，`files[]` 按上节 schema
   逐条列出（`template` / `output` / `format?` / `only?`）——**清单是唯一来源，生成器不扫描目录**。
4. **验清单与 dry-run**：

   ```bash
   node -e "JSON.parse(require('fs').readFileSync('templates/<name>/template.json'))"
   pnpm gen:plugin demo-<name> --kind host-only --template <name> --dry-run
   ```

5. **全链演练**（`host-only` 与 `dual` 各一次）：生成 → `pnpm install` → `pnpm lint` / `typecheck` /
   `build` / `test` → `pnpm dsh:check` → 删掉演练插件目录（与仓库的生成器冒烟同一口径）。
6. **负例自检**：临时移走 `template.json` 或某个素材 → 生成器 exit 1 且错误点名缺失路径；
   恢复后再提交。

## 版本字面量禁令

- 模板内**不得出现 DSH 族 / 工具链的版本字面量**：不写精确 pin、不写版本断言（也不把版本号
  写进注释 / 文案里的断言句）。依赖一律引用 `catalog:`（工具链）或 `catalog:dsh`（DSH 族）。
- 版本事实由仓库单点派生，模板里现取现算：`version` 取仓库根 `package.json#version`，
  `engines.node` 取根 `engines.node`，`dsh.engines.dsh` 与 DSH peer 由
  `scripts/dsh-baseline.mjs` 的 `softDshRange()` 派生；工具链版本只活在根 `pnpm-workspace.yaml`
  的 catalog 里。
- 这条禁令由门禁守着：`openspec/changes/optimize-architecture/tasks.md` 9.1 的 grep 验证句
  （模板目录不得出现 DSH 版本字面量）在回归时逐条比对。

## 与 `plugin-README.md.tmpl` 的分工

模板目录自己的 README（本文件与 `templates/default/README.md`）说明「模板怎么用」，**不复用**为
插件 README；插件 README 由件套里的 `plugin-README.md.tmpl`（骨架全集：4 必备节 + 端性声明 + 如适用注释与 `{{DUAL_SECTION}}` 占位）渲染生成。两者职责不同：
一个是模板约定与件套表，一个是「插件长什么样」。
