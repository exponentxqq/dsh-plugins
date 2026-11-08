# dsh-plugin-workspace-config

DSH Web GUI 的**统一「工作区配置」入口**（holder，**零业务逻辑**）：入口是**一对注册**——侧栏面板行（`sidebar.panellist`，id `workspace-config`、order 20，排在官方面板 `plugins` / `schedules` 之后）与主区域**独立页面**（`main` 座位，key 与面板行 id 是同一个值）；点击面板行进入页面，页面自上而下是页头（标题 + 简介）、**页面级唯一的工作区选择框**、分节 tab 行，正文一次只挂载当前选中的分节。分节座位 `workspace-config.section` 由本包在注册页面时用 `children` 声明，其他插件以**纯类型依赖**的方式贡献分节。

本包是 DSH 的**双端** bundle：宿主半（`exports "."`）是 no-op 锚点，浏览器半（`exports "./client"`）才是面板行与页面的实体。

## 定位

端性：双端

- **入口唯一（面板行 + 页面）**：`sidebar.panellist` 上只有这一行「工作区配置」（旧的三颗 footer 入口由贡献方硬移除，不做共存探测，也没有配置开关），本包自己也不再注册 `sidebar.footer.action` 或 `shell.overlay` 浮层。面板行与页面**同生共死**：`createPanelPair` 保证页面装成之后行才注册、页面退场时行一并退场——宿主点击未注册的 `main` key 会 `throw`，两处各自 `try/catch` 会留下「行在、点了报错」的坏形态，任何一侧失败只 `warn`，最终观感是「没有这一行」。行**恒在**——即使一个分节都没有，行仍然显示，页面显示空态（D5）。
- **统一工作区选择框**：页面顶部唯一的页面级选择入口（各分节内不得另有选择框）。候选 = 已登记工作区（Host 顺序）+ 末项「未分配」（恒排最后，空清单时只剩它）；默认选中顺序 = 最近使用 > 当前会话所属工作区 > 第一项，清单为空取「未分配」。选择值作为**纯数据**份额下传给当前分节，跨 tab 保留；页面切走即卸载、重进回到默认（页面不带 store）。工作区服务未就绪时工具栏降级为「工作区列表尚未就绪」文案，分节收到 `{kind:'none'}`。
- **分节可扩展**：新增分节只需要贡献方在自己的包里注册一次（`slots.inject` 软注册），holder 不与任何贡献方建立运行时依赖。
- **类型权威**：`workspace-config.section` 的座位条目形状（座位名、owner 份额、order 类型）由 `@dsh-plugins/contracts` 统一定义（`WorkspaceConfigSectionSlot`，D-15 权威转移），消费方式见 [`tooling/contracts/README.md`](../../tooling/contracts/README.md)；本包 `src/client/contract.ts` 退化为文档指针与过渡 re-export，各消费包仍各持一份本地 `declare module` 增补。holder 继续发射 `lib/types/**`——那是本包 `exports['./client'].types` 的产物义务，不再是座位契约的权威来源。
- **四包同装**：profile 侧推荐同时安装 `dsh-plugin-workspace-config` 与三个贡献方（`multi-root-workspace` / `session-tool-toggle` / `web-ux`）。未装 holder 时贡献方不会残留侧栏入口（`slots.inject` 静默不触发），但它们的 GUI 分节也不可达；未装某个贡献方时页面少一个 tab 并保留空态，不报错。

## 双端结构

浏览器半的装配是「两个快照源 + 一对注册 + 一个页面」：`createSectionsSource` 投影分节 tab 行、`createWorkspaceListSource` 驱动统一选择框，两个源都是 `apply` 期构造的稳定单例；`createPanelPair` 把 `main` 页面与 `sidebar.panellist` 行绑成同生共死的一对。

