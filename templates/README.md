# `templates/` —— `pnpm gen:plugin` 的模板素材（**不是 pnpm 包**）

本目录是顶层模板素材根：每个子目录一个插件骨架模板，供 `pnpm gen:plugin` 渲染出
`plugins/<name>/`。当前只有一个模板 `default/`（缺省模板），其件套表见
[`templates/default/README.md`](default/README.md)。

```text
templates/
  README.md        # 本文件：多模板通用约定
  default/         # 缺省模板（--template 的缺省取值）
    template.json  # 件套清单（11 条目，顺序即生成顺序）
    README.md      # 本模板的件套表
    ...            # 其余件套素材见该件套表
```

## 目录定位

- `templates/` 是**模板素材目录，不是 workspace 包**：模板里的插件清单素材故意叫
  `package.json.tmpl` 而不是 `package.json`，`pnpm install` / `pnpm -r` 永远不会把它当成包；
  `*.tmpl` 只是素材后缀，不参与本仓的构建、lint 与类型检查。
- `pnpm-workspace.yaml` 的 `packages` 逐条显式列 tooling 四包、不列 `templates`：
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
```

- `--template <name>` 与 `--template=<name>` 两种写法等价；缺省 `default`。
- 生成器只读被选中的模板目录、只写 `plugins/<name>/`，不跑 git / pnpm；`--dry-run` 只打印将创建的文件与内容摘要，不写盘。
- 未知模板 → exit 1（错误含可用模板列表）；`--template` 缺值 → exit 2（用法错误）。
- 退出码：`0` 成功；`1` 校验失败（名字非法 / 目录已存在 / 未知 kind / 未知模板 / 模板清单非法 / 素材缺失）；
  `2` 用法错误（缺必需参数、未知 flag、`--template` 缺值）。

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
插件 README；插件 README 由件套里的 `plugin-README.md.tmpl`（显式占位）渲染生成。两者职责不同：
一个是模板约定与件套表，一个是「插件长什么样」。
