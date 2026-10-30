# 通用附加根（本地扩展）

> 本地分支新增，非上游功能。上游行为以 `README.md` 为准；
> 本文件只描述本分支为"每个项目都需要的机器级目录"所做的增量。
> 与一次性播种的区别见 [`additional-root-seeding.md`](./additional-root-seeding.md)。

## 目的

有些目录**几乎每个项目都需要**，例如 codebase-memory 的数据目录
`~/.cache`（`~` 按当前环境的 home 展开，容器内外各自解析）——它必须可写，否则会话内
`git commit` 触发的 post-commit hook 无法更新索引。播种（`seedRoots`）能做到，
但要**逐个主根**声明：每开一个新项目都要往 `seedPrimaryRoots` 里再加一条。

`commonRoots` 把这件事变成一条与主根无关的配置：列在里面的目录，
**任何工作区都自动获得**，不需要登记、不需要台账、不需要为新项目改配置。

## 配置

registry 行（`cordis.patch.yml` 的 `multi-root-registry`）新增一个键：

| 键 | 含义 |
| --- | --- |
| `commonRoots` | 目录列表，首字符 `~` 按宿主 home 展开（容器内即容器的 home，宿主上即宿主的 home）；空 = 关闭 |

```yaml
- id: multi-root-registry
  config:
    leasePath: !!js dshHomePath('storages/multi_root_workspace.lock')
    commonRoots:
      - ~/.cache
```

改动需要重启 dsh（loader patch 在启动时读取）；与所有插件配置一致。

## 语义

- **配置即授予**：目录不写入登记表、不写台账。从配置里删掉即撤销，
  面板/命令无法移除（见下）；因此它与 `seedRoots` 的"一次性、删除即永久"语义相反。
- **对所有主根生效，无需登记**：登记表里没有该主根的记录也照样授予——这正是
  "新项目零配置"的含义。授予合并点在作用域层：`scopeOf()` 返回
  **已登记根在前、通用根在后**，因此已有登记项的显示编号（ordinal）永不移动。
- **同一目录只授予一次**：某目录既在登记表里、又在 `commonRoots` 里时，
  登记项占据位置，通用条目不再重复（作用域与本插件列表都按同样顺序去重）。
- **与登记项同等校验**：通用根走同一个 sanitizer——目录不存在则暂不授予、
  被 symlink 替换（路径解析到别处）则暂不授予、等于当前会话主根则对**该主根**不授予
  （对其它主根照常）。授予语义与登记根完全一致，内核方言不做任何降级。
- **目录不存在也保留**：只告警一次，条目保留；目录一旦出现，**下一次解析即授予**
  （无需重启、无需 `recheck`）——比播种"下次启动重试"更即时。
- **多进程 fail-closed**：另一个 DSH 进程持有租约时，本进程不授予任何附加根，
  通用根同样不授予；`refresh()` 接管租约后自动恢复授予。
- **不能改**：面板对通用行只提供复制/显示/浏览，改名、移除、上下移动均置灰；
  命令行 `remove`/`alias`/`move` 指向通用条目时报 `common-root` 错误码，
  提示去改配置。用 `add` 登记一个已由配置授予的目录报 `duplicate`（文案指向配置）。
- **列表标记**：`/workspace-folders list` 与面板都以 `[common]` / "通用" 标记来源，
  报告末尾单独计数并说明改动位置。
- **嵌套不做拦截**：通用根落在某主根之下（或包含登记根）时照常授予——
  它不扩大可写范围（并集），只是冗余；本分支不为它增加规则。

## 与播种的关系

| 维度 | `seedRoots` + `seedPrimaryRoots` | `commonRoots` |
| --- | --- | --- |
| 生效范围 | 逐个主根声明 | 所有主根 |
| 是否写登记表 | 是（走普通 `add` 路径） | 否 |
| 一次性 | 是（台账保证，删除即永久） | 否（配置即真理） |
| 适用 | 项目专属的跨仓联动根 | 机器级/全局目录 |
| 与对方重叠 | 已被配置授予的候选**跳过且计入"已满足"**：不写记录、不产生重复；整轮无跳过时照样记台账 | 登记项优先，通用条目不重复显示 |

两者可以并用：例如 opc 用 `seedRoots` 播种 `docker`/`dotfiles`/`apigen`/`skills`
等项目专属根，同时把 `~/.cache` 放进 `commonRoots` 供所有项目使用。

## 从播种迁移一条根

1. 把该目录从 `seedRoots` 移到 `commonRoots`（`seedPrimaryRoots` 保持不变）。
2. 重启 dsh。
3. 若某主根的登记表里还留着之前播种出来的同一条记录（`~/.cache` 就是这种情况），
   它与通用条目重复：面板上会隐藏重复的通用行，授予也只有一次。想让来源单一，
   用面板或 `/workspace-folders remove <n>` 删掉那条登记记录即可，之后只剩通用条目。
   台账不需要动：该主根已记为"已播种"，不会重新播种。

## 验证

```sh
pnpm typecheck && pnpm test      # tests/registry-common.spec.ts 覆盖授予、去重、缺目录恢复、
                                 # symlink 拦截、变更拒绝、contended 与接管、拆卸撤销
```

重启 dsh 后，在**未配置过任何附加根的主根**（新项目目录）开会话：

```sh
# 1. 会话上下文出现该目录
#    Current DSH workspace roots: ["/home/docker/.cache"] are additional roots ...
# 2. 面板/命令行能看到并标记来源
#    /workspace-folders list
#      1 /home/docker/.cache [common]
#      Writable additional roots: 1 of 1.
#      1 of them are common roots: ...
# 3. 登记表未被写入
#    $DSH_HOME/storages/multi_root_workspace.json 不应出现该目录的通用记录
# 4. 会话内 git commit，hook 可写 ~/.cache（cbm-hook-pending / cbm-hook.log 更新）
```

## 注意

- 通用根与登记根在**所有消费面**上同权：agent 指令注入（其顶层 `AGENTS.md` / `CLAUDE.md`）、
  面板文件树、LSP 工作区与 `workspace-routing` 一视同仁。因此不要把"包含 AGENTS.md 的大目录"
  随手设为通用根——那会让它的指令对所有会话生效；`~/.cache` 这类数据目录没有指令文件，无此影响。
- 通用根同样出现在会话的运行期上下文（"Current DSH workspace roots ..."）里，模型会知道它可写。

## 非目标

- 不提供"某些主根不要通用根"的排除机制（第一版无条件；将来按需加可选键）。
- 不支持给通用根配置别名（路径本身即标识；配置里改名无意义）。
- 不改变根规则、作用域或内核方言，也不提供 per-root 只读（上游已知限制）。