```text
src/index.ts                    宿主半：no-op 锚点（inject: [] + 空 apply），只为让 client-module scan 读到 dsh.client
src/client/contract.ts          座位契约文档指针 + 过渡 re-export + holder 本地常量（座位名 / PANEL_ID / PANEL_ORDER）
src/client/index.ts             客户端装配：locale 注册 + 两个快照源 + panel-pair 双注册（main 页面 + sidebar.panellist 行）
src/client/locales.ts           双语文案：NS workspaceConfig，9 键（zh canonical / en 镜像）
src/css-modules.d.ts            *.module.css 的类型（构建期由 esbuild 内联为运行时 <style>）
build.mjs                       薄构建入口：宿主 ESM + 浏览器 CJS（ModuleLoader 壳）由 @dsh-plugins/build-kit 产出
tsconfig{,.host,.client}        solution + 两个子工程（只 extends 根基准）；client 发射 d.ts 到 lib/types/
test/stubs/ui-primitives.tsx    primitives 测试替身（一行 re-export @dsh-plugins/test-kit/ui-primitives 的并集底座）
vitest.config.ts                测试配置（primitives 替身经 alias 注入；jsdom 按用例文件头开启）

# 以下文件属本包的页面装配与组件（已实现并随仓库提交）：
src/client/WorkspaceConfigPage.tsx      独立页面壳（页头 + 选择框 + SegmentedTabs + 真 tabpanel + 空态）
src/client/WorkspacePicker.tsx          页面级统一工作区选择框（Menu 必开 portal + 自绘锚点）
src/client/WorkspaceConfigPanelIcon.tsx 侧栏面板行图标（sidebar.panellist 的条目组件）
src/client/panel-pair.ts                双注册协调器（页面 / 行同生共死，两侧失败只 warn）
src/client/sections.ts                  分节 tab 行投影（id/order/label，双版本记忆 + 稳定排序）
src/client/workspace-source.ts          工作区清单源（pending | ready，workspaces 服务晚到自动转 ready）
src/client/workspace-choice.ts          纯投影层：三态编解码 / 候选（未分配恒最后）/ Q10 默认选择 / 标题兜底
src/client/session-context.ts           「当前会话」与会话 updatedAt 读数的 holder 薄层（唯一实现在 @dsh-plugins/client-kit/client-session）
src/client/page.module.css              页面样式（只走 --dsw-alias-* 令牌；单文件保「一个样式注入器」）
test/*.test.ts(x)                       装配 / 页面 / 协调器 / 清单源 / 选择策略 / 分节投影 / 真 renderer 座位 PoC / 产物形状
artifacts/                              真机冒烟记录
```

宿主半刻意保持 no-op：不挂 Connection RPC 通道、不读写 `workspaces.json` / `defaults.json`、不新增配置键。分节需要的宿主能力全部留在各贡献方自己的宿主半里。

## 座位契约（贡献方必读）

座位：`workspace-config.section`（`kind: 'list'`、`scope: 'root'`、owner 份额 `{ workspace }`），与官方 `settings.section` 同构。holder 在注册 `main` 页面时用 `children` 声明它（Declaring is claiming），渲染页面正文时以 `renderSlot('workspace-config.section', { workspace }, { only: activeId })` 只渲染当前选中分节。

owner 份额是**纯数据**的三态工作区上下文（`WorkspaceConfigWorkspaceContext`），**没有 `close`**：旧弹窗时代的关闭回调随弹窗壳一并删除（Q7），分节导航与离开页面归壳 / 宿主所有：

| 份额 | 含义 | 分节处置 |
|---|---|---|
| `{kind:'workspace', id, title, path}` | 页面选择框选中一个已登记工作区 | 各分节按自己的寻址键取用：web-ux 用 `id` 取行集，session-tool-toggle 用 `path` 作 `{workspacePath}` 寻址，multi-root 过 gate 后仍按当前会话寻址 |
| `{kind:'unassigned'}` | 选择框的「未分配」特殊项（恒排最后） | web-ux 用它枚举孤儿归档 / 已迁移条目；其余分节按「无有效目标」空态处理 |
| `{kind:'none'}` | 页面拿不到工作区上下文（服务未就绪 / 清单为空前的降级） | 全部分节空态，不发按工作区寻址的请求 |

