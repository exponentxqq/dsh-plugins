# A2 改造对照表：三份 bundle.test 逐条处置（7.1 删除/改造凭证）

> 执行期工件（2026-11-07，任务 7.1 落地）。旧行号：stt/web-ux 取改造前工作树（= HEAD `58c62d5` 后的组 1–5 改动基），wsc 取改造前 176 行工作树（含 1.5 的 R4③ createRequire 桥）。文件简称：stt = `plugins/session-tool-toggle/test/bundle.test.ts`（160→109）；web-ux = `plugins/web-ux/test/bundle.test.ts`（151→120）；wsc = `plugins/workspace-config/test/bundle.test.ts`（176→137）。`expect(` 总数 77 → 65（stt 15→10 / web-ux 30→26 / wsc 32→29）。
>
> 主会话裁定（2026-11-07）：① wsc 宿主组「契约调用 + 包内零 import 断言」**并存接受**（零 import 是强于契约 `node:*` 放行的包内事实，属 D5 保留边界）；② 三文件行数落 ±15% 带宽上沿**接受**（语义保真优先；D5 要求保留的注释全部在场）。

## stt（15 行 → 新 10 expect）

| 旧 `expect(` 断言 | 处置 | 新位置 |
|---|---|---|
| L102 `expect(source).toContain('window.__ModuleLoader__.load({')` | 契约 `loaderShellIssues`（3 条合 1） | L62 |
| L103 `expect(source).toContain(\`id: ${JSON.stringify(PACKAGE_NAME)}\`)` | 契约 `loaderShellIssues` | L62 |
| L104 `expect(source).toContain('factory: (require) => {')` | 契约 `loaderShellIssues` | L62 |
| L109 `expect(requiredWords(source)).toEqual(CLIENT_REQUIRES)` | 契约 `requireSurfaceIssues`（词集精确相等） | L67 |
| L112 `imports.filter(node:) …toEqual([])` | 契约 `requireSurfaceIssues`（node: 泄漏） | L67-68 |
| L113 `imports.filter(includes(PACKAGE_NAME)) …toEqual([])` | 契约 `requireSurfaceIssues`（自引用） | L67-68 |
| L119 `expect(ENDPOINTS).toHaveLength(5)` | 包内保留（契约常量唯一权威） | L74 |
| L121 `expect(WORKSPACE_ENDPOINT).toBe('workspace')` | 包内保留（T18 手写字面量等式） | L75 |
| L123 `toContain(JSON.stringify(marker))`（INLINED_MARKERS 循环） | 包内保留（内联标记 + G8-a 字面量） | L77 |
| L130 `not.toContain(marker)`（ABSENT_MARKERS 循环） | 包内保留（旧 footer + holder 包名缺席） | L84 |
| L133 `importedWords(source).filter(w => w.includes('dsh-plugin-workspace-config')).toEqual([])` | 包内保留（D3 零运行时依赖显式断言） | L86 |
| L142 `expect(injectors).toHaveLength(cssModuleCount())` | 包内保留（v1.4.0 事故护栏：动态计数） | L93 |
| L149 `imports.filter(w => !w.startsWith('node:')).toEqual([])` | 契约 `hostSelfContainmentIssues`（2 条合 1） | L99 |
| L151 `imports.filter(w => w.startsWith('@deepseek-ai/')).toEqual([])` | 契约 `hostSelfContainmentIssues` | L99-100 |
| L157 `toContain(JSON.stringify(marker))`（宿主通道+5 端点循环） | 包内保留 | L106 |

## web-ux（30 行 → 新 26 expect）

| 旧 `expect(` 断言 | 处置 | 新位置 |
|---|---|---|
| L36 `toContain('window.__ModuleLoader__.load({')` | 契约 `loaderShellIssues`（3 合 1） | L24 |
| L37 `toContain(\`id: ${JSON.stringify(PACKAGE_NAME)}\`)` | 契约 `loaderShellIssues` | L24 |
| L38 `toContain('factory: (require) => {')` | 契约 `loaderShellIssues` | L24 |
| L43 `expect(requiredWords(source)).toEqual(CLIENT_EXTERNALS)` | 契约 `requireSurfaceIssues`（词集） | L29 |
| L45 `imports.filter(node:) …toEqual([])` | 契约 `requireSurfaceIssues`（node:） | L29-30 |
| L46 `imports.filter(includes(PACKAGE_NAME)) …toEqual([])` | 契约 `requireSurfaceIssues`（自引用） | L29-30 |
| L51 `toContain('/web-ux')` | 包内保留 | L35 |
| L52 `toContain('preview-delete')` | 包内保留 | L36 |
| L53 `toContain('delete-session')` | 包内保留 | L37 |
| L54 `toContain('sidebar.workspaces.session.menu.item')` | 包内保留 | L38 |
| L55 `toContain('shell.overlay')` | 包内保留 | L39 |
| L58 `toContain('workspace-config.section')` | 包内保留 | L40 |
| L60 `toContain(JSON.stringify('web-ux-session-manager'))` | 包内保留 | L42 |
| L62 `not.toContain('dsh-plugin-workspace-config')` | 包内保留（D3） | L44 |
| L70 `toContain(endpoint)`（五个端点循环） | 包内保留 | L50 |
| L76 `toContain('command/executed')` | 包内保留 | L56 |
| L77 `toContain('conversation.input.overlay')` | 包内保留 | L57 |
| L78 `toContain('web-ux-command-notice')` | 包内保留 | L58 |
| L87 `expect(injectors).toHaveLength(4)` | 包内保留（固定 4 模块口径，D5） | L66 |
| L89 `toContain('--dsw-alias-bg-layer-2')` | 包内保留（notice 样式内联） | L68 |
| L97 `expect(foreign).toEqual([])` | 契约 `hostSelfContainmentIssues` | L74 |
| L114 `toContain(marker)`（宿主 channel/7 端点/2 事件循环） | 包内保留 | L85 |
| L127 `expect(manifest.main).toBe('lib/index.js')` | 包内保留（包声明段） | L99 |
| L128 `exports['.'].default` | 包内保留 | L100 |
| L129 `exports['./client'].default` | 包内保留 | L101 |
| L133 `dsh.client.platform === 'web'` | 包内保留 | L105 |
| L143 `expect(inject).toContain(dependency)`（6 依赖循环） | 包内保留（inject 面） | L112 |
| L146 `expect(inject).not.toContain('…ui-sidebar')` | 包内保留（无 sidebar） | L115 |
| L148 `expect(devDependencies).not.toHaveProperty('…ui-sidebar')` | 包内保留（devDeps） | L117 |
| L149 `expect(devDependencies['@dsh-plugins/contracts']).toBe('workspace:*')` | 包内保留（contracts devDep） | L118 |

