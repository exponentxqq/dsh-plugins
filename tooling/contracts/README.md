# `@dsh-plugins/contracts`

`workspace-config.section` 座位契约的**类型权威**：只定义类型，不产出运行时代码。包位于 `tooling/contracts/`，与 [build-kit](../build-kit/README.md) / [host-kit](../host-kit/README.md) / [test-kit](../test-kit/README.md) 同为 `tooling/` 四包，由 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) 显式列入 workspace。

## 定位

座位是 DSH Web GUI「工作区配置」统一弹窗里的一个分节挂载点。本包集中定义该座位的**座位名、owner 份额、`SlotMap` 条目形状与 order 权威值**，是 holder（`dsh-plugin-workspace-config`）与三个贡献方共同的唯一类型出处。

| 导出 | 形状 | 权威内容 |
| --- | --- | --- |
| `WorkspaceConfigSectionSeat` | 字面量类型 | 座位名 `'workspace-config.section'` |
| `WorkspaceConfigSectionOwnerProps` | interface | owner 份额 `{ close(): void }`（弹窗开合归 holder） |
| `WorkspaceConfigSectionSlot` | interface | `kind: 'list'`、`scope: 'root'`、`owner` 份额 |
| `WorkspaceConfigTriggerOrder` | 字面量类型 | footer 统一入口 order `50` |
| `WorkspaceConfigDialogOrder` | 字面量类型 | 统一弹窗 `shell.overlay` order `530` |
| `WorkspaceConfigSectionOrder` | 联合字面量类型 | 三贡献方分节 order `10 \| 20 \| 30` |

本包是**纯类型包**：`private: true`、`version: 0.0.0`、无 `files`、无 `lib/`、不进发布版本同步；[`package.json`](./package.json) 的 `exports` 把 `types` 与 `default` 都指向 [`src/index.ts`](./src/index.ts)，由消费方编译器直接读取 TS 源。它不提供运行时常量，也不自己做 `declare module` 增补（增补留在消费方，原因见下节）。

## 消费方式：只允许 `import type`

三个贡献方与 holder 的消费形态一致，下面摘自 [`session-tool-toggle/src/client/seats.ts`](../../plugins/session-tool-toggle/src/client/seats.ts) 的真实用法：

```ts
import type {
  WorkspaceConfigSectionSeat,
  WorkspaceConfigSectionSlot,
} from '@dsh-plugins/contracts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}

export const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'
export const SECTION_ORDER = 20
```

- **只允许 `import type`**：根基准 [`tsconfig.plugin.base.json`](../../tsconfig.plugin.base.json) 开了 `verbatimModuleSyntax`，类型 import 在编译期整段擦除，不产生运行时 import。
- **`declare module` 留在消费方**：模块增补要求目标模块可从声明文件所在包解析（否则 TS2664），而本包按 `tooling/` 包治理（AR2）不允许任何 `@deepseek-ai/*` 依赖，无法自己解析 `@deepseek-ai/dsh-client-ui-slots`；条目形状仍引用本包的 `WorkspaceConfigSectionSlot`，形状权威不变。
- **依赖面只到 `devDependencies`**：消费方以 `workspace:*` 写入 devDependencies，MUST NOT 进 `dependencies`，也 MUST NOT 进 `dsh.client.inject`——类型依赖不是加载依赖。
- **字面量与值各持一份**：座位名的运行期值留在各包本地，用本包的 `WorkspaceConfigSectionSeat` 字面量类型断言（写错即 typecheck 失败）；order 权威值以字面量类型给出，消费方的本地常量按同一取值约定。因此没有任何包需要从本包做值 import。

## 与 workspace-config / 三贡献方的关系

holder [`dsh-plugin-workspace-config`](../../plugins/workspace-config/README.md) 在注册 `shell.overlay` 时用 `children` 声明 `workspace-config.section`（Declaring is claiming），渲染时以 `renderSlot('workspace-config.section', { close }, { only: activeId })` 只渲染当前选中分节。三个贡献方在各自 client 程序里用 `ctx.slots.inject` 软注册分节；holder 侧不保留分节业务逻辑，也不维护贡献方清单。

| 包 | 角色 | 分节 / 入口 | order |
| --- | --- | --- | --- |
| `dsh-plugin-workspace-config` | holder | footer 统一入口 / 统一弹窗 | 50 / 530 |
| [`multi-root-workspace`](../../plugins/multi-root-workspace/README.md) | 贡献方 | 工作区文件夹 | 10 |
| [`session-tool-toggle`](../../plugins/session-tool-toggle/README.md) | 贡献方 | 工作区默认档 | 20 |
| [`web-ux`](../../plugins/web-ux/README.md) | 贡献方 | 会话管理 | 30 |

这就是分节贡献机制的**类型契约面**：holder 拥有座位与弹窗，贡献方只按本包声明的形状与 order 契约接入；holder 的 `src/client/contract.ts` 退化为文档指针与过渡 re-export，贡献方直连本包，不再经过 holder 的类型面。四个包的 `dsh.client.inject` 都不含 `@dsh-plugins/contracts`，也不含其他贡献方；缺 holder 时分节不出现且不报错，缺某贡献方时弹窗少一节并保留空态。四包同装是推荐形态，但类型契约不制造任何强制加载顺序。

## 为何零运行时

零运行时不是省略构建步骤，而是把「类型权威」与「运行时」解耦：

- **包面为零**：[`package.json`](./package.json) 的 `dependencies` 为空对象，只有 `oxlint` / `typescript` 两个工具链 devDependencies；`scripts` 仅 `lint` / `typecheck`，没有 `build`，也不产出 `lib/`。
- **入口即源码**：`exports` 的 `types` 与 `default` 同时指向 [`src/index.ts`](./src/index.ts)；消费方 tsc 按 `moduleResolution: "bundler"` 直接读 TS 源，esbuild 打包时把 `import type` 擦除，不把它当模块解析。
- **值留在消费方**：座位字符串与各 order 常量由 holder / 贡献方各自持有；座位名用 `WorkspaceConfigSectionSeat` 钉住，order 用字面量类型给出权威取值。没有值 import，也就没有运行时解析面。
- **产物无痕**：四包当前 `lib/*.js` 均不含 `@dsh-plugins/contracts` 字符串；贡献方的 bundle 断言还把 holder 包名列为缺席标记，守住「类型依赖不回流成运行时依赖」。
- **反向约束**：若本包自己持有运行时常量或依赖 UI 包，就会把 holder / React / CSS 拖进贡献方 bundle 并制造加载顺序，正是权威转移要消除的旧形态。

`tooling/` 四包的落地边界与这次权威转移的完整论证见 [shared-build-and-source-kits 决策记录](../../docs/decisions/ADR-0001-shared-build-and-source-kits.md)。
