/**
 * CSS-module 导入的类型声明。
 *
 * `*.module.css` 在构建期由 `build.mjs` 的 esbuild CSS-modules 插件编译成「运行时注入
 * `<style>` + 默认导出 本地名→作用域名 映射」的 JS 模块（因此不产独立样式表）；TypeScript
 * 只认识这里的形状，组件里 `import css from './dialog.module.css'` 才是类型安全的。
 *
 * 本文件由 `tsconfig.client.json` 的 `include` 纳入类型程序（它不产 d.ts）。
 *
 * @module dsh-plugin-workspace-config/client/css-modules
 */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
