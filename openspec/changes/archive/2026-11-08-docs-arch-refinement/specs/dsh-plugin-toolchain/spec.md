# Spec Delta

## ADDED Requirements

### Requirement: 插件文档件套统一

全部七个插件包 SHALL 落在同一套 README 件套规范下（无任何包豁免），规范决策本体由仓级 ADR-0003 承载，本条只约束机器可判定行为。固定必备四节（定位（含端性声明行）/ 安装到 profile / 构建与测试 / 许可）MUST 存在；「如适用」节（配置 / 双端结构 / 已知限制·排障 / 非目标 / 与其他插件的关系）以声明驱动：节存在即 MUST 非空，端性声明为双端时「双端结构」节 MUST 存在、host-only 时 MUST NOT 出现；检查 MUST NOT 断言节顺序或限制自由节。验证证据 MUST 位于各包 `artifacts/` 目录，README 内 MUST NOT 内嵌证据正文。全仓文档语言为中文唯一：`.en.md` 与双语成对规则 MUST NOT 存在。

#### Scenario: 缺必备节被拦截

- **WHEN** 任一插件 README 缺少四个固定必备节之一
- **THEN** 仓级 `docs:check` 以退出码 1 失败，报文点名包名与缺失节名

#### Scenario: 端性声明与双端结构节闭环

- **WHEN** 某 README 端性声明为「双端」但无「双端结构」节，或声明「host-only」却出现该节
- **THEN** `docs:check` 以退出码 1 失败并指出该 README 的端性矛盾

#### Scenario: 验证证据内嵌被拦截

- **WHEN** 某 README 含内嵌验证证据正文而非 `artifacts/` 链接行
- **THEN** `docs:check` 以退出码 1 失败并点名证据应迁往的位置

#### Scenario: 脚手架生成物过文档门禁

- **WHEN** `pnpm gen:plugin <name> --kind host-only|dual` 生成新插件后运行仓级 `docs:check`
- **THEN** 生成物 README 骨架检查通过（host-only 无双端结构节、dual 有），退出码 0

### Requirement: 文档检查共享内核与薄入口

文档检查 SHALL 由共享内核（`scripts/lib/doc-checks.mjs`）单实现 + 双薄入口（multi-root 包内 `docs:check` 与根 `scripts/check-docs.mjs`）提供；薄入口 MUST NOT 持有检查逻辑。multi-root 包内入口输出在双语三项退役后 MUST 与抽取前其余各项逐项一致。仓级入口退出码 MUST 为三值（0 通过 / 1 检查失败 / 2 配置错误），挂点 `node scripts/check-docs.mjs && pnpm -r run docs:check`。内核 MUST 附负测试：运行时构造缺陷样本逐项断言 FAIL、豁免路径断言 PASS，样本 MUST NOT 入库。

#### Scenario: multi-root 薄化入口输出一致

- **WHEN** multi-root 包内 `docs:check` 在共享内核薄化后运行
- **THEN** 其检查项输出与薄化前逐项一致（双语三项退役除外），任何输出差异构成验收失败

#### Scenario: 负测试守门禁自身

- **WHEN** 运行 `node scripts/lib/doc-checks.selftest.mjs`
- **THEN** 五类缺陷样本（断链 / 绝对路径 / 空文档 / 缺骨架节 README / 缺七节 ADR）逐项断言 FAIL、豁免路径断言 PASS，退出码 0

### Requirement: 文档链接与禁项检查语义

仓内文档相对链接目标 MUST 存在；`openspec/changes/archive/` 仅参与链接检查且其断链降级为 warning、不置失败退出码。裸 ADR 编号引用（未带解析路径）在规则自述文件（`AGENTS.md` 与 `docs/decisions/README.md`）之外 MUST 构成失败。绝对路径（Unix home / Windows 用户目录 / `file://` URL）在证据域（`artifacts/`）之外 MUST 构成失败。`docs/decisions/` 下 ADR 文件名 MUST 匹配 `ADR-NNNN-短名.md`，正文骨架为七节子集校验（MUST NOT 要求等集或顺序）。

#### Scenario: 归档内断链降级不阻塞

- **WHEN** `openspec/changes/archive/` 内存在失效相对链接
- **THEN** 仓级 `docs:check` 输出 warning 行但退出码保持 0（除非非归档区另有失败）
