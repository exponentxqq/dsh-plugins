# dsh-plugin-workspace-config

DSH Web GUI 的**统一「工作区配置」入口**（holder，**零业务逻辑**）：侧栏 footer 只留一枚「工作区配置」入口（宽栏图标 + 文案，折叠轨 28px 图标），点击打开 `shell.overlay` 上的统一模态弹窗；弹窗左侧是分节导航，右侧一次只渲染当前选中的分节。分节座位 `workspace-config.section` 由本包声明，其他插件以**纯类型依赖**的方式贡献分节。

本包是 DSH 的**双端** bundle：宿主半（`exports "."`）是 no-op 锚点，浏览器半（`exports "./client"`）才是入口与弹窗的实体。

## 定位

- **入口唯一**：`sidebar.footer.action` 只剩这一枚入口（旧的三颗 footer 入口由贡献方在本次变更里硬移除，不做共存探测，也没有配置开关）。入口**恒在**——即使一个分节都没有，footer 也仍然显示它，空态在弹窗内解释（D5）。
- **分节可扩展**：新增分节只需要贡献方在自己的包里注册一次（`slots.inject` 软注册），holder 不与任何贡献方建立运行时依赖。
- **类型权威**：`workspace-config.section` 的座位名、owner 份额与 order 常量只在 `src/client/contract.ts` 定义一次；贡献方通过 `exports["./client"].types`（`lib/types/client/index.d.ts`）取类型。
- **四包同装**：profile 侧推荐同时安装 `dsh-plugin-workspace-config` 与三个贡献方（`multi-root-workspace` / `session-tool-toggle` / `web-ux`）。未装 holder 时贡献方不会残留 footer 入口（`slots.inject` 静默不触发），但它们的 GUI 分节也不可达；未装某个贡献方时 holder 的弹窗里少一节并显示/保留空态，不报错。

## 双端结构

```text
src/index.ts                    宿主半：no-op 锚点（inject: [] + 空 apply），只为让 client-module scan 读到 dsh.client
src/client/contract.ts          座位契约唯一权威：座位名 / owner 份额 / SlotMap 增补 / order 常量（零 React、零运行时上游 import）
src/client/locales.ts           双语文案：NS workspaceConfig，7 键（zh canonical / en 镜像）
src/css-modules.d.ts            *.module.css 的类型（构建期由 esbuild 内联为运行时 <style>）
build.mjs                       双端构建：宿主 ESM（仅 node:* 外置）+ 浏览器 CJS（ModuleLoader 壳）
tsconfig{,.base,.client,.host}  solution + base + 两个 composite 子工程；client 发射 d.ts 到 lib/types/
test/stubs/ui-primitives.tsx    primitives 测试替身（Modal headless / Button / 两个图标）
vitest.config.ts                测试配置（primitives 替身经 alias 注入；jsdom 按用例文件头开启）
.oxlintrc.json                  lint 配置

# 以下文件属本包的客户端装配与组件（已实现并随仓库提交）：
src/client/index.ts             客户端装配：locale 注册 + 打开桥 + 两个座位注册（trigger 50 / dialog 530 + children 声明）
src/client/open-store.ts        打开桥（布尔快照 store）
src/client/sections.ts          nav 行投影（id/order/label，双版本记忆）
src/client/WorkspaceConfigTrigger.tsx  footer 入口（宽态 ellipsis / 折叠态 28px；禁 flex:none）
src/client/WorkspaceConfigDialog.tsx   统一弹窗壳（Modal headless + 自绘 header/nav/内容列 + 空态）
src/client/dialog.module.css    弹窗与入口样式（只走 --dsw-alias-* 令牌）
test/*.test.ts(x)               入口 / 弹窗 / 投影 / 真 renderer 座位 PoC / 产物形状断言
artifacts/                      真机冒烟记录
```

宿主半刻意保持 no-op：不挂 Connection RPC 通道、不读写 `workspaces.json` / `defaults.json`、不新增配置键。分节需要的宿主能力全部留在各贡献方自己的宿主半里。

## 座位契约（贡献方必读）

