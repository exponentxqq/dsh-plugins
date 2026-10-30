import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * 宿主半逻辑（地址文法、状态折叠、掩码推导、层生命周期、持久化、命令面、RPC 内核）
 * 跑在 node 环境；浏览器半的组件套件用各自文件头的 `// @vitest-environment jsdom`
 * 按需开启 jsdom，而不是把默认环境改成 jsdom。
 *
 * primitives 别名是**仅测试用**的接缝：发布态 barrel 带裸 `.module.css` 导入与
 * jsdom 套件解析不了的主机侧依赖，因此所有套件都加载替身（DOM 形状一致，见
 * `test/stubs/ui-primitives.tsx`，由任务 10.4 创建）。组件 props 仍按真实包做类型
 * 检查——TypeScript 不知道这个别名。
 */
export default defineConfig({
  // 根 tsconfig.json 是 solution 文件（没有 compilerOptions），逐文件查 tsconfig 时
  // 推断不出 `jsx: "react-jsx"`，stub 与测试里的 JSX 会被编译成 React.createElement
  // 并在渲染期抛 “React is not defined”。
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
