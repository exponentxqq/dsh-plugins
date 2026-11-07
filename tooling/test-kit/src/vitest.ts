import { join } from 'node:path'

/**
 * 双端包共用测试配置的 include 双面值：`.test.ts` 与 `.test.tsx`。
 *
 * 组件套件以 `.test.tsx` 结尾，漏掉它就是「套件静默消失」；门禁 AR8 从本常量的
 * 数组字面量反向核对消费方配置，不要在外面另抄一份。
 */
export const WEB_TEST_INCLUDE = ['test/**/*.test.ts', 'test/**/*.test.tsx'] as const

export interface WebTestConfigOptions {
  /** 调用方包目录；测试配置里传 `import.meta.dirname`。空串/非字符串 → 抛错（fail fast）。 */
  readonly root: string
}

export interface WebTestConfig {
  readonly esbuild: { readonly jsx: 'automatic' }
  readonly resolve: { readonly alias: { readonly '@deepseek-ai/dsh-client-ui-primitives': string } }
  readonly test: { readonly include: readonly string[]; readonly environment: 'node' }
}

/**
 * 返回裸配置对象（测试运行器接受对象默认导出；本模块不 import 任何运行器，
 * 也不 import 本仓 `scripts/`）。
 *
 * 两个既定值不开放覆盖：默认 node 环境（jsdom 由组件套件的文件头按需开启），
 * JSX 走 automatic（根 tsconfig 是 solution 文件，逐文件查不出 `jsx: "react-jsx"`）。
 * 唯一的别名接缝把 primitives 指到调用方的 stub：发布态 barrel 带裸 `.module.css`
 * 导入与只有 web 壳能解析的宿主侧依赖，jsdom 套件加载不了。
 */
export function defineWebTestConfig(options: WebTestConfigOptions): WebTestConfig {
  // 参数在类型上必填，但调用方可能是没有类型检查的 JS；运行时仍要 fail fast。
  const root: unknown = (options as { readonly root?: unknown } | undefined)?.root
  if (typeof root !== 'string' || root === '') {
    throw new TypeError(`defineWebTestConfig({ root }): root 必须是非空字符串，收到 ${describe(root)}`)
  }
  return {
    esbuild: { jsx: 'automatic' },
    resolve: {
      alias: {
        '@deepseek-ai/dsh-client-ui-primitives': join(root, 'test', 'stubs', 'ui-primitives.tsx'),
      },
    },
    test: { include: WEB_TEST_INCLUDE, environment: 'node' },
  }
}

/** 只用于错误文案：字符串给带引号的原值，其余给 `typeof`（不展开对象，避免循环引用）。 */
function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return value === null ? 'null' : typeof value
}
