# `@dsh-plugins/test-kit`

三个双端插件（`session-tool-toggle` / `web-ux` / `workspace-config`）共用的**测试夹具
底座**。它只收敛三份逐字重复的测试资产，不承载任何包的行为语义。

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
- **不装 vitest**：`locale-parity` 只返回问题清单，断言留在调用方。

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

## 自测

```bash
pnpm --filter @dsh-plugins/test-kit lint
pnpm --filter @dsh-plugins/test-kit typecheck
```

行为等价由三个双端包的既有用例守护（stub 改薄后 `pnpm -r test` 零改动通过）。
