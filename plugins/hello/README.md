# hello 插件示例

dsh 自定义插件的最小可用模板（官方组合包 bundle 形式）。

## 改造为新插件

1. 复制本目录：`cp -r hello my-plugin && cd my-plugin`
2. 修改 `package.json`：
   - `name` 建议 `dsh-plugin-<name>`（与目录名无关，但保持可读）
   - `version`、`description`
3. 修改 `cordis.patch.yml`：行的 `id`（唯一标识）与 `name`（包名）
4. 修改 `index.js`：实现 `apply(ctx)`，插件加载时调用；`ctx` 上可注册工具、服务、事件等

## 安装

在 dotfiles 仓库根目录执行（容器内路径与宿主一致）：

```bash
cd ~/develop/docker
docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/dotfiles/dsh/plugins/my-plugin
```

安装后重启 profile 即生效；之后改 `index.js` 只需重启 profile（link 安装，无需重装）。

## 说明

- 插件模块为纯 ESM，导出 `name` 与 `apply`（也支持对象、类形式，见官方文档）
- 需要 `tools`、`llm` 等服务时用 `export const inject = ['tools']` 声明依赖
- 插件根目录的 `node_modules` 与 `pnpm-lock.yaml` 由 dsh/pnpm 维护，已被 gitignore