## wsc（32 行 → 新 29 expect）

| 旧 `expect(` 断言 | 处置 | 新位置 |
|---|---|---|
| L74 `toContain('window.__ModuleLoader__.load({')` | 契约 `loaderShellIssues`（3 合 1） | L42 |
| L75 `toContain(\`id: ${JSON.stringify(PACKAGE_NAME)}\`)` | 契约 `loaderShellIssues` | L42 |
| L76 `toContain('factory: (require) => {')` | 契约 `loaderShellIssues` | L42 |
| L81 `expect(requiredWords(source)).toEqual(CLIENT_EXTERNALS)` | 契约 `requireSurfaceIssues`（词集） | L47 |
| L82 `expect(requiredWords(source)).not.toContain('…dsh-client-ui-slots')` | 包内保留（硬错防线显式重申；词集相等已覆盖） | L50 |
| L84 `imports.filter(node:) …toEqual([])` | 契约 `requireSurfaceIssues`（node:） | L47-48 |
| L86 `imports.filter(includes(PACKAGE_NAME)) …toEqual([])` | 契约 `requireSurfaceIssues`（自引用） | L47-48 |
| L92 `expect(occurrences.length).toBeGreaterThanOrEqual(2)` | 包内保留（座位 ≥2） | L56 |
| L94 `toContain('"workspace-config.section":')` | 包内保留（声明侧字面量） | L58 |
| L95 `toContain('"workspace-config.section",')` | 包内保留（渲染侧字面量） | L59 |
| L101 `toContain('sidebar.footer.action')` | 包内保留（宿主座位） | L65 |
| L102 `toContain('shell.overlay')` | 包内保留（宿主座位） | L66 |
| L103 `toContain(JSON.stringify('workspace-config-trigger'))` | 包内保留（entry id） | L67 |
| L104 `toContain(JSON.stringify('workspace-config-dialog'))` | 包内保留（entry id） | L68 |
| L114 `not.toContain(dependency)`（三贡献方包名循环） | 包内保留（D3 无反向运行时依赖） | L74 |
| L121 `toContain(key)`（五个文案键循环） | 包内保留（翻译键内联） | L81 |
| L128 `expect(injectors).toHaveLength(1)` | 包内保留（恰 1 注入器） | L88 |
| L129 `toContain('data-dsh-plugin')` | 包内保留（防重护栏另一半） | L89 |
| L135 `expect(importedWords(readArtifact(ROOT,'index.js'))).toEqual([])` | 契约 `hostSelfContainmentIssues`（L97）**+** 包内保留零 import（L98，裁定①并存） | L97/L98 |
| L140 `not.toContain('WorkspaceConfigDialog')` | 包内保留（不内联浏览器半） | L103 |
| L141 `not.toContain('window.__ModuleLoader__')` | 包内保留（同上） | L104 |
| L149 `expect(manifest.main).toBe('lib/index.js')` | 包内保留（包声明段） | L112 |
| L150 `exports['.'].default` | 包内保留 | L113 |
| L151 `exports['./client'].default` | 包内保留 | L114 |
| L152 `expect(exports['./client'].types).toBe('./lib/types/client/index.d.ts')` | 包内保留（类型权威，dtsOwned） | L115 |
| L154 `expect(existsSync(lib/types/client/index.d.ts)).toBe(true)` | 包内保留（dts 实存） | L117 |
| L155 `expect(existsSync(lib/types/client/contract.d.ts)).toBe(true)` | 包内保留（dts 实存） | L118 |
| L159 `dsh.client.platform === 'web'` | 包内保留 | L122 |
| L167 `expect(inject).toContain(dependency)`（四声明方循环） | 包内保留（含无 primitives 反向断言） | L128 |
| L169 `expect(inject).not.toContain('…ui-primitives')` | 包内保留 | L130 |
| L173 `expect(engines.dsh).toBe(SOFT_DSH_RANGE)` | 包内保留（软基线派生，createRequire 桥原样，R4③） | L134 |
| L174 `expect(peerDependencies['@deepseek-ai/dsh']).toBe(SOFT_DSH_RANGE)` | 包内保留（同上） | L135 |

## 非空洞性证据（7.1 执行期）

- 正面：真实 `lib/client.js`+`lib/index.js` 词喂四函数 → 空 issue 列表（测试绿）。
- 负面：缺壳标记 / 多一个 `node:fs` / 未声明外部词 → 共 5 条 issue，文案含 `[p] lib/client.js` / `[p] lib/index.js` 前缀——契约调用一旦违约必红。
- 字节不变：`check-artifacts --baseline /tmp/rc-b6-before` 退出 0（7 包模块词逐字相等）。
