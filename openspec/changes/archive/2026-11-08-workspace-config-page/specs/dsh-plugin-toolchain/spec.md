# Spec Delta

## MODIFIED Requirements

### Requirement: 内部共享包结构不变式

`tooling/` 下的内部包（build-kit / host-kit / test-kit / contracts / client-kit）MUST 为 private 且版本恒为 `0.0.0`，MUST NOT 进入任何插件的 `dependencies`（仅允许 `devDependencies` 的 `workspace:*` 引用）。发布流程的版本同步与产物重建 MUST 只遍历 `plugins/*`。host-kit MUST 保持零运行时依赖、零 DSH 包导入，其代码经构建期内联进入各消费包产物。client-kit 章程 SHALL 与 host-kit 对偶：client 半共享运行时函数（结构端口探测类纯函数），零运行时依赖、零 DSH 包导入，以 TypeScript 源消费并经构建期内联进入各消费包产物，`scripts` 白名单含 `test`。结构不变式 SHALL 覆盖 AR1–AR8（AR8 守测试接线薄入口与 include 覆盖）。test-kit 章程 SHALL 为「测试夹具 + 测试接线原语」：vitest 不作为运行时依赖、仅允许自测 devDependency，`scripts` 白名单含 `test`。

#### Scenario: 内部包误入 dependencies

- **WHEN** 某插件把 `@dsh-plugins/host-kit` 或 `@dsh-plugins/client-kit` 写入 `dependencies`
- **THEN** 结构检查失败并指明该包；本地 `pnpm install` 本身不报错（workspace 内可解析），失败必须由门禁而非安装暴露

#### Scenario: 发布不含内部包

- **WHEN** 执行发布流程
- **THEN** 版本同步与产物重建只作用于 `plugins/*`，tooling 包版本保持 `0.0.0` 不变

#### Scenario: test-kit 运行时依赖面混入 vitest

- **WHEN** test-kit 的 `dependencies`（非 devDependencies）出现 vitest
- **THEN** 结构检查失败；`./vitest` 工厂模块 import vitest 同样视为违规

#### Scenario: 新增内部包即时纳管

- **WHEN** `tooling/` 下出现新内部包目录（如 client-kit）而其契约未登记进结构门禁
- **THEN** 结构门禁以非零退出失败并点名该包不在治理清单，登记后 `pnpm dsh:check` 通过

#### Scenario: client-kit 源内联

- **WHEN** 检查消费 client-kit 的插件产物
- **THEN** 产物不含 `@dsh-plugins/client-kit` 字样（构建期内联），`dependencies` 不出现该内部包（仅 devDependencies）
