import { defineConfig } from 'vitest/config'

/**
 * 测试配置：默认 node 环境；需要 DOM 的用例在自己的文件头写
 * `// @vitest-environment jsdom`，不要整体切换环境。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
})
