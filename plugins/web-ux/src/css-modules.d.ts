/** CSS-module imports resolved by the esbuild CSS-modules plugin at build time. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
