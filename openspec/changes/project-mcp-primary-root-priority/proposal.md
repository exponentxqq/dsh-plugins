# Proposal

## Why

project-mcp 的会话归属由「混排 canonical 表逐层首条命中」决定：`Attributor.update` 把全部根（primary 与 granted）按 workspace registry 顺序混排进同一张表，归属结果由 registry 顺序碰运气。本机实证（2026-11-05）：`dotfiles` 目录自身是 #10 workspace 的主根，却被 #8 opc 的 granted 条目（当日 03:26 新增）抢注——dotfiles 会话被归属 opc，看到 opc 主根 `.dsh/mcp/` 下的 dbx / figma / yunxiao 三台服务器；`dsh-plugins` 同理被 #10 dotfiles 的 granted 条目抢注。独立工作区不应看到 grant 方主根的项目级 MCP。

## What Changes

- 归属规则改为**每层两轮匹配**：每层先匹配全部工作区的**主根**（primary），该层无主根命中再匹配**附加根**（granted）；跨层维持**最近层优先**（近层附加根命中胜远层主根命中）；同一目录被多工作区授予时按**工作区登记顺序取首者**；无命中 fail-closed 不变
- 归属返回的根集合保持**登记拼写**与完整根集合（变的只是谁赢，不是赢者可见范围）；scan 的 root-set 语义与 serverName 先到先得仲裁**零改动**
- isolation 三面（工具 / 名字 / 资源）单点派生自归属端口，自动跟随、零改动
- `attribution.ts` 模块头注释改写为上述规则的设计说明（含 commonRoots 启用后按登记顺序取首个的已知边界、软依赖降级为 primary-only 的自然退化）
- 测试：`test/attribution.test.ts` 新增 5 条归属用例（本 bug 回归、子目录、近层附加根胜远层主根、双授予按登记顺序、granted 复述主根无害），既有 7 条一字不改
- 插件 README「归属判定」段同步改写；dotfiles 仓 `dsh/README.md` 待改句**仅列清单不落地**（另行处理）
- 发版（release / tag / push）与 acp/headless profile 升级**后移为后续动作**（用户已裁定「先不发版不推送」、web=link 先行验证）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-project-mcp`：「工作区可见性隔离」Requirement 的归属判定句从「逐级向上找最近的已登记根」改写为层内两轮（主根优先于附加根）+ 跨层最近层优先 + 双授予按登记顺序，并新增 4 条对应 Scenario；其余条文（可见范围、应拒集合口径、profile 级不受影响）与全部既有 Scenario 不变

## Impact

- **代码**（根仓 dsh-plugins 子包 `plugins/project-mcp/`）：`src/host/attribution.ts`（重写归属建表与匹配，删 `CanonicalRoot`/`rootsOf`，增两表索引）、`test/attribution.test.ts`（+5 用例）、`README.md`（归属判定段）、`lib/index.js`（重建入库产物——web profile 是 link 安装，加载的就是它）
- **不改**：`roots.ts` / `scan.ts` / `isolation.ts` / `prompt-isolation.ts` / `index.ts` / `mcp-manager.ts`、`package.json` 版本、`cordis.patch.yml`、multi-root-workspace 插件、权威 spec（执行期不动，archive 时由 delta 合并）
- **行为变化面**（本机实测对照）：dotfiles 系会话 opc→dotfiles（本 bug）、dsh-plugins 系 dotfiles→dsh-plugins（同一 bug 的第二实例，两工作区根集合作为集合相同故 visible 无差异）；`/tmp`、`~/.cache`、`apigen`、`opc/**`、`/home/docker/**` 等全部不变
- **外部**：dotfiles 仓 `dsh/README.md`「MCP 接入」节待改句（仅列清单）；其他机器上「granted 目录同时是别家 primary」的部署会发生归属迁移（发版说明须点名）
