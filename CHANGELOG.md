# CHANGELOG（历史边界摘录）

> **这不是完整发布说明**：版本事实以 [git tag](https://github.com/exponentxqq/dsh-plugins/tags) 为准（`git tag` 列表 + 各 tag 的 release 提交）。本文件只登记**活文档仍在引用的历史边界**（行为断点、目录改名、安装方式变化），供 `README.md` / 各插件 README 链接引用；本文件位于记录域，保留具体版本号不受文档门禁约束。

## v1.1.1（2026-10-11）

- **构建产物 `lib/` 随仓库提交**：各插件产物入库且不再带 `prepare` 脚本，git 来源安装不触发 pnpm 构建脚本授权（唯一例外：multi-root 的注册表依赖 `koffi` 需表态一次，见其排障文档）。此前的版本以 git 来源安装会因构建授权硬失败。

## v1.2.0（2026-10-17）

- **web-ux 双端化**：新增「删除已归档会话」入口与宿主 RPC 通道 `/web-ux`，宿主半从空壳变为实载体；provider 徽章行为零变化。`dsh.client.inject` 同批增补 workspace / connection / locale 依赖。

## v1.2.1（2026-10-17）

- **web-ux 删除入口修复**：改为渲染期解析 `connection` / `workspaces` 服务，修复 v1.2.0 的入口不出现缺陷（早于服务 `provide` 的 `apply` 期读取得到 `undefined`）。

## v1.3.0

- **multi-root 目录改名**：`plugins/multi-root-workspace`（包名 `dsh-plugin-multi-root-workspace` 不变）。pnpm 的 git 依赖锚点含 `&path:`、不随 tag 自动切换——已装旧版的 profile 需按新 path 重新 `add`（旧 tag 配旧 path 仍可装回旧版本）。

## v1.6.0（2026-11-09）

- **web-ux 归档迁移与会话管理**：「移动到归档目录」（`archiveRoot` 可选配置）与「会话管理」（列出 / 清理 / 恢复，通道扩到 7 端点）随本 tag 生效；**本 tag 之前的全部已发布 tag 都没有这两档能力**（回滚即失去），且回滚不搬回已迁移数据。

## 模型目录备忘（zcode-plan）

- 2026-11-23：GLM Coding Plan 上线 1M 上下文旗舰（glm-5.4，支持图片）；glm-5.3 同日曾返回 1305「访问量过大」、其后恢复可用，保留为纯文本回退档。
