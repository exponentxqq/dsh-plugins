# `@dsh-plugins/test-kit`

三个双端插件（`session-tool-toggle` / `web-ux` / `workspace-config`）共用的**测试夹具与
接线底座**。它只收敛逐字重复的测试资产与测试接线原语，不承载任何包的行为语义。

> **纪律：只放无分支的夹具底座；任何包的行为断言不许上移。**
>
> 底座里的每个导出都必须是「所有包语义一致」的：组件替身是 DOM 形状的并集、文案检查
> 是纯函数。凡是依赖某个包的契约字面量、某个包的产物形态或「这个开关放在哪一行」的
> 断言，一律留在该包自己的测试里。

- 私有包（`private: true`，`version: 0.0.0`），不发布、无 `files`；
- 只有 `lint` / `typecheck` 两条脚本（AR2 脚本白名单）；它不构建自己，`pnpm -r build`
  自动跳过；
- 运行时依赖只有 `react` / `react-dom`（stub 运行时要用，走 catalog）；不引入任何
  `@deepseek-ai/*` 依赖（AR2 前瞻）；
- **不 import vitest**：`locale-parity` 只返回问题清单、`./vitest` 只返回裸配置对象；断言与
  `defineConfig` 调用都留在调用方（测试运行时由消费包自带）。

## `ui-primitives`

`@deepseek-ai/dsh-client-ui-primitives` 的测试替身**并集底座**：`Button` / `Input` /
`Switch` / `Modal` / `Checkbox` / `SegmentedTabs` / `Menu` / `MenuItemButton` 与 17 个
`data-icon` 图标占位。真包是宿主自己的 bundle（裸 `.module.css` 导入 + 只有 web 壳能
解析的宿主侧依赖），jsdom 套件加载不了那个 barrel，因此各包 `vitest.config.ts` 的
`resolve.alias` 指向**本包自己的** `test/stubs/ui-primitives.tsx`。

改薄的 stub 只有一行：

```tsx
export * from '@dsh-plugins/test-kit/ui-primitives'
```

包独有的组件或行为差异在**该包 stub 里本地覆盖**（re-export + 具名覆盖），例如：

```tsx
export * from '@dsh-plugins/test-kit/ui-primitives'
export { Modal } from './my-modal.tsx' // 本包独有的形状，且只有它能解释为什么不同
```

不允许的是把 `if (packageName === …)` 这类分支写进底座：那说明差异不是「夹具」而是
「行为」，它属于调用点。测试文件与 alias 配置在收敛前后**零改动**——这是 stub 并集
实现行为等价的直接证据。

## `locale-parity`

`localeParityIssues({ ns, zh, en, required, expectedNs }) => string[]`：zh / en 字典的
键集合双向相等、空文案、必读键与 `{param}` 占位符一致性。空数组 = 一致。

每条 issue 以稳定的类别前缀开头（`[namespace]` / `[keys]` / `[empty]` / `[required]` /
`[placeholders]`），调用方既可以整体断言 `toEqual([])`，也可以按类别聚焦断言——各包因此
能保留原有的 `it` 粒度（键集合 / 空文案 / 必读键 / 占位符各自的用例），把「用例数只许
相等或增加」的纪律与「检查逻辑只有一份」同时守住。

```ts
import { localeParityIssues } from '@dsh-plugins/test-kit/locale-parity'

it('zh 与 en 的键集合、空文案、必读键与占位符一致', () => {
  expect(localeParityIssues({ ns: NS, zh, en, required: REQUIRED_KEYS, expectedNs: 'webUx' }))
    .toEqual([])
})
```

`required` 的字面量数组与 `expect(NS).toBe('<字面量>')` 都留在本包：前者是「界面会读
哪些键」的包内事实，后者是命名空间的单点事实。函数本身不 import vitest，也不读文件
——stt 的「源文件重复键」检查依赖 `locales.ts` 源文本，属于包内夹具，不上移。

## `./vitest`

双端包测试配置的**无分支接线原语**：`defineWebTestConfig({ root })` 返回裸配置对象，把
`esbuild` / `resolve.alias` / `include` / `environment` 四段原本逐包复制的接线收成一份。
消费方只需逐字四行：

```ts
import { defineWebTestConfig } from '@dsh-plugins/test-kit/vitest'

export default defineWebTestConfig({ root: import.meta.dirname })
```

`root` 是调用方包目录（传 `import.meta.dirname`）；空串或非字符串立即抛 `TypeError`
（fail fast）。不给默认值回落：静默兜底会把「配置写错」变成「套件跑在别的目录」，后者只是
更晚、更难读的红。

**职责边界**：这是本包章程的扩面——从「夹具底座」扩到「夹具 + 测试接线原语」。收进来的
只有所有包语义一致、无分支的接线（工厂 + `WEB_TEST_INCLUDE` 常量）；任何包的行为断言、
路径字面量、覆盖需求仍留在包内。这次扩面的正式决策记录在仓级
[ADR-0001](../../docs/decisions/ADR-0001-shared-build-and-source-kits.md)，本 README 只写用法
与约束，不复述决策过程。

**无分支纪律**：工厂不提供 `environment` / `include` / `alias` 覆盖旋钮。一旦允许逐包覆盖，
「四份配置收敛成一份」立刻退回「每包一份配置 + 一个工厂」。需要不同行为时，差异要么属于
调用点，要么该新增一个原语，不属于参数表。写死的两个既定值：

| 键 | 值 | 含义 |
|---|---|---|
| `test.environment` | `'node'` | 默认 node 环境；浏览器半的组件套件用文件头 `// @vitest-environment jsdom` 按需开启 jsdom，而不是把默认环境改成 jsdom（纯逻辑套件不为渲染买单） |
| `esbuild.jsx` | `'automatic'` | 根 `tsconfig.json` 是 solution 文件（没有 `compilerOptions`），逐文件查 tsconfig 推断不出 `jsx: "react-jsx"`，stub 与测试里的 JSX 会编译成 `React.createElement` 并在渲染期抛 `React is not defined` |

**不 import `vitest`**：本模块只返回对象，不调用 `defineConfig`、不 import `vitest`、也不
import 本仓 `scripts/`。这样门禁 AR8 才能逐字断言消费方配置的唯一 import 源是
`@dsh-plugins/test-kit/vitest`，并把工厂产物当纯对象做机械核对——不需要先跑一次 vitest 才
知道配置长什么样；同时测试运行时不会成为工具包的运行期依赖。

**alias 接缝**：`@deepseek-ai/dsh-client-ui-primitives` 固定指向
`join(root, 'test', 'stubs', 'ui-primitives.tsx')`。真 barrel 带裸 `.module.css` 导入与只有
web 壳能解析的宿主侧依赖，jsdom 套件加载不了，因此组件渲染一律走调用方的 stub（DOM 形状
见上文 `ui-primitives`）；组件 props 仍按真实包的类型检查——TypeScript 不知道这个 alias。
每个消费包仍保有自己的 `test/stubs/ui-primitives.tsx` 一行 re-export，工厂只负责把 alias
指过去。

`WEB_TEST_INCLUDE` 是 include 的唯一真相：`['test/**/*.test.ts', 'test/**/*.test.tsx']`。
组件套件以 `.test.tsx` 结尾，漏掉它就是「套件静默消失」；AR8 从本模块的数组字面量反向核对
消费方，不要在这份常量之外再写 include。

## 自测

```bash
pnpm --filter @dsh-plugins/test-kit lint
pnpm --filter @dsh-plugins/test-kit typecheck
```

行为等价由三个双端包的既有用例守护（stub 改薄后 `pnpm -r test` 零改动通过）。