座位：`workspace-config.section`（`kind: 'list'`、`scope: 'root'`、owner `{ close(): void }`），与官方 `settings.section` 同构。holder 在注册 `shell.overlay` 时用 `children` 声明它（Declaring is claiming），渲染时以 `renderSlot('workspace-config.section', { close }, { only: activeId })` 过滤出当前选中分节。

贡献方拿到类型的**唯一**方式：

```ts
import type {} from 'dsh-plugin-workspace-config/client'                            // ① 取得 SlotMap 增补
import type { WorkspaceConfigSectionSeat } from 'dsh-plugin-workspace-config/client' // ② 取得字面量类型
const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'          // ③ 本地值
```

三条纪律：

1. **只允许 `import type`**：运行时 import 会把 holder 的整模块（含 React 组件、CSS 注入）打进贡献方 bundle；`verbatimModuleSyntax` 下 `import type` 是零产物。贡献方的 `bundle.test` 断言产物里不含 `dsh-plugin-workspace-config`。
2. **不把 `dsh-plugin-workspace-config` 写进贡献方的 `dsh.client.inject`**：那是运行时加载依赖，会变成对 holder 的硬依赖；而 `slots.inject` 的软注册本来就不需要任何加载顺序保证。
3. **座位字面量各包各持一份**，由字面量类型（写错即 typecheck 失败）而不是共享运行时常量保证一致；holder 的 `WORKSPACE_CONFIG_SECTION` 只供 holder 内部使用。

注册形状（三个贡献方一致）：

```ts
ctx.slots.inject(SECTION_SEAT, () => {
  try {
    return ctx.slots.register(
      { name: SECTION_SEAT, id: SECTION_ID, order: SECTION_ORDER, label: () => t('section.label'), locale: NS, inject: () => ({ … }) },
      SectionComponent,
    )
  } catch (error) {
    ctx.logger?.warn('…: 工作区配置分节座位注册失败，本节不显示', error)
    return () => {}
  }
})
```

`label` 是 thunk（`() => t('section.label')`）：locale 切换无需重注册，holder 读 nav 行时按 `typeof label === 'function' ? label() : label` 就地解析（不 import 上游 `resolveSlotLabel`——`dsh-client-ui-slots` 没有 `./client` 导出，运行时 require 它会命中 loader 的「missed the module table」硬错，D2）。

## 顺序常量

| 常量 | 值 | 位置 | 说明 |
|---|---|---|---|
| `WORKSPACE_CONFIG_TRIGGER_ORDER` | `50` | `contract.ts` | footer 唯一入口；与官方底部控件（缺省 `0`）留出间隔，后装插件可插在中间（D11） |
| `WORKSPACE_CONFIG_DIALOG_ORDER` | `530` | `contract.ts` | `shell.overlay`；排在 web-ux 删除确认（`500`）与旧管理浮层（`520`）之后，两者互斥不叠放（D11） |
| 分节 `order` | `10` / `20` / `30` | 各贡献方本地常量 | 工作区文件夹 / 工作区默认档 / 会话管理；跨分节由 holder 按 order 稳定排序 |

## 文案

holder 的 `NS = 'workspaceConfig'`，7 个键（zh canonical / en 镜像）；分节业务文案由各贡献方自有命名空间提供：

| key | zh | en |
|---|---|---|
| `entry.label` | 工作区配置 | Workspace settings |
| `dialog.title` | 工作区配置 | Workspace settings |
| `dialog.close` | 关闭 | Close |
| `nav.label` | 配置分节 | Settings sections |
| `dialog.empty.title` | 暂无可配置的分节 | No settings sections |
| `dialog.empty.hint` | 安装提供配置分节的插件后，对应分节会出现在这里。 | Install a plugin that provides a settings section, and it will appear here. |
| `dialog.loading`（预留） | 正在载入… | Loading… |

空态提示**不点名**具体插件（D14）：holder 不在文案里维护一份「插件清单」，新增分节时无需改文案。

## 安装到 profile

本变更推荐的安装形态是**四包同装**（同一 tag）：

