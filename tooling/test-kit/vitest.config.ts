import { defineConfig } from 'vitest/config'

/**
 * 本包自持的极简测试配置：host-only 纯 node 单测，不走本包的
 * `defineWebTestConfig` 工厂（那是给消费方包接 UI 替身用的，会自引用）。
 * JSX 走 automatic，与根编译基准 `jsx: react-jsx` 同值，`.test.tsx` 不需要手引 React。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
  esbuild: {
    jsx: 'automatic',
  },
})
