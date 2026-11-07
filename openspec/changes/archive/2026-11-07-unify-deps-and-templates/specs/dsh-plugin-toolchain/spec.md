# dsh-plugin-toolchain Spec Delta

## MODIFIED Requirements

### Requirement: 内部共享包结构不变式

`tooling/` 下的内部包（build-kit / host-kit / test-kit / contracts）MUST 为 private 且版本恒为 `0.0.0`，MUST NOT 进入任何插件的 `dependencies`（仅允许 `devDependencies` 的 `workspace:*` 引用）——违反时检查 MUST 失败，因为 profile 侧 git tag 单目录安装解析不到内部包。发布流程的版本同步与产物重建 MUST 只遍历 `plugins/*`；内部包 MUST NOT 出现在版本契约内。模板素材住在顶层 `templates/<name>/`（默认 `default`），MUST NOT 进入 workspace packages（结构门禁 MUST 同时拒绝 `templates` 与 `templates/*` 两条目）；每个模板目录 MUST NOT 携带 `package.json`，其自述清单 SHALL 为 `template.json`。运行期共享源码包 host-kit MUST 保持零运行时依赖、零 DSH 包导入，其代码经构建期内联进入各消费包产物，消费插件在安装侧 MUST NOT 相互产生依赖。

#### Scenario: 内部包误入 dependencies

- **WHEN** 某插件把 `@dsh-plugins/host-kit` 写入 `dependencies`
- **THEN** 结构检查失败并指明该包；本地 `pnpm install` 本身不报错（workspace 内可解析），失败必须由门禁而非安装暴露

#### Scenario: 发布不含内部包

- **WHEN** 执行发布流程
- **THEN** 版本同步与产物重建只作用于 `plugins/*`，tooling 包版本保持 `0.0.0` 不变

#### Scenario: 模板目录包化被拒

- **WHEN** `pnpm-workspace.yaml` 的 packages 列表出现 `templates` 或 `templates/*` 条目，或某模板目录出现 `package.json`
- **THEN** 结构检查（AR7）失败并报出该条目；模板素材只能经 `pnpm gen:plugin` 消费，不是可安装的包

### Requirement: 脚手架生成开箱合规

`pnpm gen:plugin <name> --kind host-only|dual [--template <name>]` SHALL 从 `templates/<name>/`（缺省 `default`）生成新插件骨架（薄 build.mjs、extends 根基准的 tsconfig、catalog 引用的 devDependencies、含产物断言的测试骨架、cordis.patch.yml、README/AGENTS 段落）；生成物 MUST 开箱通过 lint、typecheck、build、test 与 `pnpm dsh:check` 全部门禁；模板 MUST NOT 含 DSH 族与工具链的版本字面量（一律 catalog 引用，DSH 派生值由基线派生）。模板件套 SHALL 由该目录的 `template.json` 声明（顶层 name/description/files[]，条目键 template/output/format?/only?），生成器加载清单 MUST fail-closed：未知键、缺失素材、未知模板名或非法 kind SHALL 以非零退出码失败并点名原因，MUST NOT 静默忽略或猜测。

#### Scenario: 生成后全绿

- **WHEN** 以任一 kind 生成新插件并依次运行 lint/typecheck/build/test 与 dsh:check
- **THEN** 全部退出码 0，且删除生成目录后 `git status --porcelain` 为空

#### Scenario: 模板携带版本字面量

- **WHEN** 模板素材中出现形如 `"typescript": "^5…"` 的版本字面量
- **THEN** 视为缺陷：与配置单一来源 Requirement 冲突

#### Scenario: 清单负例 fail-closed

- **WHEN** 以 `--template nope` 调用生成器，或某模板 `template.json` 携带未知键（如 `"onlyy"`）或声明了缺失的素材文件
- **THEN** 生成器退出码 1，stderr 点名可用模板/非法键/缺失素材；不写任何文件
