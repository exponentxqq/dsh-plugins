# Agent 笔记（note）

本目录是后续 Coding Agent 长期沉淀项目知识的位置。

## 这里可以保存什么

- repository observations（仓库观察结论）；
- recurring implementation patterns（反复出现的实现模式）；
- compatibility notes（兼容性说明）；
- upstream integration notes（上游集成说明）；
- migration context（迁移背景）；
- Agent 容易反复重新发现的重要事实；
- 长期有效的代码考古结果。

核心判断标准：

> 只有后续 Agent 很可能需要重新发现，并且重新发现成本较高的知识，才值得放入本目录。

## 当前状态

- [dsh-compat-contract.md](./dsh-compat-contract.md) — DSH 兼容性契约：基线派生的支持范围（运行时副本 + 派生范围）、`multiRootCompat` 门禁对测试的影响、`confine` 同步/异步保形、`src/compat/` 适配层规则、升级回归流程与两处曾踩过的安静坑。

## 不应该存放什么

- 聊天记录备份；
- scratchpad；
- Chain of Thought；
- 临时 TODO；
- 每次任务的流水账。

## 语言要求

本目录下的文档一律使用简体中文（中文唯一）：只维护一份中文文档，不维护英文版本，也不创建成对的双语副本。

## 推荐命名

使用小写中划线命名，例如：

```text
<topic>.md
```
