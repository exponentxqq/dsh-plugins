# 附加根一次性播种（本地扩展）

> 本地分支新增，非上游功能。上游行为以 `README.md` 为准；
> 本文件只描述本分支为"新会话自动带上常用仓库"所做的增量。
> 与"对所有主根生效"的通用附加根（`commonRoots`）的区别见
> [`common-additional-roots.md`](./common-additional-roots.md)。

## 目的

`/workspace-folders add` 与面板已经把附加根做得足够方便，但它们需要人工每台机器、每个
新的 `$DSH_HOME` 各做一次。播种把这件事变成配置：声明"哪个主根下默认有哪些根"，
首次使用时自动登记。

## 配置

registry 行（`cordis.patch.yml` 的 `multi-root-registry`）新增两个键：

| 键 | 含义 |
| --- | --- |
| `seedRoots` | 目录列表，首字符 `~` 按宿主 home 展开；空 = 关闭播种 |
| `seedPrimaryRoots` | 主根列表，任意写法（使用前 canonicalize）；空 = 关闭播种 |

两者都非空时才生效。

## 语义

- **没有候选被跳过的播种，才由台账保证一次性**：播种状态记在 store 级台账
  `$DSH_HOME/storages/multi_root_workspace.seeded.json`（= `leasePath` 去掉 `.lock`
  后缀再加 `.seeded.json`）。台账里有某主根 ⇒ 不再播种，因此
  **删除已播种的根是永久的**；想重新播种就删掉台账文件（或该主根对应的条目）。
  台账必须独立于登记表：删光最后一个根时上游会直接删掉整条记录，
  "已播种"和"曾播种但被有意清空"在登记表里无法区分。
- **手工注册过的主根不播种**：该主根在登记表里已有记录时整段跳过，避免重复注册。
- **只有全部候选都落定的播种才写台账**：任一条被跳过（目录不存在、与主根重叠等）
  则该次播种不写台账，下次启动重试——重复注册已有的根是幂等更新，不会产生重复记录。
  这样既不会"报告成功却什么都没做"，也不会让一次路径笔误永久失效。
  已被 `commonRoots` 授予的候选**不算跳过**（目录已可用，无需登记），整轮因此照样记台账。
- **走普通写入路径**：每条种子都调用 `MultiRootRegistry.add`，因此第 5/6/7 条根规则
  （与主根重叠、重复、互相嵌套）照常生效；不合规的种子只写一条 warn 日志并跳过，
  不会为了配置而放宽规则。
- **失败不阻断**：主根不存在、租约被其它 DSH 进程持有（`contended`）、存储打不开，
  都只告警；harness 照常启动。
- **不污染只读路径**：播种只发生在服务激活（`Service.init`）之后，绝不进入
  `refresh()`——`list`/面板共用的那条刷新路径承诺不写存储。

## 验证

```sh
pnpm typecheck && pnpm test        # tests/registry-seed.spec.ts 覆盖播种、跳过、一次性、关闭
# 启动后（主根尚无登记记录的 store）：
#   /workspace-folders list                      -> 应列出播种的根
#   $DSH_HOME/storages/multi_root_workspace.json -> 应出现对应记录
#   $DSH_HOME/storages/multi_root_workspace.seeded.json -> 应记录该主根
```

## 非目标

- 不改变根规则、作用域或内核方言；播种只是代替人工调用一次 `add`。
- 不提供 per-root 只读（上游已知限制）。