`unassigned` 与 `none` 不合并：前者在 web-ux 有真实内容（不属于任何工作区的行集），拿它表示「服务未就绪」会让用户看到一批不该出现的行。

类型从 `@dsh-plugins/contracts` 取（权威，D-15），本包 `exports['./client'].types` 只作过渡兼容层：

```ts
import type {
  WorkspaceConfigSectionSeat,
  WorkspaceConfigSectionOwnerProps,
  WorkspaceConfigSectionSlot,
} from '@dsh-plugins/contracts'                                  // ① 座位 / 份额 / 条目形状

declare module '@deepseek-ai/dsh-client-ui-slots' {              // ② 本地增补，形状引用 contracts
  interface SlotMap {
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}

const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'   // ③ 本地值
```

三条纪律：

1. **只允许 `import type`**：运行时 import 会把 holder 的整模块（含 React 组件、CSS 注入）或契约包打进贡献方 bundle；`verbatimModuleSyntax` 下 `import type` 是零产物。贡献方的 `bundle.test` 断言产物里不含 `dsh-plugin-workspace-config`。
2. **不把 holder / contracts 写进贡献方的 `dsh.client.inject`**：那是运行时加载依赖，会变成硬依赖；而 `slots.inject` 的软注册本来就不需要任何加载顺序保证。
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

`label` 是 thunk（`() => t('section.label')`）：locale 切换无需重注册，holder 读 tab 行时按 `typeof label === 'function' ? label() : label` 就地解析（不 import 上游 `resolveSlotLabel`——`dsh-client-ui-slots` 没有 `./client` 导出，运行时 require 它会命中 loader 的「missed the module table」硬错，D2）。

## 顺序常量

| 常量 | 值 | 位置 | 说明 |
|---|---|---|---|
| `PANEL_ID` | `'workspace-config'` | `contract.ts` | 面板 id：**同时**是 `main` 的 `key` 与 `sidebar.panellist` 的 `id`。宿主 `selectPanel(id)` 直接用它切换页面，两边写岔即面板点不开（Q6） |
| `PANEL_ORDER` | `20` | `contract.ts` | 侧栏面板行的位次；官方面板 `plugins=0` / `schedules=10` 之后，本包的面板行排在其后（Q5） |
| 分节 `order` | `10` / `20` / `30` | 各贡献方本地常量 | 工作区文件夹 / 工作区默认档 / 会话管理；页面按 order **稳定**升序排列，默认选中 order 最小者 |

## 文案

holder 的 `NS = 'workspaceConfig'`，9 个键（zh canonical / en 镜像）；分节业务文案由各贡献方自有命名空间提供：

| key | zh | en |
|---|---|---|
| `entry.label` | 工作区配置 | Workspace settings |
| `page.title` | 工作区配置 | Workspace settings |
| `page.intro` | 按类别管理工作区设置；上方选择框决定本页作用的工作区。 | Manage workspace settings by category; the picker above chooses the workspace this page applies to. |
| `page.tabs.label` | 配置分类 | Settings categories |
| `page.empty.title` | 暂无可配置的分节 | No settings sections |
| `page.empty.hint` | 安装提供配置分节的插件后，对应分节会出现在这里。 | Install a plugin that provides a settings section, and it will appear here. |
| `page.workspace.label` | 工作区 | Workspace |
| `page.workspace.unassigned` | 未分配 | Unassigned |
| `page.workspace.unavailable` | 工作区列表尚未就绪 | Workspace list is not ready yet |

`entry.label` 与 `page.title` 文案相同但语义位分开：前者是侧栏面板行的 label thunk，后者是页面 `<h1>`。空态提示**不点名**具体插件（D14）：holder 不在文案里维护一份「插件清单」，新增分节时无需改文案。

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

## 构建与测试

