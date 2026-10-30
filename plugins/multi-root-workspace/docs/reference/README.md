# 技术参考（Reference）

English: [README.en.md](./README.en.md)

## 这里存放什么

稳定的参考资料，例如：

- configuration reference；
- API reference；
- schemas；
- protocols；
- file formats。

## 不应该存放什么

- Proposal 或 Target Design；
- brainstorming 与临时讨论；
- 开发计划；
- 尚未确定的设想。

这里只放已经确定、相对稳定的事实性参考内容。

## 当前状态

- [additional-root-seeding.md](./additional-root-seeding.md) — 本分支新增的附加根一次性播种：配置键、台账语义与验证方式（上游无此功能）。
- [common-additional-roots.md](./common-additional-roots.md) — 本分支新增的通用附加根：对所有主根生效的 `commonRoots` 配置、授予/去重/失败语义，以及与播种的分工（上游无此功能）。
- [multi-root-workspace-research.md](./multi-root-workspace-research.md) — 上游官方仓库 Workspace / Sandbox / 插件体系现状调研快照（master `c291e7961a`；§8 为"不改上游"机制的补充调研）。

## 推荐命名

使用小写中划线命名，例如：

```text
<topic>.md
```
