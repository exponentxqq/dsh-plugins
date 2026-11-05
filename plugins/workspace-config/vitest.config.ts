import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * holder 的测试配置。
 *
 * 宿主半是 no-op，浏览器半的组件（入口按钮、弹窗壳、nav 投影）与真 renderer 的座位 PoC
 * 分别用各自的 `// @vitest-environment jsdom` 文件头按需开启 jsdom，而不是把默认环境改成
 * jsdom；纯投影逻辑（`sections.ts`）仍跑 node 环境。
 *
 * primitives 别名是**仅测试用**的接缝：真包是宿主自己的 bundle，发布产物里带裸
 * `.module.css` 导入与只有 web 壳能解析的宿主侧依赖，jsdom 套件加载不了那个 barrel，因此
 * 所有套件都加载替身（DOM 形状一致，见 `test/stubs/ui-primitives.tsx`）。组件 props 仍按
 * 真实包的 `.d.ts` 做类型检查——TypeScript 不知道这个别名。
 */
export default defineConfig({
  // 根 tsconfig.json 是 solution 文件（没有 compilerOptions），逐文件查 tsconfig 时推断
  // 不出 `jsx: "react-jsx"`，stub 与测试里的 JSX 会被编译成 React.createElement 并在渲染期
  // 抛 “React is not defined”。
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': resolve(import.meta.dirname, 'test/stubs/ui-primitives.tsx'),
    },
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
})
