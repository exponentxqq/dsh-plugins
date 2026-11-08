# 工作区配置页面化 — 真机冒烟证据（2026-11-08-workspace-config-page）

- 日期：2026-11-08
- 环境：dsh 容器 web profile（`node /usr/local/bin/dsh web --no-open`，端口 3081→宿主 GUI `http://127.0.0.1:3080`）
- 安装形态：四包 link 安装（`dsh plugin --profile web add <本仓>/plugins/<name>`：workspace-config / session-tool-toggle / web-ux / multi-root-workspace），`docker restart dsh` 后生效；重启后 `dsh --profile web --dump-config` **exit 0**（装载门禁）。
- 断言工具：chrome-shared MCP（chromium-shared 实例），DOM 断言 + 网络请求核验；截图核对因会话模型无读图能力改为程序化 DOM 断言（等价证据，如实声明）。

## 断言结果（七项全过）

| # | 断言 | 结果 | 证据（DOM / 网络事实） |
|---|---|---|---|
| 1 | 面板行在位 | ✅ | 侧栏 `nav "Global panels"` 含 `button "Workspace settings"`，顺序 Plugins → Automation tasks → **Workspace settings**（order 20 排官方面板 0/10 之后，Q5/Q6） |
| 2 | 进入默认分节 | ✅ | `h1 "Workspace settings"` + 简介 + 页面级选择框（`button[aria-haspopup="menu"]`）+ 三分节真 tab；默认选中 **Workspace folders**（order 10 最小者，`activeId` 回退 `rows[0]`），multi-root 正文（primary/secondary 目录列表）在位 |
| 3 | 切 tab 卸载 | ✅ | 切到 Workspace defaults 后：原 folders 正文从 DOM 消失（`Primary working directory` 不再出现）、`[role="tabpanel"]` 的 `aria-labelledby` === 选中 tab id（互指成立）；分节 id `:ras:-session-tool-toggle-workspace-defaults` |
| 4 | 选择框联动两节读数 | ✅ | stt 分节读数 `Workspace key = /home/xuqinqin/develop/person/dsh-plugins` 随选择框当前值联动；网络侧 `POST /session-tool-toggle/workspace` **200** |
| 5 | 选择框候选与未分配排最后 | ✅ | 打开菜单 14 项 = 13 个真实工作区（Host 顺序）+ 末项 **Unassigned**（Q8） |
| 6 | 未分配空态 | ✅ | 选 Unassigned 后 stt 分节渲染 `workspace.noTarget` 空态（"Choose a workspace above first"），不发寻址请求（Workspace key 读数消失） |
| 7 | 重进重置 | ✅ | 切走（回会话视图）再重进：tab 回默认 Workspace folders、空态消失、份额回默认工作区（Q9：accept state reset on re-entry） |
| 8 | 无弹窗残留 | ✅ | 无 `workspace-config-dialog` / `workspace-config-trigger` DOM；页面唯一 overlay 为侧栏 Navigation modal 的遮罩（`pI_x6G_overlayLayer`，收起即消失，非 `shell.overlay`）；页面壳 `data-wc-page` 在位 |

## console 与网络核验

- console：仅 1 类 error = 资源 404 ×4，逐条核对均**与本变更无关**：
  - `GET /open-in-app/icon/filemanager` ×2（open-in-app 插件图标缺失，既有）；
  - `GET /api/changes.summary?sessionId=…` ×2（GUI 对旧会话的摘要查询 404，与本四包无关）。
- 分节宿主请求正向证据：`POST /multi-root-workspace/list` 200、`POST /session-tool-toggle/workspace` 200——分节寻址链路真实工作。

## 断言表达式摘录（可复算）

```js
// 断言 3：切 tab 卸载 + id 互指
(() => {
  const panel = document.querySelector('[role="tabpanel"]');
  const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
  return panel && selectedTab && panel.getAttribute('aria-labelledby') === selectedTab.id;
})() // => true

// 断言 5：未分配排最后
(() => {
  const menu = document.querySelector('[role="menu"]');
  const items = [...menu.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"]')].map(e => e.textContent.trim());
  return items.at(-1); // => "Unassigned"
})()

// 断言 8：无弹窗残留
(() => ({
  legacyDialogDom: !!document.querySelector('[class*="workspace-config-dialog"], [id*="workspace-config-dialog"]'), // => false
  triggerDom: !!document.querySelector('[id*="workspace-config-trigger"], [class*="workspace-config-trigger"]'),   // => false
}))()
```

## 已知降级（经用户裁决接受，R7）

- stt「工作区默认档」分节在页面形态以 `{workspacePath}` 寻址，宿主既有契约（D-24）对路径形态恒返回 `universe: null` → 分组清单/组开关不可达，分节呈现「清单不可用说明 + 残留区 + 写入」；分组清单走 /tools 面板（sessionId 视角）或命令面兜底。

## 装载冒烟命令（复算）

```bash
docker exec dsh dsh --profile web --dump-config   # exit 0（装载门禁）
docker exec dsh dsh plugin --profile web list      # 四包 link: 形态
```
