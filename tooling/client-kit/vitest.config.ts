import { defineConfig } from 'vitest/config'

/**
 * 本包自持的极简测试配置：纯函数单测（不渲染 UI、不碰 DOM），不走 test-kit 的
 * `defineWebTestConfig` 工厂（那是给双端插件消费方接 UI 替身用的）。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