```bash
TAG=$(git describe --tags --abbrev=0)
for pkg in workspace-config multi-root-workspace session-tool-toggle web-ux; do
  docker exec dsh dsh plugin --profile web add \
    "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/${pkg}"
done

# 本地开发调试（link:，改源码需重建 + 重启 profile）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/workspace-config

docker exec dsh dsh --profile web --dump-config          # 校验组合可加载（安装冒烟探针；schema dump 有 4 条既有 preset error，不作门禁）
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: workspace-config` 的**裸包名**行——这一形态是 REQUIRED，client-module scan 只从裸包名行读取 `dsh.client` 声明）。holder 不带 `config:` 段，也没有任何可选配置键。

## 构建与类型

```bash
pnpm install       # 仓库根一次装齐 workspace 依赖
pnpm build         # = build:types（tsc 发 d.ts）→ node build.mjs（esbuild 双端）
pnpm typecheck     # tsc -b：host + client 双工程
pnpm test          # vitest
pnpm lint          # oxlint
pnpm verify:all    # lint + typecheck + build + test
```

产物：

- `lib/index.js` —— 宿主半 ESM，自包含、只把 `node:*` 外置（本包宿主半是 no-op 锚点）。
- `lib/client.js` —— 浏览器半 CJS bundle，包进 `window.__ModuleLoader__.load({ id: 'dsh-plugin-workspace-config', factory })` 壳；`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供，CSS modules 内联为运行时 `<style>` 注入，因此没有独立样式文件。
- `lib/types/**/*.d.ts` —— **本包必须发射 d.ts**：它是三个贡献方的座位契约类型权威（`exports["./client"].types` → `lib/types/client/index.d.ts`）。纯 esbuild 不产声明，所以 `build:types` 由 `tsc` 单独完成（D4）。

因此 `build.mjs` **不会**整目录清 `lib/`：`lib/types/` 是 `build:types` 先写好的，整目录删除会把声明一起删掉；脚本只覆盖自己产出的两个 JS 文件。

`tsconfig.client.json` 是唯一发射产物的子工程（`declaration` + `emitDeclarationOnly` + `rootDir: src` + `outDir: lib/types`）；`tsconfig.host.json` 与 base 一样是 `noEmit` 纯检查。测试目录不进 emit 工程（`rootDir: src` 与测试文件位置冲突），由 vitest 的 esbuild 转译执行——与 multi-root-workspace 的既有取舍一致。

`lib/` 随仓库提交（release 时递归重建保证新鲜）；`node_modules/`、`*.tsbuildinfo` 由仓库根 `.gitignore` 忽略，各插件不再单列 `.gitignore`。

## 当前状态

本包已实现完毕并随仓库提交：宿主 no-op 锚点、座位契约与类型权威、双语文案、客户端装配（打开桥 + `sidebar.footer.action` 唯一入口 + `shell.overlay` 统一弹窗壳 + nav 投影 + 样式）与测试全部就位，构建产物 `lib/index.js` / `lib/client.js` / `lib/types/**` 随仓库提交。三个贡献方（multi-root-workspace / session-tool-toggle / web-ux）已按上文「只允许 `import type`」的约定接入各自分节，holder 侧不保留任何分节业务逻辑，也不维护贡献方清单。测试共 **55 例**（6 个测试文件；其中真 `@deepseek-ai/dsh-client-ui-renderer` 产物的座位 PoC 5 例：children 声明 / only 过滤 / label 双态 / 后装补跑 / 分节崩溃边界），四包同装的真机冒烟走查记录见 `artifacts/workspace-config-smoke.md`。

## 非目标

- 不实现任何分节业务（Folders / 工作区默认档 / 会话管理都在贡献方）；
- 不提供配置开关，也不做「新旧入口共存」探测；
- 不碰窄屏/移动布局的 footer 冲突（验收面仅桌面 256px 宽栏与 56px 折叠轨）；
- 不改上游任何包，也不 fork `sidebar.footer.action` / `shell.overlay` / `Modal` 的实现。

## 许可

Apache-2.0。
