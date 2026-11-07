/**
 * `scripts/dsh-baseline.mjs` 的类型声明（R4③ 收口）。
 *
 * 基线唯一来源是 node 侧脚本：`scripts/dsh-check.mjs`（仓级门禁）与软插件
 * `test/bundle.test.ts`（vitest）都从 `.mjs` 导入。`.mjs` 本身没有声明文件，
 * 测试侧的静态 import 会报 TS7016——此前 wsc 套件只能用 `createRequire` 桥
 * （同一模块实例、手写 `as` 形状），本文件补齐后桥已退役改回静态 import。
 *
 * 常量类型一律 `string` 而非基线字面量：`pnpm dsh:upgrade` 只按首个文本出现重写
 * `.mjs`，字面量声明会在每次基线提升后过期逼手工同步；基线的精确值由
 * `check-dsh-baseline.mjs` 的运行时断言钉住（tripwire 在门禁，不在类型层）。
 *
 * @module scripts/dsh-baseline
 */

/** 当前开发与发布验证所针对的 DSH 精确版本。 */
export const DSH_BASELINE: string

/**
 * 由基线派生软插件的可安装范围：`>=<基线> <<主>.<次+1>.0`。
 * @param baseline - 精确基线版本（默认当前基线）。
 * @returns 软插件的 `engines.dsh` 与 DSH peer 范围。
 */
export function softDshRange(baseline?: string): string

/** 当前基线对应的软插件范围。 */
export const SOFT_DSH_RANGE: string
