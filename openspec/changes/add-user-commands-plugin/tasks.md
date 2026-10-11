# Tasks

## 1. 骨架

- [ ] 1.1 创建 `plugins/user-commands/` 三件套：`package.json`（name `dsh-plugin-user-commands`、version 1.0.0、`dsh.bundle.patch`、依赖 `yaml`、devDeps cordis / dsh / dsh-agent / dsh-commands / dsh-llm / dsh-workspace / oxlint / typescript / vitest / esbuild / @types/node、exports 仅 `.`、无 `dsh.client`）、`cordis.patch.yml`（insert 单行 `id: user-commands`）、`.gitignore`、`icon.svg`、host-only tsconfig 与 node 环境 vitest 配置、`build.mjs`（esbuild 自包含 bundle，`yaml` 打包、dsh 系外部化）。验证：仓库根 `pnpm install` 纳入新包且 `pnpm --filter dsh-plugin-user-commands typecheck` 通过。

## 2. 发现与解析

- [ ] 2.1 `discovery.ts`：三层目录枚举（用户级 `$DSH_HOME/commands`、各登记工作区根含附加根的 `.dsh/commands`，登记顺序、主根 > 附加根）；目录不存在视为无命令不报错；附加根枚举服务缺席静默降级仅主根。验证：单测覆盖目录缺席、附加根并入、registry 缺席、遍历顺序。
- [ ] 2.2 frontmatter 解析与文法校验：`---` YAML 块仅认 `description`（缺省回退「用户自定义命令 <文件名>」）与 `argument-hint`；未知字段 warn 不跳过；命令名 `^[a-z][a-z0-9_-]*$`；非法 YAML / 非法名 / 空正文 → error + 跳过单文件；子目录忽略 + warn。验证：单测覆盖 frontmatter 三态、文法、空正文、子目录、未知字段。
- [ ] 2.3 同层冲突仲裁：同层同名先到者得（工作区登记顺序、主根 > 附加根），后来者 error 日志含双方来源并跳过，绝不改名。验证：单测覆盖跨工作区按登记顺序与错误日志内容。

## 3. 注册与遮蔽

- [ ] 3.1 全局层：用户级 + 内置命令经 `ctx.inject(['commands'])` 注册；`attribution.ts` 归属判定独立实现（cwd 逐级向上找最近登记根，canonical 比较）。验证：单测覆盖归属命中、子目录归属、无归属。
- [ ] 3.2 agent 层：`agent/created` 时对该会话根集合的项目命令执行 `agent.ctx.inject(['commands'])` 注册（agent 级遮蔽全局同名）；`Map<agent,disposers>` 随 agent dispose 清理；归属失败 fail-closed 只剩全局层。验证：单测覆盖项目遮蔽用户、用户遮蔽内置、无归属只剩全局、agent 清理、跨工作区不串扰。

## 4. 调用语义

- [ ] 4.1 `invocation.ts`：执行期现读文件、`$ARGUMENTS` 全量替换（rawInput trim、无参空串）、`agent.steer(createUserMessage(...))` 提交、返回成功文案；文件不可读返回 error 且不提交部分内容；不声明附件。验证：单测覆盖展开四场景（带参/无参/多处/trim）、现读生效（改文件后下次调用即新内容）、steer 收到展开文本、不可读报错。

## 5. 热刷新

- [ ] 5.1 `watcher.ts`：阶梯监听（用户级与项目级命令目录）+ 250ms 防抖 + 声明式全量重同步（全局层与全部存活会话的项目层）；工作区登记变化触发全量重同步。验证：单测覆盖新增即注册、删除即注销、防抖合并。
- [ ] 5.2 `/commands-reload` 命令：同一 commands inject 内注册，触发全量重同步并返回 加载/更新/移除/跳过 计数。验证：单测覆盖计数文案与降级（无 commands 服务时零注册零报错）。

## 6. 内置 /init

- [ ] 6.1 `builtins.ts`：`/init` 定义（description、`argument-hint: [补充关注点]`、prompt 常量：分析仓库 → 常用命令/目录结构/约定/注意事项 → 已有 AGENTS.md 合并更新不推倒重写 → 简体中文 ≤80 行只写查证事实 → 写主根；尾部 `$ARGUMENTS`；产出即止不追加 TODO）。验证：单测断言定义存在、prompt 含 AGENTS.md/合并更新/80 行/主根要点。

## 7. 文档与接线

- [ ] 7.1 `plugins/user-commands/README.md`：三层来源、文件格式与 frontmatter 字段、`$ARGUMENTS`、遮蔽关系、`/init` 用法、热刷新与 `/commands-reload`、降级说明与安全提示（项目级命令=仓库作者的 prompt 注入面）。验证：与实现一致。
- [ ] 7.2 仓库根 `README.md` 插件表新增一行；dotfiles web profile 依赖与 `dsh.profile.bundles` 增补 `dsh-plugin-user-commands`（link:），容器内重装。验证：`--dump-config` 可加载。

## 8. 验证

- [ ] 8.1 逐插件 `pnpm --filter dsh-plugin-user-commands lint typecheck test build` 全绿；根 `pnpm build && pnpm test` 全绿。
- [ ] 8.2 真机重启后：命令列表含 `/init`；探针会话执行 `/init` 生成主根 `AGENTS.md` 核对内容后删除；临时用户级 + 项目级命令文件验证发现/三层遮蔽/现读/`/commands-reload` 后全部清除；探针会话 archive。
