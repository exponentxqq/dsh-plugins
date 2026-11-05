# 收敛留痕：会话工具面改会话作用域口径（scoped ∪ carried）

> spec-plan 阶段 1.5 产物（串行 grill-me 收敛）；本文件随落档复制入变更目录，落档副本为权威。

## 设计树

```
D1 掩码写路径口径（load-bearing）
 ├── D2 catalog 字段去留（依赖 D1）
 ├── D6 descriptions 读数形状（随 D1 浮出）
D3 stats 形状（独立）
D4 specs delta（独立）
D5 版本号（独立）
```

## 第一轮（4 问，全部按推荐落定）

| # | 问题 | 答复 | 仍待决 |
| --- | --- | --- | --- |
| Q1/D1 | 掩码写路径（session-layer catalog 端口与 planMask 候选）是否同步改会话读数？ | **同步改**：候选 = scoped ∪ carried，三读变两读。不改则被关的无效工具名字经 carried 回流面板清单，且 toggle 回执 matched 与掩码 deny 分叉；改后 deny 空 = 纯意图，工具在会话出现时由既有 `tools/change → refresh()` 幂等链补上 | 否 |
| Q2/D3 | stats 形状？ | **三计数**：删 catalog + shadowed，`{ visible, denied, … }`；面板统计行重排「本会话可见 N / 已关 M」 | 否 |
| Q3/D4 | specs delta 是否新增条款？ | **新增场景**：「Web 配置界面」需求下加「面板清单 SHALL 只含本会话有效工具（scoped ∪ carried）」 | 否 |
| Q4/D5 | 版本号？ | **维持 1.5.0**：与上一变更（7c38dbe，未发布未推送）同批发布 | 否 |

## 第二轮（2 问，D1 落定解锁 D2、浮出 D6；均按推荐落定）

| # | 问题 | 答复 | 仍待决 |
| --- | --- | --- | --- |
| Q5/D2 | catalog 字段（ControlDeps/PanelInputs/MaskInputs/PanelReading + session-layer 端口）删除还是保留改义？ | **全部删除**：两读宇宙下与 scoped 同源，冗余字段只会再造「catalog 何时 ≠ scoped」歧义源；类型层面强制「只有一个宇宙」 | 否 |
| Q6/D6 | descriptions 改按会话读数的实现形状？ | **经层读数**：层加 visibleSchemas 类读数面（name+description 轻量投影），rpc 的 descriptions 闭包改经 layerFor(sessionId) 取，层未就绪降级空 Map；根 ctx 一次填的装配时机问题自然消解 | 否 |

## 收敛确认

用户明确确认「已达成共识，继续」——前沿为空，进入阶段 1.7。

## 第三轮（落档分歧点，阶段 1.7 设计线上浮的 P1–P3，全部按推荐落定）

| # | 问题 | 答复 | 仍待决 |
| --- | --- | --- | --- |
| P1 | `stats` 两计数还是三计数？（D3「三计数」措辞与「删两项」算术矛盾，第三项未指名） | **两计数 `{ visible, denied }`**：与删除算术一致，面板两行「本会话可见 N / 已关 M」自洽 | 否 |
| P2 | 描述改经会话层读数后已关条目失去悬浮描述——接受还是层内缓存兜底？ | **接受无描述**：README 写明代价；层内描述缓存留作后续小变更 | 否 |
| P3 | 面板是否加「本清单只含本会话有效工具」说明行？ | **不加**：面板顶部已有「本会话可见 N」与关闭集；预期管理写进 README 与 proposal | 否 |

## 裁定依据与推论（事实裁定，非用户决策）

1. **D1 的必然性**（探索核验）：session-layer `plan()`（L1052-1073）与 `toggleSession`（L338/345）共用全局层 catalog；`refresh()` 由 `tools/change` 驱动幂等全量重算（L274/L453），restrict 自身也触发 tools/change（I2/I6 幂等设计）——「意图后效」兑现链在位，无需新增机制。
2. **两态文案随口径自然更新**（用户已裁决「两态区分取消」的推论）：`closedStateText` 工具分支 matched>0/＝0 两态保留，matched=0 的措辞「服务器上线后自动生效」更新为会话口径（「出现在本会话后自动生效」类），实现期落定，不再单列决策。
3. **同名不同义的 shadowed 保留清单**：`ClosedAddressReading.shadowed`（mcp 整组「指令段已遮蔽」）与 `SkillView.shadowed`（技能影子 stub 生效）不在删除范围。
4. **被推翻的旧裁决**：归档变更 `2026-11-02-session-tool-toggle` 的 **R15①**（catalog 端口全局层读数）、**R18①**（shadowed = catalog \ (scoped ∪ carried) 口径）、**R20①**（catalog/descriptions 保持全局层口径、v2 再改）——本变更即其预告的 v2，diff-matrix 须留痕推翻声明。
5. **specs 现状**：`dsh-session-tool-toggle/spec.md` 零「全局层/被其他作用域/shadowed/catalog」条款（grep 计数 0）——全局层口径纯是设计层裁决，D4 新增场景不与既有 SHALL 冲突。
