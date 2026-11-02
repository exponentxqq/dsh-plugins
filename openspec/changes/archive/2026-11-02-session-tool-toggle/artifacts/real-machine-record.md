# 真机 link 安装与验证记录

> 日期：2026-10-31 01:25–01:40（Asia/Shanghai）
> 目标：按用户要求，用 **link** 方式把插件安装到**真机**（正在使用的 dsh 实例），由用户自行点击验证。

## 一、真机拓扑

| 项 | 值 |
|---|---|
| 真机实例 | docker 容器 `dsh`，PID 1 = `node /usr/local/bin/dsh web --no-open` |
| Web GUI | `http://127.0.0.1:3080`（启动 token 交换签名 cookie） |
| profile 数据目录 | 容器 `/home/docker/.dsh/profiles/web` ← 挂载自 dotfiles 仓库 `dsh/profiles/web`（git 跟踪） |
| 插件源码 | `/home/xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle`（容器内同路径可见） |
| 真机 bundle 数 | 17（安装前） |

## 二、安装方式与结果

使用 DSH 内置 `plugin_manager` 的 `install_bundle`（spec = 插件目录绝对路径）：

```json
{"stage":"enable","target":"dsh-plugin-session-tool-toggle","enabled":true,"changed":true,
 "application":"applied","packageResult":{"exitCode":0},
 "bundle":"dsh-plugin-session-tool-toggle","version":"1.4.0","warnings":[]}
```

要点：

- 依赖以 `link:` 协议写入（pnpm 解析为相对路径 `link:../../../../xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle`）；
- 自动追加进 `dsh.profile.bundles`（末尾）；
- 版本检查（`engines.dsh` / peer）通过；
- **`application: "applied"`：在线 profile 在运行中进程内立即挂载，无需重启**。

### profile 变更（dotfiles 仓库）

```
 M dsh/profiles/web/package.json      # bundles + "dsh-plugin-session-tool-toggle": "link:..."
 M dsh/profiles/web/pnpm-lock.yaml    # link 条目
 M dsh/profiles/web/cordis.patch.yml  # 与本安装无关（用户自己的模型 provider 改动）
```

`cordis.yml` 无净变更：安装触发 loader `Include` 的树持久化写回，随后 `docker exec dsh dsh --profile web --dump-config` 的
`prepareProfile` 又将其重写回空 root 模板（`[]` + 注释）——这是 DSH 既有行为（代码注释明确「root is always rewritten」）。

## 三、运行时验证

### 1. host 半：loader 已挂载

`cordis_inspect_query(host, Config, listConfigs, {name:"dsh-plugin-session-tool-toggle"})`：

```json
{"id":"include:session-tool-toggle","patchId":"session-tool-toggle","name":"dsh-plugin-session-tool-toggle","status":"schema"}
```

`docker logs dsh` 中插件日志 **33 条**，覆盖 7 个会话：默认档损坏降级、按默认档播种、执行期守卫安装；**无 error/fail/warn**。

### 2. client 半：Slot 已注册

`cordis_inspect_query(client, Slots, listSubTree, {root:"conversation.session.header.utilities"})` 的 occupants 包含：

```json
{"registrant":"session-tool-toggle","id":"session-tool-toggle-panel","order":20,"priority":0,"active":true}
```

### 3. Web 面板：真机 UI 实测

新加载页面（token 交换后）打开会话，会话头部出现 **Tools** 按钮
（`aria-label="Tools"`，`title="Session tool switches: turn groups or single tools off for this session"`，
class 前缀 `stt_trigger_*`）。点击打开面板，实测数据：

| 指标 | 实测值 |
|---|---|
| 本会话可见工具 | **220** |
| 目录内工具 | **187** |
| 被其他作用域遮蔽 | **38**（project-mcp 按工作区隔离的 MCP 工具——真机特有，识别正确） |
| 已关闭 | 0 |
| MCP 分组 | 8：chrome-devtools-mcp 32 / codebase-memory 17 / dbx 18 / dbx-brains 18 / dbx-family 18 / figma 2 / figma-family 2 / yunxiao 70 |
| Skills | 1（`skill`） |
| 内置工具 | 80 |
| Protected（置灰不可关） | `bash` `edit` `glob` `grep` `read` `write` |
| 默认档文件 | `/home/docker/.dsh/session-tool-toggle/defaults.json`（当前不存在 → 空档，面板显示 "The defaults turn nothing off."） |
| 创建快照 | 0 项（"Snapshot at creation: 0 entries"） |

> 截图仅作临时验证，因含用户真实会话内容，**不入库**。

### 4. CLI 合成验证

`docker exec dsh dsh --profile web --dump-config` 输出树（330 行 `name:`）第 1406–1408 行：

```
# == dsh-plugin-session-tool-toggle
- id: session-tool-toggle
  name: dsh-plugin-session-tool-toggle
```

## 四、用户验证指引（无需重启）

1. **刷新** 浏览器页面（加载新 client bundle）；
2. 会话头部（标题右侧）出现 **Tools** 按钮 → 点击打开面板；
3. 关闭某个 MCP 组（如 `yunxiao`）→ 下一轮模型步骤起该组工具不可见；
4. 输入 `/tools status` 查看命令面状态（与面板共用同一状态）；
5. 恢复：面板内重新打开，或 "Restore the creation snapshot"。

下次重启 dsh 后插件仍会自动加载（已进 `dsh.profile.bundles`，`cordis.yml` 由 `prepareProfile` 重置，不会重复 insert）。

## 五、回滚方式

```bash
# 方式 A（推荐）：GUI 侧边栏「插件」页或 Agent 工具
plugin_manager(action="remove_bundle", target="dsh-plugin-session-tool-toggle")

# 方式 B：手动（dotfiles 仓库）
cd ~/develop/dotfiles
git checkout -- dsh/profiles/web/package.json dsh/profiles/web/pnpm-lock.yaml
# 注意 cordis.patch.yml 有用户自己的改动，勿一并还原
docker exec dsh dsh plugin --profile web install   # 重新装依赖
```

安装前已备份三文件至 `/tmp/dotfiles-backup-*/`。