```bash
pnpm install       # 仓库根一次装齐 workspace 依赖
pnpm build         # = build:types（tsc 发 d.ts）→ node build.mjs（esbuild 双端）
pnpm typecheck     # tsc -p 双调用：host + client 两个工程
pnpm test          # vitest
pnpm lint          # oxlint
pnpm verify:all    # lint + typecheck + build + test
```

产物：

- `lib/index.js` —— 宿主半 ESM，自包含、只把 `node:*` 外置（本包宿主半是 no-op 锚点）。
- `lib/client.js` —— 浏览器半 CJS bundle，包进 `window.__ModuleLoader__.load({ id: 'dsh-plugin-workspace-config', factory })` 壳；`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供，CSS modules 内联为运行时 `<style>` 注入，因此没有独立样式文件。
- `lib/types/**/*.d.ts` —— **本包必须发射 d.ts**：它是 `exports["./client"].types` 的类型出口（D-15 后座位条目形状权威已迁 `@dsh-plugins/contracts`，此出口为过渡兼容层）。纯 esbuild 不产声明，所以 `build:types` 由 `tsc` 单独完成（D4）。

因此 `build-kit` 从 `exports[*].types` 推出 `dtsOwned`，清理策略取 `js-only`：只覆盖自己产出的两个 JS 文件，不会整目录清 `lib/`（`lib/types/` 是 `build:types` 先写好的，整目录删除会把声明一起删掉）。

`tsconfig.client.json` 是唯一发射产物的子工程（`declaration` + `emitDeclarationOnly` + `rootDir: src` + `outDir: lib/types`）；`tsconfig.host.json` 与根基准一样是 `noEmit` 纯检查。测试目录不进 emit 工程（`rootDir: src` 与测试文件位置冲突），由 vitest 的 esbuild 转译执行——与 multi-root-workspace 的既有取舍一致。

`lib/` 随仓库提交（release 时递归重建保证新鲜）；`node_modules/`、`*.tsbuildinfo` 由仓库根 `.gitignore` 忽略，各插件不再单列 `.gitignore`。

## 当前状态

本包已实现完毕并随仓库提交：宿主 no-op 锚点、座位契约接线（类型权威在 `@dsh-plugins/contracts`）、双语文案、客户端装配（`main` 独立页面 + `sidebar.panellist` 面板行 + 配对协调器 + 分节 / 工作区两个快照源 + 页面级统一选择框）与测试全部就位，构建产物 `lib/index.js` / `lib/client.js` / `lib/types/**` 随仓库提交；旧弹窗三件套（`WorkspaceConfigDialog` / `WorkspaceConfigTrigger` / `open-store`）及其 d.ts 已下线。三个贡献方（multi-root-workspace / session-tool-toggle / web-ux）已按上文约定接入各自分节与 `{ workspace }` 份额，holder 侧不保留任何分节业务逻辑，也不维护贡献方清单。测试共 **107 例**（8 个测试文件：装配 17 / 页面 13 / 协调器 13 / 清单源 15 / 选择策略 22 / 分节投影 9 / 真 `@deepseek-ai/dsh-client-ui-renderer` 产物座位 PoC 5 / 产物形状 13；座位 PoC 改挂 `main`，覆盖 children 声明 / `only` 过滤 / `{workspace}` 份额到达 / 切 tab 卸载 / 后装补跑 / 分节崩溃边界），四包同装的真机冒烟走查记录见 `artifacts/`。

## 非目标

- 不实现任何分节业务（Folders / 工作区默认档 / 会话管理都在贡献方）；
- 不提供配置开关，也不做「新旧入口共存」探测；
- 不在页面里提供「新建工作区」入口（需求只要求统一选择框，holder 保持零业务壳，P2 本期不做）；
- 不碰窄屏 / 移动布局（验收面是桌面宽度下的侧栏面板行与主区域页面）；
- 不改上游任何包，也不 fork `sidebar.panellist` / `main` / `Menu` 的实现。

## 许可

Apache-2.0。
